import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { readJsonBody } from "@/lib/astrology/http";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { isProEphemerisEnabled, isProEphemerisProviderEnabled } from "@/lib/astrology/pro/ephemeris/flags";
import { PROVIDER_PLANETS_ENDPOINT, providerDailyBody } from "@/lib/astrology/pro/ephemeris/provider";
import { buildEphemeris, parseEphemerisRequest } from "@/lib/astrology/pro/ephemeris/table";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Yerel hesap (sağlayıcı çağrısı YOK) yine de işlemci harcar → kullanıcı başına saatte en çok N sayfa. */
const LOCAL_RATE = { limit: 240, windowSeconds: 60 * 60 } as const;
/** Sağlayıcı kaynağı: sayfa başına ≤31 ücretli çağrı → kullanıcı başına saatte en çok 6 sayfa (≤186 çağrı). */
const PROVIDER_RATE = { limit: 6, windowSeconds: 60 * 60 } as const;

/**
 * POST — PROFESYONEL EFEMERİS tablosu (varsayılan KAPALI: ATLAS_PRO_EPHEMERIS_ENABLED=1 değilse kapıdan sonra tek tip 404).
 * Erişim yalnız requireAstrologyAccess (admin yüzeyi owner; uzman yüzeyi astroloji yetkisi); aksi 404. Hiçbir şey kaydedilmez.
 * Gövde: { view: "day"|"month"|"year"|"range", date? | year?/month? | start?/end?, page?, bodies?, zodiac?, source?, nodeType? }.
 * source "provider" ayrıca ATLAS_PRO_EPHEMERIS_PROVIDER=1 + sunucu anahtarı ister; tek gün bile alınamazsa 502 (yerel veriyle doldurulmaz).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // Bayrak kapalıyken yetkili kullanıcı da yetkisizle AYNI tek tip 404'ü alır (özelliğin varlığı sızdırılmaz).
  if (!isProEphemerisEnabled()) return astrologyNotFoundResponse();
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const parsed = parseEphemerisRequest(b.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, ...parsed.error }, { status: 400, headers: ASTRO_NO_STORE });
  const provider = parsed.value.source === "provider";
  const config = provider ? readAstroRoxyConfig() : null;
  if (provider && (!isProEphemerisProviderEnabled() || !config)) {
    return NextResponse.json({ ok: false, code: "PROVIDER_DISABLED", field: "source", error: "Bu kaynak şu anda kapalı. Yerel hesaplamayı kullanın." }, { status: 403, headers: ASTRO_NO_STORE });
  }
  const rate = provider ? PROVIDER_RATE : LOCAL_RATE;
  const rl = await hitDbRateLimit(gate.ctx.db, rateLimitBucket(provider ? "astro-ephemeris-provider" : "astro-ephemeris-local", `${gate.ctx.tenantId}:${gate.ctx.userId}`), rate.limit, rate.windowSeconds);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla tablo istendi. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const fetchDay = config
    ? async (date: string, nodeType: "true" | "mean") => {
        // Ücretli çağrı: yeniden deneme YOK (zaman aşımında sağlayıcı hesabı yapmış olabilir → çift maliyet).
        const r = await callRoxy(config, PROVIDER_PLANETS_ENDPOINT, providerDailyBody(date, nodeType), { maxRetries: 0, lang: "en" });
        return r.ok ? r.raw : null;
      }
    : undefined;
  const r = await buildEphemeris(parsed.value, { fetchDay });
  if (!r.ok) return NextResponse.json({ ok: false, ...r.error }, { status: r.error.code === "PROVIDER_FAILED" ? 502 : 400, headers: ASTRO_NO_STORE });
  return NextResponse.json({ ok: true, result: r.result }, { headers: ASTRO_NO_STORE });
}
