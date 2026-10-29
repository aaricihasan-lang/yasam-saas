import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { isWesternHoraryPreviewEnabled } from "@/lib/astrology/horary/westernPreview";
import { renderHoraryReport } from "@/lib/astrology/horary/westernReportService";
import { parseWesternHoraryBody, runWesternHorary } from "@/lib/astrology/horary/westernRun";
import { readJsonBody } from "@/lib/astrology/http";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const QUESTION_MAX = 500;

/**
 * POST ?format=docx|pdf — Batı Horary (William Lilly) Word / PDF raporu. ÖNİZLEME bayrağı kapalıysa 404.
 * Gövde: hesaplama girdileri (date, time, locationId, quesitedHouse, dst?) + isteğe bağlı question (≤ 500) + demo.
 * Harita SUNUCUDA yeniden hesaplanır (istemcinin gönderdiği sonuç kabul edilmez). Soru metni yalnız bu yanıt için bellekte
 * kullanılır: saklanmaz, günlüğe yazılmaz, dosya adına girmez. Veritabanına HİÇBİR ŞEY yazılmaz (rapor oran sınırı bellek içi,
 * mevcut analiz raporu ucuyla aynı: 20 / dk).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // Önizleme bayrağı kapalıyken uç yokmuş gibi davranır (aynı 404).
  if (!isWesternHoraryPreviewEnabled()) return astrologyNotFoundResponse();
  const fmt = req.nextUrl.searchParams.get("format");
  if (fmt !== "docx" && fmt !== "pdf") return NextResponse.json({ ok: false, code: "INVALID_FORMAT", error: "Rapor biçimi docx veya pdf olmalı." }, { status: 400, headers: ASTRO_NO_STORE });
  const rl = checkRateLimit(`astro-horary-report:${gate.ctx.tenantId}:${gate.ctx.userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." }, { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } });
  }
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const raw = (b.body && typeof b.body === "object" ? b.body : {}) as Record<string, unknown>;
  const parsed = parseWesternHoraryBody(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, ...parsed.error }, { status: 400, headers: ASTRO_NO_STORE });
  if (raw.question !== undefined && raw.question !== null && typeof raw.question !== "string") return NextResponse.json({ ok: false, code: "INVALID_INPUT", field: "question", error: "Soru metni geçersiz." }, { status: 400, headers: ASTRO_NO_STORE });
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  if (question.length > QUESTION_MAX) return NextResponse.json({ ok: false, code: "INVALID_INPUT", field: "question", error: `Soru metni en çok ${QUESTION_MAX} karakter olabilir.` }, { status: 400, headers: ASTRO_NO_STORE });
  const place = resolveAstroLocation(parsed.value.locationId);
  if (!place) return NextResponse.json({ ok: false, code: "INVALID_INPUT", field: "place", error: "Konum bulunamadı. Listeden yeniden seçin." }, { status: 400, headers: ASTRO_NO_STORE });
  const r = runWesternHorary({ date: parsed.value.date, time: parsed.value.time, place, quesitedHouse: parsed.value.quesitedHouse, dst: parsed.value.dst });
  if (!r.ok) return NextResponse.json({ ok: false, ...r.error }, { status: 422, headers: ASTRO_NO_STORE });
  const out = await renderHoraryReport(r.result, fmt, { question: question || null, demo: raw.demo === true, generatedAt: new Date().toISOString() });
  const asciiName = out.filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(Buffer.from(out.bytes), {
    status: 200,
    headers: {
      "Content-Type": out.contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
      "Content-Length": String(out.bytes.byteLength),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "X-Horary-Chart": out.hasChart ? "1" : "0",
    },
  });
}
