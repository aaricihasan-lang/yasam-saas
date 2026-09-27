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

  const file: BackupFileV3 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    registry_hash: plan.registry_hash,
    exported_at: plan.exported_at,
    tenant_id: plan.tenant_id,
    scope: "database_records_only",
    files_included: false,
    complete: incomplete.length === 0,
    tables,
    excluded: plan.excluded,
  };
  return { file, fileName: plan.file_name, incomplete };
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
  return { status: computeOverallStatus(reports), tables: reports, skipped, notes: plan.notes ?? [] };
}
