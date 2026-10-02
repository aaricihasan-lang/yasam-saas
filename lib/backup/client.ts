/**
 * lib/backup/client.ts — İstemci orkestrasyonu (SAF; fetch enjekte edilir).
 *
 * Yedek: plan → her tablo için BOŞ sayfa gelene kadar `GET /api/settings/backup/table` → dosya
 * istemcide birleştirilir (tek büyük sunucu yanıtı / 4.5 MB / zaman aşımı sorunu yok).
 * Geri yükleme: plan (`POST /api/settings/restore {mode:"plan"}`) → topolojik sırada parçalar
 * (`POST /api/settings/restore/chunk`) → rapor birleştirilir.
 */
import {
  addFailure,
  chunkRows,
  computeOverallStatus,
  emptyTableReport,
  mergeTableReports,
  sortSelfReferencing,
  type NormalizedBackup,
} from "./format";
import { getRegistryEntry } from "./registry";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFileV3,
  type BackupStoredFile,
  type BackupPageResponse,
  type BackupPlanResponse,
  type RestoreDecision,
  type RestoreOverallStatus,
  type RestoreTableReport,
} from "./types";

export type JsonResponse = { ok: boolean; status: number; json: unknown };
export type JsonFetcher = (url: string, init?: { method?: "GET" | "POST"; body?: unknown }) => Promise<JsonResponse>;

export type BackupProgress = { table: string; label: string; index: number; total: number; rows: number };

export type BackupRunResult = {
  file: BackupFileV3;
  fileName: string;
  incomplete: { table: string; label: string; expected: number | null; rows: number; error: string | null }[];
  /** P2-11: gömülü Human Design dosyaları özeti. */
  hdFiles?: { expected: number | null; included: number; error: string | null };
};

const MAX_PAGES_PER_TABLE = 100_000;

function errorOf(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string") {
    return (json as { error: string }).error;
  }
  return fallback;
}

export async function runBackup(fetcher: JsonFetcher, onProgress?: (p: BackupProgress) => void): Promise<BackupRunResult> {
  const planRes = await fetcher("/api/settings/backup");
  if (!planRes.ok) throw new Error(errorOf(planRes.json, "Yedek planı alınamadı."));
  const plan = planRes.json as BackupPlanResponse;

  const tables: BackupFileV3["tables"] = {};
  const incomplete: BackupRunResult["incomplete"] = [];
  let index = 0;
  for (const t of plan.tables) {
    index++;
    const rows: Record<string, unknown>[] = [];
    let expected: number | null = null;
    const errors: string[] = [];
    let cursor: string | null = null;
    let finished = false;
    for (let page = 0; page < MAX_PAGES_PER_TABLE; page++) {
      const url: string =
        `/api/settings/backup/table?name=${encodeURIComponent(t.table)}` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      let res: JsonResponse;
      try {
        res = await fetcher(url);
      } catch {
        errors.push("Bağlantı hatası");
        break;
      }
      const body = res.json as BackupPageResponse | null;
      if (!res.ok || !body) {
        errors.push(errorOf(res.json, `Sunucu hatası (${res.status})`));
        break;
      }
      if (page === 0 && body.expected_count !== undefined) expected = body.expected_count ?? null;
      if (body.error) errors.push(body.error);
      rows.push(...(body.rows ?? []));
      onProgress?.({ table: t.table, label: t.label, index, total: plan.tables.length, rows: rows.length });
      if (body.done) {
        finished = true;
        break;
      }
      if (!body.ok) break;
      if (!body.next_cursor || body.next_cursor === cursor) {
        errors.push("Sayfalama ilerlemedi");
        break;
      }
      cursor = body.next_cursor;
    }
    if (!finished && errors.length === 0) errors.push("Tablo tamamlanamadı");
    const error = errors.length ? [...new Set(errors)].join(" · ") : null;
    // Tamlık: boş sayfaya kadar okundu + hata yok + okunan satır == head count.
    // (Sayım farkı, ör. yedek sırasında kayıt eklendi/silindi → dürüstçe eksik işaretlenir.)
    let complete = finished && error === null && expected !== null && rows.length === expected;
    let finalError = error;
    if (finished && error === null && expected !== null && rows.length !== expected) {
      finalError = `Sayım uyuşmazlığı: beklenen ${expected}, okunan ${rows.length}`;
      complete = false;
    } else if (finished && error === null && expected === null) {
      finalError = "Beklenen kayıt sayısı alınamadı";
      complete = false;
    }
    tables[t.table] = { module: t.module, expected_count: expected, row_count: rows.length, complete, error: finalError, rows };
    if (!complete) incomplete.push({ table: t.table, label: t.label, expected, rows: rows.length, error: finalError });
  }

  // P2-11: Human Design dosyaları (harita görseli + profesyonel rapor görsel snapshot'ı).
  const hd = await backupHdFiles(fetcher, (rows, total) =>
    onProgress?.({ table: HD_FILES_KEY, label: HD_FILES_LABEL, index: plan.tables.length, total: plan.tables.length, rows: Math.min(rows, total) }),
  );
  if (hd.error !== null) {
    incomplete.push({ table: HD_FILES_KEY, label: HD_FILES_LABEL, expected: hd.expected, rows: hd.files.length, error: hd.error });
  }

  const file: BackupFileV3 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    registry_hash: plan.registry_hash,
    exported_at: plan.exported_at,
    tenant_id: plan.tenant_id,
    // Dosya gömüldüyse kapsam bunu dürüstçe söyler; HD dosyası yoksa eski kapsam değeri korunur.
    scope: hd.files.length > 0 ? "database_records_and_hd_files" : "database_records_only",
    files_included: hd.files.length > 0,
    complete: incomplete.length === 0,
    tables,
    excluded: plan.excluded,
    files: hd.files,
  };
  return { file, fileName: plan.file_name, incomplete, hdFiles: { expected: hd.expected, included: hd.files.length, error: hd.error } };
}

