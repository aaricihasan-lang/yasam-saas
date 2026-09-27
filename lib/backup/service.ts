/**
 * lib/backup/service.ts — Route'ların iş mantığı (next/server'sız; harness doğrudan çağırır).
 * Route dosyaları yalnız kimlik doğrulama + JSON yanıt sarmalayıcısıdır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportFileDate } from "@/lib/time/reportTime";
import { fetchTablePage, planRestore, restoreChunk, type RestoreContext } from "./engine";
import {
  chunkRows,
  computeOverallStatus,
  emptyTableReport,
  addFailure,
  mergeTableReports,
  normalizeBackupFile,
  sortSelfReferencing,
  RESTORE_CHUNK_MAX_ROWS,
} from "./format";
import {
  excludedList,
  getRegistryEntry,
  isExportable,
  moduleKeyOf,
  REGISTRY_HASH,
  topologicalOrder,
} from "./registry";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupPlanResponse,
  type RestoreDecision,
  type RestoreTableReport,
} from "./types";

export type ServiceResult = { status: number; body: unknown };

export function backupFileName(now: Date = new Date()): string {
  return `yasam-yedek-${reportFileDate(undefined, now)}.json`;
}

export function buildBackupPlan(tenantId: string, now: Date = new Date()): BackupPlanResponse {
  return {
    ok: true,
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    registry_hash: REGISTRY_HASH,
    exported_at: now.toISOString(),
    tenant_id: tenantId,
    file_name: backupFileName(now),
    tables: topologicalOrder().map((e) => ({
      table: e.table,
      module: moduleKeyOf(e),
      label: e.label,
      class: e.class,
    })),
    excluded: excludedList(),
  };
}

export async function handleBackupTableRequest(
  db: SupabaseClient,
  tenantId: string,
  name: string | null,
  cursor: string | null,
): Promise<ServiceResult> {
  const e = name ? getRegistryEntry(name) : undefined;
  if (!e || !isExportable(e)) {
    return { status: 400, body: { ok: false, error: "Geçersiz tablo adı." } };
  }
  const page = await fetchTablePage(db, e, tenantId, cursor);
  if (!page.ok && page.error === "Geçersiz cursor.") return { status: 400, body: page };
  return { status: 200, body: page };
}

type PlanBody = { version?: unknown; source_tenant_id?: unknown; tables?: unknown };

export function handleRestorePlan(ctx: RestoreContext, body: PlanBody): ServiceResult {
  if (!body.tables || typeof body.tables !== "object" || Array.isArray(body.tables)) {
    return { status: 400, body: { ok: false, error: "Yedek yapısı geçersiz ('tables' eksik)." } };
  }
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.tables as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length > 128) continue;
    counts[k] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  const source = typeof body.source_tenant_id === "string" ? body.source_tenant_id : null;
  const plan = planRestore(counts, ctx, source);
  return { status: 200, body: { ok: true, ...plan } };
}

type ChunkBody = { table?: unknown; rows?: unknown };

export async function handleRestoreChunk(
  db: SupabaseClient,
  ctx: RestoreContext,
  body: ChunkBody,
): Promise<ServiceResult> {
  const table = typeof body.table === "string" ? body.table : "";
  if (!table || table.length > 128) return { status: 400, body: { ok: false, error: "Tablo adı eksik." } };
  if (!Array.isArray(body.rows)) return { status: 400, body: { ok: false, error: "Satır listesi eksik." } };
  if (body.rows.length > RESTORE_CHUNK_MAX_ROWS * 2) {
    return { status: 413, body: { ok: false, error: `Parça en fazla ${RESTORE_CHUNK_MAX_ROWS * 2} satır olabilir.` } };
  }
  const report = await restoreChunk(db, ctx, table, body.rows);
  return { status: 200, body: { ok: true, report } };
}

export type FullRestoreResult = {
  ok: true;
  status: ReturnType<typeof computeOverallStatus>;
  tables: RestoreTableReport[];
  skipped: RestoreDecision[];
  notes: string[];
  /** Eski istemci uyumu (v1 özet biçimi). */
  summary: Record<string, { inserted: number; skipped: number; error: string | null }>;
};

/** Eski tek-gövde istek (`{ backup }`): küçük yedekler için sunucuda parça parça işlenir. */
export async function handleFullRestore(db: SupabaseClient, ctx: RestoreContext, backup: unknown): Promise<ServiceResult> {
  const norm = normalizeBackupFile(backup);
  if (!norm.ok) return { status: 400, body: { ok: false, error: norm.error } };
  const b = norm.backup;
  const counts: Record<string, number> = {};
  for (const [t, rows] of Object.entries(b.tables)) counts[t] = rows.length;
  const plan = planRestore(counts, ctx, b.sourceTenantId);
  const tables: RestoreTableReport[] = [];
  const skipped: RestoreDecision[] = [];
  const probeCache = new Map<string, Map<string, boolean>>();
  for (const d of plan.decisions) {
    const rows = b.tables[d.table] ?? [];
    if (d.action === "skip") {
      skipped.push(d);
      if (d.reason === "unlicensed" || d.reason === "membership_inactive") {
        const r = emptyTableReport(d.table, d.module, rows.length);
        r.skipped_unlicensed = rows.length;
        r.status = "SKIPPED";
        r.warnings.push(d.detail);
        tables.push(r);
      }
      continue;
    }
    const e = getRegistryEntry(d.table)!;
    const pk = e.pk.find((c) => c !== "tenant_id");
    const ordered = e.selfRef && pk ? sortSelfReferencing(rows, pk, e.selfRef) : rows;
    let agg = emptyTableReport(d.table, d.module, 0);
    for (const chunk of chunkRows(ordered)) {
      if (chunk.oversized) {
        const r = emptyTableReport(d.table, d.module, 1);
        addFailure(r, "row_too_large", []);
        agg = mergeTableReports(agg, r);
        continue;
      }
      const r = await restoreChunk(db, ctx, d.table, chunk.rows, probeCache);
      agg = mergeTableReports(agg, r);
    }
    tables.push(agg);
  }
  const summary: FullRestoreResult["summary"] = {};
  for (const r of tables) {
    const failed = r.failed.reduce((s, f) => s + f.count, 0);
    summary[r.table] = {
      inserted: r.inserted,
      skipped: r.already_present + r.skipped_unlicensed + r.parent_missing + failed,
      error: failed > 0 ? r.failed.map((f) => f.code).join(", ") : null,
    };
  }
  const result: FullRestoreResult = {
    ok: true,
    status: computeOverallStatus(tables),
    tables,
    skipped,
    notes: plan.notes,
    summary,
  };
  return { status: 200, body: result };
}
