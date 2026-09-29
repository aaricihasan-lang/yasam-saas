import { NextRequest, NextResponse } from "next/server";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCanonicalReportForDownload } from "@/lib/human-design/api/reportPersistence";
import { hdReportFilename, renderHdReportBuffer } from "@/lib/human-design/reporting/wordReport";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";
import { fetchStorageImageBuffer, getImgDimensions } from "@/lib/docx/reportHelpers";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { reportFileDate, zonedDayKey } from "@/lib/time/reportTime";

export const runtime = "nodejs";

/**
 * POST /api/hd/reports/professional/download — DONMUŞ snapshot → DOCX.
 *
 * Güvenlik / sözleşme (§18, §43 + FAZ1 final hardening):
 *   - requireModuleAccess(req, "human_design") → x-user-id + x-session-token binding +
 *     modül izni. Uzman YALNIZ kendi tenant'ında oluşturulmuş DONMUŞ raporu indirir
 *     (canonical corpus'a başka yoldan erişim yok). Admin de çalışır.
 *   - tenantId YALNIZ guard'dan; body reportId tenant-scoped okunur (foreign → 404).
 *   - YALNIZ report_kind='canonical'; snapshot server'da doğrulanır.
 *   - DOCX KAYDEDİLMİŞ snapshot'tan üretilir → LIVE CANONICAL LOOKUP YOK (canonical
 *     store sonradan değişse bile eski rapor AYNI içeriği verir).
 *   - Görsel: yalnız tenant/client OWNED private storage path'i (SSRF yok; keyfi URL fetch
 *     YOK). Doğrulama/getirme başarısız → rapor görselsiz devam eder.
 *   - Yanıt: no-store + sanitize edilmiş Content-Disposition.
 */

const BUCKET = "hd-chart-images";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: NextRequest): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;

  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const rl = checkRateLimit(`hd-word-dl:${guard.tenantId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla indirme isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const reportId = String((raw as Record<string, unknown> | null)?.reportId ?? "").trim();
  if (!reportId) {
    return NextResponse.json({ ok: false, error: "reportId gerekli." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const read = await getCanonicalReportForDownload(guard.db, guard.tenantId, reportId);
  if (!read.data) {
    if (read.status >= 500) {
      await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "report_generated", subEntity: "report", errorClass: "server" });
    }
    return NextResponse.json({ ok: false, error: read.error }, { status: read.status, headers: { "Cache-Control": "no-store" } });
  }
  const { snapshot, clientId } = read.data;

  // ── Ownership-safe BodyGraph görseli (opsiyonel; §36). Keyfi URL fetch YOK. ──
  let chartImage: Buffer | null = null;
  const imgPath = snapshot.chartImage?.storagePath ?? null;
  if (imgPath && clientId && isOwnedChartImagePath(imgPath, guard.tenantId, clientId)) {
    const buf = await fetchStorageImageBuffer(guard.db, BUCKET, imgPath);
    if (buf && getImgDimensions(buf)) chartImage = buf; // geçersiz/boş → görselsiz devam
  }

  let buffer: Buffer;
  try {
    buffer = await renderHdReportBuffer(snapshot, { chartImage, expertName: expertDisplayName(guard.profile) });
  } catch {
    await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "report_generated", subEntity: "report", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Rapor belgesi oluşturulamadı." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  // Dosya adı: raporun oluşturulduğu YEREL gün (Europe/Istanbul); yoksa bugünün yerel günü.
  // USAGE360: docx BAŞARIYLA üretildi → report_generated (resourceId = rapor id; 60 sn kova).
  // Android Word guard 403'ü olay değildir.
  await trackUsage(guard, req, { module: "human_design", action: "report_generated", subEntity: "report", resourceId: reportId });

  const dateSlug = zonedDayKey(snapshot.generatedAt) || reportFileDate();
  const filename = hdReportFilename(snapshot.client.name, dateSlug);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store, private",
    },
  });
}
