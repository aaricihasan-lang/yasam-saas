/**
 * lib/backup/format.ts — Yedek dosyası normalize etme, parçalama ve rapor birleştirme (SAF).
 * Hem Ayarlar sayfası (istemci orkestrasyonu) hem sunucu (eski tek-gövde restore) kullanır.
 */
import {
  ACCEPTED_BACKUP_VERSIONS,
  BACKUP_FORMAT,
  type RestoreOverallStatus,
  type RestoreTableReport,
} from "./types";

export type NormalizedBackup = {
  version: string;
  sourceTenantId: string | null;
  /** tablo → satırlar (sıra dosyadaki gibi). */
  tables: Record<string, Record<string, unknown>[]>;
  /** v3.0: dosyada eksik işaretli tablolar (complete:false) ve hata metinleri. */
  incompleteTables: { table: string; error: string | null }[];
  registryHash: string | null;
  exportedAt: string | null;
};

export type NormalizeResult = { ok: true; backup: NormalizedBackup } | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 1.0 / 2.0 / 2.1 (tables[t] = satır dizisi) ve 3.0 (tables[t].rows) biçimlerini tek şekle indirger. */
export function normalizeBackupFile(parsed: unknown): NormalizeResult {
  if (!isPlainObject(parsed)) return { ok: false, error: "Yedek dosyası geçersiz (JSON nesnesi değil)." };
  const version = typeof parsed.version === "string" ? parsed.version : String(parsed.version ?? "");
  if (!(ACCEPTED_BACKUP_VERSIONS as readonly string[]).includes(version)) {
    return { ok: false, error: `Desteklenmeyen yedek sürümü: ${version || "(yok)"}` };
  }
  if (version === "3.0" && parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: "Yedek dosyası biçimi tanınmadı (format alanı eksik/yanlış)." };
  }
  if (!isPlainObject(parsed.tables)) return { ok: false, error: "Yedek yapısı geçersiz ('tables' alanı eksik)." };

  const tables: Record<string, Record<string, unknown>[]> = {};
  const incompleteTables: { table: string; error: string | null }[] = [];
  for (const [name, value] of Object.entries(parsed.tables)) {
    let rows: unknown;
    if (version === "3.0") {
      if (!isPlainObject(value)) {
        incompleteTables.push({ table: name, error: "Tablo bölümü geçersiz." });
        continue;
      }
      rows = value.rows;
      if (value.complete === false) {
        incompleteTables.push({ table: name, error: typeof value.error === "string" ? value.error : null });
      }
    } else {
      rows = value;
    }
    if (!Array.isArray(rows)) {
      incompleteTables.push({ table: name, error: "Satır listesi geçersiz." });
      tables[name] = [];
      continue;
    }
    tables[name] = rows as Record<string, unknown>[];
  }
  return {
    ok: true,
    backup: {
      version,
      sourceTenantId: typeof parsed.tenant_id === "string" ? parsed.tenant_id : null,
      tables,
      incompleteTables,
      registryHash: typeof parsed.registry_hash === "string" ? parsed.registry_hash : null,
      exportedAt: typeof parsed.exported_at === "string" ? parsed.exported_at : null,
    },
  };
}

// ─── Parçalama ───────────────────────────────────────────────────────────────

export const RESTORE_CHUNK_MAX_ROWS = 200;
/** Vercel gövde sınırı 4.5 MB; güvenli pay bırakılır. */
export const RESTORE_CHUNK_MAX_BYTES = 1_500_000;
export const RESTORE_ROW_MAX_BYTES = 3_500_000;

export type RowChunk = { rows: Record<string, unknown>[]; oversized: boolean };

/** Satırları satır sayısı ve JSON boyutuna göre parçalar. Tek başına sınırı aşan satır ayrı "oversized" parça olur. */
export function chunkRows(
  rows: Record<string, unknown>[],
  maxRows = RESTORE_CHUNK_MAX_ROWS,
  maxBytes = RESTORE_CHUNK_MAX_BYTES,
): RowChunk[] {
  const out: RowChunk[] = [];
  let cur: Record<string, unknown>[] = [];
  let bytes = 0;
  for (const row of rows) {
    let size = 0;
    try {
      size = JSON.stringify(row ?? null).length;
    } catch {
      size = RESTORE_ROW_MAX_BYTES + 1;
    }
    if (size > RESTORE_ROW_MAX_BYTES) {
      if (cur.length) out.push({ rows: cur, oversized: false });
      cur = [];
      bytes = 0;
      out.push({ rows: [row], oversized: true });
      continue;
    }
    if (cur.length >= maxRows || (cur.length > 0 && bytes + size > maxBytes)) {
      out.push({ rows: cur, oversized: false });
      cur = [];
      bytes = 0;
    }
    cur.push(row);
    bytes += size;
  }
  if (cur.length) out.push({ rows: cur, oversized: false });
  return out;
}