export const HD_FILES_KEY = "hd_files";
export const HD_FILES_LABEL = "Human Design görselleri";

type HdFileListItem = { bucket: string; path: string; content_type: string };
type HdFilePartBody = { ok?: boolean; parts?: number; size?: number; sha256?: string; content_type?: string; data_base64?: string; error?: string };

/** HD dosyalarını parça parça okuyup gömer. Okunamayan dosya = yedek EKSİK (dürüst). */
async function backupHdFiles(
  fetcher: JsonFetcher,
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: BackupStoredFile[]; expected: number | null; error: string | null }> {
  let listRes: JsonResponse;
  try {
    listRes = await fetcher("/api/settings/backup/files");
  } catch {
    return { files: [], expected: null, error: "Dosya listesi alınamadı (bağlantı)." };
  }
  const list = listRes.json as { ok?: boolean; files?: HdFileListItem[] } | null;
  if (!listRes.ok || !list?.ok || !Array.isArray(list.files)) {
    return { files: [], expected: null, error: errorOf(listRes.json, "Dosya listesi alınamadı.") };
  }
  const files: BackupStoredFile[] = [];
  const errors: string[] = [];
  for (const f of list.files) {
    let data = "";
    let meta: HdFilePartBody | null = null;
    let failed = false;
    for (let part = 0; part < 32; part++) {
      let res: JsonResponse;
      try {
        res = await fetcher(`/api/settings/backup/files?path=${encodeURIComponent(f.path)}&part=${part}`);
      } catch {
        failed = true;
        break;
      }
      const body = res.json as HdFilePartBody | null;
      if (!res.ok || !body?.ok || typeof body.data_base64 !== "string") {
        errors.push(`${f.path}: ${errorOf(res.json, `HTTP ${res.status}`)}`);
        failed = true;
        break;
      }
      meta = body;
      data += body.data_base64;
      if (part + 1 >= (body.parts ?? 1)) break;
    }
    if (failed || !meta) {
      if (!failed) errors.push(`${f.path}: okunamadı`);
      continue;
    }
    files.push({
      module: "human_design",
      bucket: f.bucket,
      path: f.path,
      content_type: meta.content_type ?? f.content_type,
      size: meta.size ?? 0,
      sha256: meta.sha256 ?? "",
      data_base64: data,
    });
    onProgress?.(files.length, list.files.length);
  }
  return {
    files,
    expected: list.files.length,
    error: errors.length ? `${errors.length} dosya okunamadı (${errors.slice(0, 3).join(" · ")})` : null,
  };
}

