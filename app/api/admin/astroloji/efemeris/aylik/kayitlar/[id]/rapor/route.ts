import type { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { astroReportBrandingLoader } from "@/lib/astrology/report/branding";
import { loadMonthlyForReport } from "@/lib/astrology/pro/monthly/records";
import { renderMonthlyReport } from "@/lib/astrology/pro/monthly/reportRender";
import { fileResponse, json, localizeBody, monthlyAfterGate } from "@/lib/astrology/pro/monthly/routeKit";
import { resolveOutputLocale } from "@/lib/i18n/output";
import { monthlyText } from "@/lib/astrology/pro/monthly/text";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
type RouteContext = { params: Promise<{ id: string }> };

/** GET ?format=docx|pdf — KAYITLI aylık efemerisin Word / PDF raporu (kayıtlı anlık görüntüden; sağlayıcı çağrısı YOK). */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const off = monthlyAfterGate(gate.ctx);
  if (off) return off;
  const g = gate;
  // I18N: rapor ve hata metni ekran dilinde (Owner kararı A3). Kayıt başlığı kullanıcı içeriğidir — çevrilmez.
  const L = monthlyText(resolveOutputLocale(req).locale);
  const fmt = req.nextUrl.searchParams.get("format");
  if (fmt !== "docx" && fmt !== "pdf") return json({ ok: false, code: "INVALID_FORMAT", error: L.t("errors.formatInvalid") }, 400);
  const rl = checkRateLimit(`astro-monthly-report:${g.ctx.tenantId}:${g.ctx.userId}`, 20, 60_000);
  if (!rl.allowed) return json({ ok: false, code: "RATE_LIMITED", error: L.t("errors.reportRate") }, 429);
  const { id } = await ctx.params;
  const rec = await loadMonthlyForReport({ db: g.ctx.db, tenantId: g.ctx.tenantId, userId: g.ctx.userId }, id);
  if (!rec.ok) return json(localizeBody(rec.res.body, L), rec.res.status);
  const branding = await astroReportBrandingLoader(g.ctx)();
  return fileResponse(
    await renderMonthlyReport(rec.result, fmt, { generatedAt: new Date().toISOString(), saved: { title: rec.title, savedAt: rec.savedAt, methodologyVersion: rec.methodologyVersion }, branding, text: L }),
  );
}
