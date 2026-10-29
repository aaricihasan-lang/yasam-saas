import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { isWesternHoraryPreviewEnabled } from "@/lib/astrology/horary/westernPreview";
import { parseWesternHoraryBody, runWesternHorary } from "@/lib/astrology/horary/westernRun";
import { readJsonBody } from "@/lib/astrology/http";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Yerel hesaplama (sağlayıcı çağrısı YOK) yine de işlemci harcar → kullanıcı başına saatte en çok N harita. */
const HORARY_LOCAL_RATE = { limit: 60, windowSeconds: 60 * 60 } as const;

/**
 * POST — Batı Horary (William Lilly) soru haritası. ÖNİZLEME: `NEXT_PUBLIC_ATLAS_HORARY_PREVIEW=1` değilse 404.
 * Gövde: { date: "YYYY-AA-GG", time: "SS:DD", locationId, quesitedHouse: 2–12, dst?: "earlier"|"later" }.
 * Soru METNİ gönderilmez; hiçbir şey kaydedilmez (kalıcı kayıt bu sürümde YOK).
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isWesternHoraryPreviewEnabled()) return astrologyNotFoundResponse();
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const parsed = parseWesternHoraryBody(b.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, ...parsed.error }, { status: 400, headers: ASTRO_NO_STORE });
  const place = resolveAstroLocation(parsed.value.locationId);
  if (!place) return NextResponse.json({ ok: false, code: "INVALID_INPUT", field: "place", error: "Konum bulunamadı. Listeden yeniden seçin." }, { status: 400, headers: ASTRO_NO_STORE });

  const rl = await hitDbRateLimit(gate.ctx.db, rateLimitBucket("astro-horary-local", `${gate.ctx.tenantId}:${gate.ctx.userId}`), HORARY_LOCAL_RATE.limit, HORARY_LOCAL_RATE.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla harita oluşturuldu. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const r = runWesternHorary({ date: parsed.value.date, time: parsed.value.time, place, quesitedHouse: parsed.value.quesitedHouse, dst: parsed.value.dst });
  if (!r.ok) return NextResponse.json({ ok: false, ...r.error }, { status: 422, headers: ASTRO_NO_STORE });
  return NextResponse.json({ ok: true, result: r.result }, { headers: ASTRO_NO_STORE });
}