/** Büyük JSON'u tek dev string yerine tablo tablo parçalar (Blob parçaları). */
export function serializeBackupParts(file: BackupFileV3): string[] {
  const { tables, ...head } = file;
  const parts: string[] = [];
  const headJson = JSON.stringify(head);
  parts.push(headJson.slice(0, -1) + ',"tables":{');
  const names = Object.keys(tables);
  names.forEach((name, i) => {
    parts.push(`${JSON.stringify(name)}:${JSON.stringify(tables[name])}${i < names.length - 1 ? "," : ""}`);
  });
  parts.push("}}");
  return parts;
}

// ─── Geri yükleme ────────────────────────────────────────────────────────────

export type RestoreProgress = { table: string; index: number; total: number; sentRows: number; totalRows: number };

export type RestoreRunResult = {
  status: RestoreOverallStatus;
  tables: RestoreTableReport[];
  skipped: RestoreDecision[];
  notes: string[];
};

export async function runRestore(
  backup: NormalizedBackup,
  fetcher: JsonFetcher,
  onProgress?: (p: RestoreProgress) => void,
): Promise<RestoreRunResult> {
  const counts: Record<string, number> = {};
  for (const [t, rows] of Object.entries(backup.tables)) counts[t] = rows.length;
  const planRes = await fetcher("/api/settings/restore", {
    method: "POST",
    body: { mode: "plan", version: backup.version, source_tenant_id: backup.sourceTenantId, tables: counts },
  });
  if (!planRes.ok) throw new Error(errorOf(planRes.json, "Geri yükleme planı alınamadı."));
  const plan = planRes.json as { decisions: RestoreDecision[]; notes: string[] };

  const reports: RestoreTableReport[] = [];
  const skipped: RestoreDecision[] = [];
  const toRestore = plan.decisions.filter((d) => d.action === "restore");
  let index = 0;
  for (const d of plan.decisions) {
    const rows = backup.tables[d.table] ?? [];
    if (d.action === "skip") {
      skipped.push(d);
      if ((d.reason === "unlicensed" || d.reason === "membership_inactive") && rows.length > 0) {
        const r = emptyTableReport(d.table, d.module, rows.length);
        r.skipped_unlicensed = rows.length;
        r.status = "SKIPPED";
        r.warnings.push(d.detail);
        reports.push(r);
      }
      continue;
    }
    index++;
    const e = getRegistryEntry(d.table);
    const pk = e?.pk.find((c) => c !== "tenant_id");
    const ordered = e?.selfRef && pk ? sortSelfReferencing(rows, pk, e.selfRef) : rows;
    let agg = emptyTableReport(d.table, d.module, 0);
    let sent = 0;
    for (const chunk of chunkRows(ordered)) {
      sent += chunk.rows.length;
      if (chunk.oversized) {
        const r = emptyTableReport(d.table, d.module, 1);
        const id = chunk.rows[0] && pk ? String((chunk.rows[0] as Record<string, unknown>)[pk] ?? "") : "";
        addFailure(r, "row_too_large", id ? [id] : []);
        agg = mergeTableReports(agg, r);
        continue;
      }
      let res: JsonResponse | null = null;
      try {
        res = await fetcher("/api/settings/restore/chunk", { method: "POST", body: { table: d.table, rows: chunk.rows } });
      } catch {
        res = null;
      }
      const report = res && res.ok ? (res.json as { report?: RestoreTableReport }).report : undefined;
      if (!report) {
        const r = emptyTableReport(d.table, d.module, chunk.rows.length);
        const ids = pk ? chunk.rows.map((x) => String((x as Record<string, unknown>)[pk] ?? "")).filter(Boolean) : [];
        addFailure(r, "request_failed", ids, chunk.rows.length);
        if (res) r.warnings.push(errorOf(res.json, `Sunucu hatası (${res.status})`));
        agg = mergeTableReports(agg, r);
      } else {
        agg = mergeTableReports(agg, report);
      }
      onProgress?.({ table: d.table, index, total: toRestore.length, sentRows: sent, totalRows: rows.length });
    }
    if (rows.length === 0) agg.status = "COMPLETE";
    reports.push(agg);
  }
  // P2-11: gömülü Human Design dosyaları (DB satırlarından SONRA; insert-only, doğrulamalı).
  if (backup.files.length > 0) reports.push(await restoreHdFiles(backup.files, fetcher));
  return { status: computeOverallStatus(reports), tables: reports, skipped, notes: plan.notes ?? [] };
}

