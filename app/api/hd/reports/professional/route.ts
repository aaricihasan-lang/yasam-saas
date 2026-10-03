import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isUuid, professionalReportIdFor } from "@/lib/human-design/api/deterministicId";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";
import { copyChartImageToReportSnapshot, removeHdStorageObjects } from "@/lib/human-design/api/hdStorage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkRateLimit } from "@/lib/rateLimit";
import { createReportSnapshotFromChart } from "@/lib/human-design/reporting/reportSnapshotService";
import { HD_REPORT_UNPUBLISHED_MESSAGE } from "@/lib/human-design/reporting/reportSnapshot";
import { saveCanonicalReport, findReportBrief } from "@/lib/human-design/api/reportPersistence";
import { hdReportTitle } from "@/lib/human-design/reporting/wordReport";

export const runtime = "nodejs";

/**
 * POST /api/hd/reports/professional — PROFESYONEL (canonical) rapor snapshot OLUŞTUR.
 *
 * Güvenlik / sözleşme (FAZ1 final hardening — HD profesyonel Word TÜM uzmanlara açık):
 *   - requireModuleAccess(req, "human_design") → x-user-id + x-session-token binding +
 *     human_design modül izni (admin merkezî bypass). Admin de çalışmaya devam eder.
 *   - Canonical corpus uzmana YALNIZ bu donmuş rapor snapshot'ı üzerinden ulaşır:
 *     listeleme/okuma ucu YOK; liste projeksiyonu snapshot/canonical_provenance TAŞIMAZ.
 *   - tenantId + userId YALNIZ guard'dan; body'den GÜVENİLMEZ.
 *   - chart_id tenant-scoped (sahiplik); başka tenant/eksik → 404 (ayırt etme).
 *   - Demo hesap YAZAMAZ (report create bir write'tır) → 403.
 *   - Anti-scrape: >26 benzersiz kapı → 422 dostane red (içerik okunmaz).
 *   - Eksik published canonical: ADMIN → 422 fail-loud (anahtarlı detay yalnız admin'e);
 *     UZMAN → yayımlanmamış bölüm atlanır (provenance.omitted; anahtar sızmaz). Hiçbir
 *     bölüm yoksa sade 422 ("…henüz yayımlanmadı").
 *   - DONMUŞ snapshot INSERT edilir (report_kind='canonical'); LIVE canonical lookup
 *     indirmede YAPILMAZ. Yanıt no-store.
 *   - Rate limit: tenant başına 10/60s (pahalı üretim).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  // Android'de Word (.docx) kapalı: snapshot yalnız Word indirmesi için üretilir → boşuna
  // üretim/rate-limit tüketimi olmasın (download ucu ile aynı guard).
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında profesyonel rapor oluşturulamaz." },
      { status: 403, headers: NO_STORE },
    );
  }
  const isAdmin = String(guard.profile?.role ?? "").trim().toLowerCase() === "admin";

  const rl = checkRateLimit(`hd-word:${guard.tenantId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const chartId = String((raw as Record<string, unknown> | null)?.chartId ?? "").trim();
  if (!chartId) {
    return NextResponse.json({ ok: false, error: "chartId gerekli." }, { status: 400, headers: NO_STORE });
  }

  // P2-2 — idempotency: istemci her KULLANICI EYLEMİ için bir requestId (uuid) üretir ve
  // ağ tekrarı/çift tıklamada AYNISINI gönderir. Rapor id'si (tenant, requestId)'den
  // deterministik türetilir → aynı eylem ikinci kez satır oluşturamaz (PRIMARY KEY).
  // Bilinçli "yeni sürüm" yeni bir requestId ile gelir → yeni rapor (ürün semantiği korunur).
  const rawRequestId = (raw as Record<string, unknown> | null)?.requestId;
  const requestId = isUuid(rawRequestId) ? rawRequestId : null;
  const reportId = requestId ? professionalReportIdFor(guard.tenantId, requestId) : randomUUID();
  if (requestId) {
    const prior = await findReportBrief(guard.db, guard.tenantId, reportId);
    if (prior.error) {
      return NextResponse.json({ ok: false, error: "Rapor durumu okunamadı. Lütfen tekrar deneyin." }, { status: 500, headers: NO_STORE });
    }
    if (prior.row) {
      if (prior.row.report_kind === "canonical" && (prior.row.chart_id === chartId || prior.row.chart_id === null)) {
        return NextResponse.json({ ok: true, id: prior.row.id, reused: true, omittedCount: 0 }, { status: 200, headers: NO_STORE });
      }
      return NextResponse.json({ ok: false, error: "Bu istek kimliği başka bir rapora ait." }, { status: 409, headers: NO_STORE });
    }
  }

  const built = await createReportSnapshotFromChart(guard.db, guard.tenantId, chartId, {
    onMissing: isAdmin ? "throw" : "omit",
  });
  if (!built.ok) {
    // Uzman yanıtında canonical anahtar ASLA yer almaz (admin fail-loud detayı korunur).
    const error = !isAdmin && built.code === "CANONICAL_MISSING" ? HD_REPORT_UNPUBLISHED_MESSAGE : built.error;
    if (built.status >= 500) {
      await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "record_created", subEntity: "report", errorClass: "server" });
    }
    return NextResponse.json({ ok: false, code: built.code, error }, { status: built.status, headers: NO_STORE });
  }

  // P2-1 — BodyGraph görseli rapora ait DONMUŞ kopyaya alınır (`{tenant}/report-snapshots/
  // {reportId}.{ext}`): danışan görseli sonradan değişse/silinse de bu rapor görselini korur.
  let copiedImagePath: string | null = null;
  if (built.chartImagePath && built.clientId && isOwnedChartImagePath(built.chartImagePath, guard.tenantId, built.clientId)) {
    const copied = await copyChartImageToReportSnapshot(guard.db, guard.tenantId, built.clientId, built.chartImagePath, reportId);
    if (copied.error || !copied.path) {
      return NextResponse.json(
        { ok: false, error: "Harita görseli rapora kopyalanamadı. Lütfen tekrar deneyin." },
        { status: 503, headers: NO_STORE },
      );
    }
    copiedImagePath = copied.path;
    built.snapshot.chartImage = { storagePath: copied.path, includedAtGeneration: true };
  }

  const saved = await saveCanonicalReport(guard.db, guard.tenantId, guard.userId, {
    id: reportId,
    chartId,
    clientId: built.clientId,
    title: hdReportTitle(built.clientName),
    snapshot: built.snapshot,
    provenance: built.snapshot.provenance.canonical,
  });
  if (saved.error || !saved.id) {
    // Satır oluşmadı → bu isteğin kopyaladığı görsel yetim kalmasın.
    if (copiedImagePath) await removeHdStorageObjects(guard.db, [copiedImagePath], "professional-report-rollback");
    return NextResponse.json({ ok: false, error: saved.error ?? "Rapor kaydedilemedi." }, { status: 400, headers: NO_STORE });
  }
  if (saved.duplicate) {
    // Aynı istek eşzamanlı geldi: satır diğer istekte oluştu → yeni satır YOK.
    return NextResponse.json({ ok: true, id: saved.id, reused: true, omittedCount: 0 }, { status: 200, headers: NO_STORE });
  }

  // USAGE360: donmuş snapshot KAYDI oluşturuldu → record_created (Word indirme ayrı eylem:
  // /download → report_generated; burada rapor üretimi sayılmaz → çift sayım yok).
  await trackUsage(guard, req, { module: "human_design", action: "record_created", subEntity: "report", resourceId: saved.id });
  return NextResponse.json(
    { ok: true, id: saved.id, omittedCount: built.snapshot.provenance.omitted?.length ?? 0 },
    { status: 200, headers: NO_STORE },
  );
}
