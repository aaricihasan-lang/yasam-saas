import { NextRequest, NextResponse } from "next/server";
import { requireAdminUserRequest } from "@/lib/auth/userGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCanonicalReportForDownload } from "@/lib/human-design/api/reportPersistence";
import { hdReportFilename, renderHdReportBuffer } from "@/lib/human-design/reporting/wordReport";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";
import { fetchStorageImageBuffer, getImgDimensions } from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

/**
 * POST /api/hd/reports/professional/download — DONMUŞ snapshot → DOCX.
 *
 * Güvenlik / sözleşme (§18, §43 + admin knowledge isolation):
 *   - requireAdminUserRequest → x-user-id + x-session-token binding + role==='admin'.
 *     Donmuş snapshot merkezî canonical prose içerir → yalnız ADMIN/OWNER indirebilir.
 *     Non-admin uzman → 403.
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
  const guard = await requireAdminUserRequest(req);
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
    buffer = await renderHdReportBuffer(snapshot, { chartImage });
  } catch {
    return NextResponse.json({ ok: false, error: "Rapor belgesi oluşturulamadı." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const dateSlug = (snapshot.generatedAt || "").slice(0, 10);
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
