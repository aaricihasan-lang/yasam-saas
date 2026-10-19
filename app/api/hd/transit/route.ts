import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { TransitEngineError } from "@/lib/human-design/transit/generalTransit";
import { resolveGeneralTransit, TransitVerificationError } from "@/lib/human-design/transit/resolveTransit";
import { callRoxyPlanets } from "@/lib/human-design/transit/roxyPlanetsClient";
import { transitDataCache } from "@/lib/human-design/transit/transitDataCache";
import { nowTransitMoment, resolveTransitMoment } from "@/lib/human-design/transit/transitMoment";

export const runtime = "nodejs";

/**
 * GET /api/hd/transit?date=YYYY-MM-DD&time=HH:MM — GÜNÜN / SEÇİLEN ANIN GENEL Human Design transiti.
 *
 *   • Tarih/saat TÜRKİYE yerel saatidir (Europe/Istanbul); verilmezse "şimdi" (dakika). UTC dönüşümü sunucuda.
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
  const m = date || time ? resolveTransitMoment(date, time) : nowTransitMoment();
  if (!m.ok) return NextResponse.json({ ok: false, code: m.code, error: m.error }, { status: 400, headers: NO_STORE });

  try {
    const r = await resolveGeneralTransit(new Date(m.moment.utcIso), {
      config: readRoxyServerConfig(),
      callPlanets: (config, body) => callRoxyPlanets(config, body),
      rateLimit: (scope, value, limit, windowSeconds) => hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds),
      userId: guard.userId,
      tenantId: guard.tenantId,
      sharedCache: transitDataCache,
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
