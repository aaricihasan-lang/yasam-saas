import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { isWesternHoraryPreviewEnabled } from "@/lib/astrology/horary/westernPreview";
import { loadHoraryForReport } from "@/lib/astrology/horary/westernRecords";
import { renderHoraryReport } from "@/lib/astrology/horary/westernReportService";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET ?format=docx|pdf[&question=1] — KAYITLI Horary'nin Word / PDF raporu. İçerik kayıtlı anlık görüntüden (yeniden hesap YOK);
 * yalnız sahibi (tenant + uzman). Soru metni yalnız kayıtta saklıysa VE question=1 verilirse rapora girer.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // Önizleme bayrağı kapalıyken uç yokmuş gibi davranır (aynı 404).
  if (!isWesternHoraryPreviewEnabled()) return astrologyNotFoundResponse();
  const fmt = req.nextUrl.searchParams.get("format");
  if (fmt !== "docx" && fmt !== "pdf") return NextResponse.json({ ok: false, code: "INVALID_FORMAT", error: "Rapor biçimi docx veya pdf olmalı." }, { status: 400, headers: ASTRO_NO_STORE });
  const rl = checkRateLimit(`astro-horary-report:${gate.ctx.tenantId}:${gate.ctx.userId}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." }, { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } });
  const { id } = await ctx.params;
  const rec = await loadHoraryForReport({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, id);
  if (!rec.ok) return NextResponse.json(rec.res.body, { status: rec.res.status, headers: ASTRO_NO_STORE });
  const withQ = req.nextUrl.searchParams.get("question") === "1";
  const out = await renderHoraryReport(rec.result, fmt, {
    question: withQ ? rec.questionText : null,
    demo: rec.demo,
    generatedAt: new Date().toISOString(),
    saved: { title: rec.title, clientLabel: rec.clientLabel, methodologyVersion: rec.methodologyVersion, savedAt: rec.savedAt },
  });
  const asciiName = out.filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(Buffer.from(out.bytes), {
    status: 200,
    headers: {
      "Content-Type": out.contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
      "Content-Length": String(out.bytes.byteLength),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
