import { NextRequest, NextResponse } from "next/server";
import { ASTRO_NO_STORE, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { buildCombinedAnalysisReport, type ReportFormat } from "@/lib/astrology/report/service";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
// GA-P2-06: en çok COMBINED_REPORT_MAX (30) analiz tek Word/PDF — süre sınırı açık (platform varsayılanına bırakılmaz).
export const maxDuration = 300;

/**
 * GET ?profileId=&format=docx|pdf&(ids=<id,id,…> | all=1) — 2026-10-12 (UAT 2. tur, madde L): bir danışanın SEÇİLİ
 * ya da TÜM kayıtlı analizleri TEK Word / TEK PDF dosyasında.
 *
 * Tekli rapor rotasıyla AYNI kurallar: kapı önce (yetkisiz → tek tip 404), oran sınırı. 2026-10-15: Android dahil
 * her cihazda indirilir (eski Android 403 kaldırıldı).
 * Yalnız kayıtlı snapshot okunur (getAnalysis): 0 sağlayıcı isteği, yeni hesap yok, kayda yazım yok. Bütün analizler
 * aynı profile ait olmalı (aksi 400); en çok COMBINED_REPORT_MAX analiz.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const fmt = sp.get("format");
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
  const all = sp.get("all") === "1";
  const ids = all ? undefined : (sp.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const r = await buildCombinedAnalysisReport(gate.ctx, { profileId: sp.get("profileId"), ids, all }, fmt as ReportFormat, parseOwnerPreviewHideInterp(sp.get("previewNoInterp")));
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