/** Kendine referanslı tabloda satırları ebeveyn-önce sıralar (aynı dosyadaki ebeveynler için). */
export function sortSelfReferencing(
  rows: Record<string, unknown>[],
  pkCol: string,
  selfCol: string,
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) if (r && r[pkCol] != null) byId.set(String(r[pkCol]), r);
  const placed = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const visit = (r: Record<string, unknown>, depth: number) => {
    const id = r && r[pkCol] != null ? String(r[pkCol]) : null;
    if (id && placed.has(id)) return;
    const parentId = r ? r[selfCol] : null;
    if (depth < 64 && parentId != null && byId.has(String(parentId)) && String(parentId) !== id) {
      visit(byId.get(String(parentId))!, depth + 1);
    }
    if (id) placed.add(id);
    out.push(r);
  };
  for (const r of rows) visit(r, 0);
  return out;
}

// ─── Rapor ───────────────────────────────────────────────────────────────────

export function emptyTableReport(table: string, module: string | null, expected = 0): RestoreTableReport {
  return {
    table,
    module,
    expected,
    inserted: 0,
    already_present: 0,
    skipped_unlicensed: 0,
    parent_missing: 0,
    failed: [],
    dropped_columns: [],
    fk_nulled: 0,
    storage_refs_removed: 0,
    warnings: [],
    status: "COMPLETE",
  };
}

export function addFailure(r: RestoreTableReport, code: string, ids: string[], count = ids.length || 1): void {
  let f = r.failed.find((x) => x.code === code);
  if (!f) {
    f = { code, count: 0, sample_ids: [] };
    r.failed.push(f);
  }
  f.count += count;
  for (const id of ids) if (f.sample_ids.length < 5 && id && !f.sample_ids.includes(id)) f.sample_ids.push(id);
}

export function failedCount(r: RestoreTableReport): number {
  return r.failed.reduce((s, f) => s + f.count, 0);
}

export function computeTableStatus(r: RestoreTableReport): RestoreTableReport["status"] {
  const ok = r.inserted + r.already_present;
  if (r.expected === 0) return r.skipped_unlicensed > 0 ? "SKIPPED" : "COMPLETE";
  if (r.skipped_unlicensed >= r.expected) return "SKIPPED";
  if (ok === r.expected && failedCount(r) === 0 && r.parent_missing === 0) return "COMPLETE";
  if (ok === 0) return "FAILED";
  return "PARTIAL";
}

export function mergeTableReports(a: RestoreTableReport, b: RestoreTableReport): RestoreTableReport {
  const out: RestoreTableReport = {
    ...a,
    expected: a.expected + b.expected,
    inserted: a.inserted + b.inserted,
    already_present: a.already_present + b.already_present,
    skipped_unlicensed: a.skipped_unlicensed + b.skipped_unlicensed,
    parent_missing: a.parent_missing + b.parent_missing,
    fk_nulled: a.fk_nulled + b.fk_nulled,
    storage_refs_removed: (a.storage_refs_removed ?? 0) + (b.storage_refs_removed ?? 0),
    failed: a.failed.map((f) => ({ ...f, sample_ids: [...f.sample_ids] })),
    dropped_columns: [...new Set([...a.dropped_columns, ...b.dropped_columns])],
    warnings: [...new Set([...a.warnings, ...b.warnings])],
  };
  for (const f of b.failed) addFailure(out, f.code, f.sample_ids, f.count);
  out.status = computeTableStatus(out);
  return out;
}

/** Genel durum: tüm tablolar COMPLETE → COMPLETE; hiçbir şey eklenmemiş/mevcut değil ve hata var → FAILED. */
export function computeOverallStatus(reports: RestoreTableReport[]): RestoreOverallStatus {
  const relevant = reports.filter((r) => r.expected > 0);
  if (relevant.length === 0) return "COMPLETE";
  if (relevant.every((r) => r.status === "COMPLETE")) return "COMPLETE";
  const anyOk = relevant.some((r) => r.inserted + r.already_present > 0);
  return anyOk ? "PARTIAL" : "FAILED";
}

export const FAILURE_LABELS: Readonly<Record<string, string>> = {
  id_conflict_other_tenant: "Aynı kimlikli kayıt başka bir hesapta var (ID yeniden eşleme yapılmaz)",
  foreign_storage_path: "Başka hesaba ait dosya yolu",
  fk_violation: "Bağlı kayıt veritabanında bulunamadı",
  unique_conflict: "Aynı anahtarla farklı bir kayıt zaten var",
  check_violation: "Geçersiz alan değeri (kural ihlali)",
  invalid_value: "Geçersiz alan değeri",
  unknown_column: "Tanınmayan alan",
  missing_pk: "Kayıt kimliği eksik",
  invalid_row: "Geçersiz satır",
  duplicate_in_backup: "Yedekte aynı kimlik birden fazla kez var",
  row_too_large: "Kayıt tek parçada gönderilemeyecek kadar büyük",
  request_failed: "Sunucuya gönderilemedi",
  insert_error: "Veritabanı ekleme hatası",
};