/** base64 parça boyutu (4'ün katı → her parça bağımsız çözülebilir; sunucu ≤1.398.100 kabul eder). */
const HD_RESTORE_PART_CHARS = 1_398_100;

function newUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function restoreHdFiles(files: BackupStoredFile[], fetcher: JsonFetcher): Promise<RestoreTableReport> {
  const report = emptyTableReport(HD_FILES_KEY, "human_design", files.length);
  let planRes: JsonResponse | null = null;
  try {
    planRes = await fetcher("/api/settings/restore/files", {
      method: "POST",
      body: { mode: "plan", files: files.map((f) => ({ bucket: f.bucket, path: f.path, size: f.size, sha256: f.sha256 })) },
    });
  } catch {
    planRes = null;
  }
  const decisions = (planRes?.json as { decisions?: { path: string; action: string; reason?: string }[] } | null)?.decisions;
  if (!planRes?.ok || !Array.isArray(decisions)) {
    addFailure(report, "request_failed", [], files.length);
    report.warnings.push(errorOf(planRes?.json, "Dosya geri yükleme planı alınamadı."));
    report.status = "FAILED";
    return report;
  }
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const d of decisions) {
    const f = byPath.get(d.path);
    if (!f) continue;
    if (d.action === "exists") {
      report.already_present++;
      continue;
    }
    if (d.action === "skip") {
      if (d.reason === "unlicensed") report.skipped_unlicensed++;
      else addFailure(report, d.reason === "foreign_tenant" ? "foreign_storage_path" : `file_${d.reason ?? "skipped"}`, [d.path]);
      continue;
    }
    const uploadId = newUploadId();
    const parts = Math.max(1, Math.ceil(f.data_base64.length / HD_RESTORE_PART_CHARS));
    let ok = true;
    for (let i = 0; i < parts && ok; i++) {
      const chunk = f.data_base64.slice(i * HD_RESTORE_PART_CHARS, (i + 1) * HD_RESTORE_PART_CHARS);
      try {
        const r = await fetcher("/api/settings/restore/files", {
          method: "POST",
          body: { mode: "part", path: f.path, upload_id: uploadId, index: i, data_base64: chunk },
        });
        ok = r.ok;
      } catch {
        ok = false;
      }
    }
    let result: string | undefined;
    if (ok) {
      try {
        const r = await fetcher("/api/settings/restore/files", {
          method: "POST",
          body: { mode: "commit", path: f.path, upload_id: uploadId, parts, size: f.size, sha256: f.sha256 },
        });
        ok = r.ok;
        result = (r.json as { result?: string } | null)?.result;
        if (!r.ok) report.warnings.push(errorOf(r.json, "Dosya doğrulanamadı."));
      } catch {
        ok = false;
      }
    }
    if (!ok) addFailure(report, "file_restore_failed", [d.path]);
    else if (result === "exists") report.already_present++;
    else report.inserted++;
  }
  report.status = report.failed.length > 0 ? (report.inserted + report.already_present > 0 ? "PARTIAL" : "FAILED") : "COMPLETE";
  return report;
}
