import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess, astrologyTechniqueDenied } from "@/lib/astrology/access/ownerGate";
import { ASTRO_GRANT_SKY_DEGREES } from "@/lib/astrology/access/techniqueGrants";
import { readJsonBody } from "@/lib/astrology/http";
import { isProEphemerisEnabled } from "@/lib/astrology/pro/ephemeris/flags";
import { buildDegreeCrossings, parseDegreeRequest } from "@/lib/astrology/pro/degrees/request";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Yerel hesap (sağlayıcı çağrısı YOK) yine de işlemci harcar → kullanıcı başına saatte en çok N istek. */
const LOCAL_RATE = { limit: 240, windowSeconds: 60 * 60 } as const;

/**
 * POST — GÖKYÜZÜ ARAÇLARI · Derece geçişleri (yerel motor; Profesyonel Efemeris bayrağıyla aynı kapı: kapalıyken kapıdan
 * sonra tek tip 404). Erişim yalnız requireAstrologyAccess; hiçbir şey kaydedilmez, sağlayıcı çağrılmaz.
 * Gövde: { body, degrees: number[] (≤36, 0–360), start: "YYYY-MM-DD", end: "YYYY-MM-DD", zodiac? }.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  if (!isProEphemerisEnabled()) return astrologyNotFoundResponse();
  // 2026-11-03 teknik izni (kapalıysa 403; hesap / kayıt / rapor yapılmaz).
  const denied = astrologyTechniqueDenied(gate.ctx, ASTRO_GRANT_SKY_DEGREES);
  if (denied) return denied;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const parsed = parseDegreeRequest(b.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, ...parsed.error }, { status: 400, headers: ASTRO_NO_STORE });
  const rl = await hitDbRateLimit(gate.ctx.db, rateLimitBucket("astro-sky-degrees", `${gate.ctx.tenantId}:${gate.ctx.userId}`), LOCAL_RATE.limit, LOCAL_RATE.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla hesap istendi. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const r = buildDegreeCrossings(parsed.value);
  if (!r.ok) return NextResponse.json({ ok: false, ...r.error }, { status: 400, headers: ASTRO_NO_STORE });
  return NextResponse.json({ ok: true, result: r.result }, { headers: ASTRO_NO_STORE });
}
