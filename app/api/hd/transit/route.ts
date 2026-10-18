import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { computeGeneralTransit, TransitEngineError } from "@/lib/human-design/transit/generalTransit";
import { nowTransitMoment, resolveTransitMoment } from "@/lib/human-design/transit/transitMoment";

export const runtime = "nodejs";

/**
 * GET /api/hd/transit?date=YYYY-MM-DD&time=HH:MM — GÜNÜN / SEÇİLEN ANIN GENEL Human Design transiti.
 *
 *   • Tarih/saat TÜRKİYE yerel saatidir (Europe/Istanbul); verilmezse "şimdi" (dakika). UTC dönüşümü sunucuda.
 *   • Doğum verisi ALINMAZ; kişi / danışan verisi okunmaz, DB'ye yazılmaz. Roxy ÇAĞRILMAZ (yerel doğrulanmış motor).
 *   • Erişim: requireModuleAccess("human_design") (mevcut HD erişim kuralı). Yanıt no-store.
 *   • CPU sınırı: kullanıcı başına saatlik sınır (mevcut hesap ucu deseni).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const rl = await hitDbRateLimit(guard.db, rateLimitBucket("hd-transit-user", guard.userId), 600, 60 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla hesaplama yapıldı. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }

  const sp = new URL(req.url).searchParams;
  const date = (sp.get("date") ?? "").trim();
  const time = (sp.get("time") ?? "").trim();
  const m = date || time ? resolveTransitMoment(date, time) : nowTransitMoment();
  if (!m.ok) return NextResponse.json({ ok: false, code: m.code, error: m.error }, { status: 400, headers: NO_STORE });

  try {
    const transit = computeGeneralTransit(new Date(m.moment.utcIso));
    return NextResponse.json({ ok: true, moment: m.moment, transit }, { status: 200, headers: NO_STORE });
  } catch (e) {
    const known = e instanceof TransitEngineError;
    return NextResponse.json(
      { ok: false, code: known ? "TRANSIT_UNVERIFIED" : "TRANSIT_FAILED", error: "Transit hesaplanamadı; doğrulanamayan sonuç gösterilmez. Lütfen tekrar deneyin." },
      { status: 500, headers: NO_STORE },
    );
  }
}
