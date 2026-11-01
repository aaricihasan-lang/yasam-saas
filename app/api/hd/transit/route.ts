import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { TransitEngineError } from "@/lib/human-design/transit/generalTransit";
import { resolveGeneralTransit, TransitVerificationError } from "@/lib/human-design/transit/resolveTransit";
import { callRoxyPlanets } from "@/lib/human-design/transit/roxyPlanetsClient";
import { transitDataCache } from "@/lib/human-design/transit/transitDataCache";
import { createSupabasePlanetStore, hdTransitPlanetStoreEnabled } from "@/lib/human-design/transit/transitPlanetStore";
import { nowTransitMoment, resolveTransitMoment, TRANSIT_TIME_ZONE } from "@/lib/human-design/transit/transitMoment";

export const runtime = "nodejs";

/**
 * GET /api/hd/transit?date=YYYY-MM-DD&time=HH:MM[&tz=<IANA>][&offset=<saniye>] — GÜNÜN / SEÇİLEN ANIN GENEL Human Design transiti.
 *
 *   • Tarih/saat `tz` IANA saat dilimindeki yerel saattir; tz verilmezse TÜRKİYE (Europe/Istanbul — eski istemciler birebir).
 *     Verilmezse "şimdi" (o saat diliminde, dakika). UTC dönüşümü SUNUCUDA, tz sunucuda doğrulanır (geçersiz → 400).
 *   • Yaz saati boşluğu → 400; iki kez yaşanan saat → 400 LOCAL_TIME_AMBIGUOUS + `offsets` (kullanıcı seçer, `offset` ile
 *     yeniden ister; yalnız bu iki ofsetten biri kabul edilir). İstemcinin gönderdiği ofset körü körüne kabul edilmez.
 *   • Astronomik hesap YALNIZ UTC anından: aynı UTC anı her saat diliminde aynı 13 aktivasyonu verir.
 *   • Doğum verisi ALINMAZ; kişi / danışan verisi okunmaz, DB'ye yazılmaz (kota sayaçları hariç).
 *   • Hesap: yerel motor; sınırdaki (belirsiz) aktivasyon varsa doğrulanmış Roxy gezegen konumları (resolveTransit).
 *     resolution: local-certain | roxy-resolved → TAM sonuç; roxy-partial | unresolved → EKSİK (belirsizler kesin gösterilmez).
 *   • Roxy boylamı bağımsız motorla uyuşmazsa 502 (doğrulanamayan sonuç gösterilmez, önbelleğe yazılmaz).
 *   • Erişim: requireModuleAccess("human_design"). Yanıt no-store.
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
  const tz = (sp.get("tz") ?? "").trim() || TRANSIT_TIME_ZONE;
  const rawOffset = (sp.get("offset") ?? "").trim();
  const offset = rawOffset === "" ? null : /^[+-]?\d{1,6}$/.test(rawOffset) ? Number(rawOffset) : Number.NaN;
  if (Number.isNaN(offset)) return NextResponse.json({ ok: false, code: "INVALID_OFFSET", error: "Geçersiz UTC ofseti." }, { status: 400, headers: NO_STORE });
  const m = date || time ? resolveTransitMoment(date, time, tz, offset) : nowTransitMoment(new Date(), tz);
  if (!m.ok) {
    return NextResponse.json(
      { ok: false, code: m.code, error: m.error, ...(m.offsetsSeconds ? { offsets: m.offsetsSeconds } : {}) },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const r = await resolveGeneralTransit(new Date(m.moment.utcIso), {
      config: readRoxyServerConfig(),
      callPlanets: (config, body) => callRoxyPlanets(config, body),
      rateLimit: (scope, value, limit, windowSeconds) => hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds),
      userId: guard.userId,
      tenantId: guard.tenantId,
      sharedCache: transitDataCache,
      // Kalıcı L2 (Supabase); HD_TRANSIT_PLANET_STORE=off veya tablo yok → yalnız eski Next Data Cache yolu.
      planetStore: hdTransitPlanetStoreEnabled() ? createSupabasePlanetStore(guard.db, { log: (msg, detail) => console.error(msg, detail ?? "") }) : undefined,
      log: (msg, detail) => console.error(msg, detail ?? ""),
    });
    return NextResponse.json(
      { ok: true, moment: m.moment, transit: r.transit, resolution: r.resolution, complete: !r.transit.hasUncertainty },
      { status: 200, headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof TransitVerificationError) {
      console.error("[hd-transit] verification failed", { utc: m.moment.utcIso, details: e.details });
      return NextResponse.json(
        { ok: false, code: "TRANSIT_UNVERIFIED", error: "Bu an için gezegen konumları bağımsız olarak doğrulanamadı; doğrulanamayan sonuç gösterilmez. Lütfen tekrar deneyin." },
        { status: 502, headers: NO_STORE },
      );
    }
    const known = e instanceof TransitEngineError;
    return NextResponse.json(
      { ok: false, code: known ? "TRANSIT_UNVERIFIED" : "TRANSIT_FAILED", error: "Transit hesaplanamadı; doğrulanamayan sonuç gösterilmez. Lütfen tekrar deneyin." },
      { status: 500, headers: NO_STORE },
    );
  }
}
