import { NextRequest, NextResponse } from "next/server";
import { ASTRO_NO_STORE, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { buildAnalysisReport, type ReportFormat } from "@/lib/astrology/report/service";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { isAndroidUserAgent } from "@/lib/platform/android";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET ?format=docx|pdf — kayıtlı analizin Word / PDF raporu (Aşama 8).
 *
 * Yalnız kayıtlı snapshot okunur (getAnalysis): 0 sağlayıcı isteği, yeni hesap yok, snapshot'a yazım yok.
 * Yetki/izolasyon getAnalysis ile AYNI: tenant + uzman sahipliği; Roxy yorumu yalnız GÜNCEL yorum
 * yetkisi varsa (yoksa yorum kolonu okunmaz). Kapı ÖNCE çalışır: yetkisiz istek (Android dahil) modülün
 * varlığını öğrenmez — tek tip 404. Android: Word ve PDF indirme desteklenmez (ürün kuralı:
 * Word tüm Android'de kapalı; sunucu PDF'i Anamnez kuralıyla tüm Android'de kapalı) → 403.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const fmt = req.nextUrl.searchParams.get("format");
  if (fmt === "docx") {
    const blocked = androidWordGuard(req);
    if (blocked) return blocked;
  } else if (fmt === "pdf") {
    if (isAndroidUserAgent(req.headers.get("user-agent"))) {
      return NextResponse.json({ ok: false, error: "PDF indirme bu cihazda kullanılamıyor. Lütfen bilgisayardan deneyin." }, { status: 403, headers: ASTRO_NO_STORE });
    }
  }
  if (fmt !== "docx" && fmt !== "pdf") {
    return NextResponse.json({ ok: false, code: "INVALID_FORMAT", error: "Rapor biçimi docx veya pdf olmalı." }, { status: 400, headers: ASTRO_NO_STORE });
  }
  const rl = checkRateLimit(`astro-report:${gate.ctx.tenantId}:${gate.ctx.userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }
  const { id } = await ctx.params;
  const r = await buildAnalysisReport(gate.ctx, id, fmt as ReportFormat, parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp")));
  if (!r.ok) return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
  const asciiName = r.filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(Buffer.from(r.bytes), {
    status: 200,
    headers: {
      "Content-Type": r.contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
      "Content-Length": String(r.bytes.byteLength),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
