// HD — "ANALİZİ SİL": YALNIZ seçilen Human Design analizi (server-only, service_role).
//
// Kapsam (owner kararı 2026-10-16):
//   • Silinir: seçilen analiz satırı + YALNIZ bu analize bağlı Word raporları (aynı profile ait ya da
//     profilsiz) + bu raporların KENDİ donmuş görselleri ({tenant}/report-snapshots/{raporId}.*).
//   • Korunur: aynı danışanın diğer analizleri, HD profili, profilin ortak görsel klasörü, başka
//     profile ait raporlar, Danışan Yolculuğu ve diğer modüllerin verileri.
// Güvenlik / tutarlılık (migration GEREKTİRMEZ):
//   • Her sorgu tenant-scoped (withTenant); kimlik istemciden yalnız UUID olarak gelir, sahiplik sunucuda.
//   • Analiz yoksa 404 — "başarı" dönmez. `expectReports` (onayda gösterilen sayı) aşıldıysa 409, hiçbir
//     şey silinmez. Sıra: raporlar → analiz → storage. Ara hatada analiz yerinde kalır; aynı istek
//     tekrarlanınca kalanlar tamamlanır (idempotent). Storage hatası DB'yi geri almaz → uyarı + yetim
//     telafisi (cleanupOrphanHdImages).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import { HD_REPORT_SNAPSHOT_DIR, isOwnedReportSnapshotPath } from "./chartImagePath";
import { cleanupOrphanHdImages, removeHdStorageObjects } from "./hdStorage";

const CHARTS = "human_design_charts";
const REPORTS = "human_design_reports";

type ChartLite = { id: string; client_id: string | null; source: string | null; birth_date: string | null; birth_time: string | null; created_at: string };
type ReportLite = { id: string; client_id: string | null; storagePath?: string | null };

export type HdAnalysisDeleteScope = {
  chartId: string;
  hdClientId: string | null;
  kind: "computed" | "manual";
  birthDate: string | null;
  birthTime: string | null;
  createdAt: string;
  reports: number;
  keptForeignReports: number;
};

type Fail = { ok: false; status: 400 | 404 | 409 | 500; code: string; error: string };

async function plan(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
  source: "computed" | "manual" | "any",
): Promise<{ ok: true; chart: ChartLite; reports: ReportLite[]; foreign: number } | Fail> {
  const { data: c, error: cErr } = await withTenant(
    db.from(CHARTS).select("id, client_id, source, birth_date, birth_time, created_at"),
    tenantId,
    "hdAnalysisDelete.chart",
  )
    .eq("id", chartId)
    .maybeSingle();
  if (cErr) return { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("hdAnalysisDelete.chart", cErr) };
  const chart = c as ChartLite | null;
  const isComputed = chart?.source === "computed";
  if (!chart || (source === "computed" && !isComputed) || (source === "manual" && isComputed)) {
    return { ok: false, status: 404, code: "NOT_FOUND", error: "Silinecek analiz bulunamadı veya erişim izniniz yok." };
  }
  const { data: r, error: rErr } = await withTenant(
    db.from(REPORTS).select("id, client_id, snapshot->chartImage->>storagePath"),
    tenantId,
    "hdAnalysisDelete.reports",
  ).eq("chart_id", chartId);
  if (rErr) return { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("hdAnalysisDelete.reports", rErr) };
  const all = (r ?? []) as unknown as ReportLite[];
  // Başka profile ait rapor bu analize bağlı görünse bile silinmez (profil silme ile aynı kural).
  const mine = all.filter((x) => x.client_id === null || x.client_id === chart.client_id);
  return { ok: true, chart, reports: mine, foreign: all.length - mine.length };
}

/** Onay penceresi için KESİN kapsam (salt okunur). */
export async function previewHdAnalysisDelete(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
): Promise<({ ok: true } & HdAnalysisDeleteScope) | Fail> {
  const p = await plan(db, tenantId, chartId, "any");
  if (!p.ok) return p;
  return {
    ok: true,
    chartId,
    hdClientId: p.chart.client_id,
    kind: p.chart.source === "computed" ? "computed" : "manual",
    birthDate: p.chart.birth_date,
    birthTime: p.chart.birth_time,
    createdAt: p.chart.created_at,
    reports: p.reports.length,
    keptForeignReports: p.foreign,
  };
}

export type DeleteHdAnalysisResult =
  | { ok: true; deletedReports: number; warnings: string[] }
  | Fail;

export async function deleteHdAnalysis(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
  opts: { source?: "computed" | "manual" | "any"; expectReports?: number } = {},
): Promise<DeleteHdAnalysisResult> {
  const p = await plan(db, tenantId, chartId, opts.source ?? "any");
  if (!p.ok) return p;
  if (typeof opts.expectReports === "number" && p.reports.length > opts.expectReports) {
    return {
      ok: false,
      status: 409,
      code: "DELETE_SCOPE_CHANGED",
      error: "Bu analize bağlı raporlar onaydan sonra değişti. Hiçbir şey silinmedi; lütfen silmeyi yeniden onaylayın.",
    };
  }
  const reportIds = p.reports.map((x) => x.id);
  if (reportIds.length > 0) {
    const { error } = await withTenant(db.from(REPORTS).delete(), tenantId, "hdAnalysisDelete.deleteReports").in("id", reportIds);
    if (error) {
      console.error("[hd-analysis-delete] raporlar silinemedi:", hdSafeDbError("hdAnalysisDelete.deleteReports", error));
      return { ok: false, status: 500, code: "DELETE_INCOMPLETE", error: "Bu analizin raporları silinemedi; analiz silinmedi. Lütfen tekrar deneyin." };
    }
  }
  const { data: del, error: dErr } = await withTenant(db.from(CHARTS).delete(), tenantId, "hdAnalysisDelete.deleteChart")
    .eq("id", chartId)
    .select("id");
  if (dErr) {
    console.error("[hd-analysis-delete] analiz silinemedi:", hdSafeDbError("hdAnalysisDelete.deleteChart", dErr));
    return { ok: false, status: 500, code: "DELETE_INCOMPLETE", error: "Raporlar silindi ancak analiz silinemedi. \"Analizi Sil\" ile tekrar deneyebilirsiniz." };
  }
  if (!del || del.length === 0) {
    return { ok: false, status: 404, code: "NOT_FOUND", error: "Silinecek analiz bulunamadı veya erişim izniniz yok." };
  }

  // Storage (DB'den SONRA): yalnız silinen raporların KENDİ donmuş görselleri. Profilin ortak klasörü
  // (başka analiz/raporların da kullanabileceği yükleme) BURADA silinmez.
  const warnings: string[] = [];
  if (p.foreign > 0) warnings.push("foreign_reports_kept");
  const own = p.reports
    .map((x) => (typeof x.storagePath === "string" ? x.storagePath.trim() : ""))
    .filter((path, i) => isOwnedReportSnapshotPath(path, tenantId) && path.startsWith(`${tenantId}/${HD_REPORT_SNAPSHOT_DIR}/${p.reports[i]!.id}.`));
  if (own.length > 0) {
    const rm = await removeHdStorageObjects(db, own, "analysis-delete");
    if (!rm.ok) warnings.push("storage_cleanup_failed");
  }
  await cleanupOrphanHdImages(db, tenantId).catch(() => undefined);
  return { ok: true, deletedReports: reportIds.length, warnings };
}
