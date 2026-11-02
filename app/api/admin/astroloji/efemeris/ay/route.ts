import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody } from "@/lib/astrology/http";
import { isProEphemerisEnabled } from "@/lib/astrology/pro/ephemeris/flags";
import { buildLunations, parseLunationRequest } from "@/lib/astrology/pro/lunations/request";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Yerel hesap (sağlayıcı çağrısı YOK) yine de işlemci harcar → kullanıcı başına saatte en çok N istek. */
const LOCAL_RATE = { limit: 240, windowSeconds: 60 * 60 } as const;

/**
 * POST — GÖKYÜZÜ ARAÇLARI · Ay evreleri ve tutulmalar (yerel motor; Profesyonel Efemeris bayrağıyla aynı kapı: kapalıyken kapıdan
 * sonra tek tip 404). Erişim yalnız requireAstrologyAccess; hiçbir şey kaydedilmez, sağlayıcı çağrılmaz.
 * Gövde: { kind: "phases"|"eclipses", start: "YYYY-MM-DD", end: "YYYY-MM-DD", phases? }.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  if (!isProEphemerisEnabled()) return astrologyNotFoundResponse();
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const parsed = parseLunationRequest(b.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, ...parsed.error }, { status: 400, headers: ASTRO_NO_STORE });
  const rl = await hitDbRateLimit(gate.ctx.db, rateLimitBucket("astro-sky-lunations", `${gate.ctx.tenantId}:${gate.ctx.userId}`), LOCAL_RATE.limit, LOCAL_RATE.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla hesap istendi. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const r = buildLunations(parsed.value);
  if (!r.ok) return NextResponse.json({ ok: false, ...r.error }, { status: 400, headers: ASTRO_NO_STORE });
  return NextResponse.json({ ok: true, result: r.result }, { headers: ASTRO_NO_STORE });
}
