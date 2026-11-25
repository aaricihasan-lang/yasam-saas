import type { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { astroReportBrandingLoader } from "@/lib/astrology/report/branding";
import { parseMonthlyRequest } from "@/lib/astrology/pro/monthly/contract";
import { renderMonthlyReport } from "@/lib/astrology/pro/monthly/reportRender";
import { fileResponse, json, monthlyDeps, monthlyAfterGate, MONTHLY_ERROR_STATUS } from "@/lib/astrology/pro/monthly/routeKit";
import { getMonthlyEphemeris } from "@/lib/astrology/pro/monthly/service";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET ?kind=western|vedic&year=&month=&format=docx|pdf — EKRANDAKİ (henüz kaydedilmemiş) aylık efemerisin Word / PDF raporu.
 * İçerik YALNIZ önbellekten (allowProvider: false) → rapor yeni ücretli çağrı BAŞLATAMAZ; önbellekte yoksa 409 (önce tabloyu hesaplayın).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const off = monthlyAfterGate(gate.ctx);
  if (off) return off;
  const g = gate;
  const sp = req.nextUrl.searchParams;
  const fmt = sp.get("format");
  if (fmt !== "docx" && fmt !== "pdf") return json({ ok: false, code: "INVALID_FORMAT", error: "Rapor biçimi docx veya pdf olmalı." }, 400);
  const parsed = parseMonthlyRequest({ kind: sp.get("kind"), year: sp.get("year"), month: sp.get("month") });
  if (!parsed.ok) return json({ ok: false, ...parsed.error }, 400);
  const rl = checkRateLimit(`astro-monthly-report:${g.ctx.tenantId}:${g.ctx.userId}`, 20, 60_000);
  if (!rl.allowed) return json({ ok: false, code: "RATE_LIMITED", error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." }, 429);
  const r = await getMonthlyEphemeris(parsed.value, monthlyDeps(g.ctx, false), { allowProvider: false });
  if (!r.ok) return json({ ok: false, ...r.error }, MONTHLY_ERROR_STATUS[r.error.code] ?? 500);
  const branding = await astroReportBrandingLoader(g.ctx)();
  return fileResponse(await renderMonthlyReport(r.result, fmt, { generatedAt: new Date().toISOString(), branding }));
}
