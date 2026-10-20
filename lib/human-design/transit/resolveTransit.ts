// Human Design GENEL TRANSİT — SUNUCU ÇÖZÜCÜSÜ (Seçenek A: yerel motor + gerektiğinde doğrulanmış Roxy gezegen konumları).
//
//   1. Yerel motor (computeGeneralTransit). Hiçbir aktivasyon belirsiz değilse → sonuç (Roxy çağrısı YOK).
//   2. Belirsizlik varsa → Roxy POST /astrology/planets (tek UTC anı; doğum verisi YOK). Katmanlar: süreç LRU → kalıcı
//      Next Data Cache (unstable_cache; anlık gök verisi kişisel değildir, tenant'tan bağımsız) → DB eşzamanlılık kilidi →
//      transit kotası → çağrı. Başarısız / şemasız yanıt HİÇBİR katmana yazılmaz.
//   3. Çapraz denetim (bağımsız motor): her cisimde |Roxy − yerel| ≤ yerel belirsizlik payı + Roxy payı. Yerelin KESİN bulduğu her
//      aktivasyonda Roxy kapı/çizgisi birebir aynı olmalı. Aksi → TransitVerificationError (fail-closed; gösterilmez).
//   4. Kapı/çizgi/kanal/merkez Roxy boylamlarından mevcut mandala + 36 kanal tablosuyla (belirsizlik payı: Ay 0,7″, diğer 0,15″).
//   5. Roxy erişilemezse → yerel sonuç "çözülemedi" durumuyla döner (belirsizler kesin gösterilmez; başarı sayılmaz).

import { ROXY_POLICY, type RoxyServerConfig } from "../providers/roxy/config";
import type { RoxyCallResult } from "../providers/roxy/client";
import type { PlanetName } from "../engine/types";
import {
  buildGeneralTransit,
  computeGeneralTransit,
  roxyPlanetsUncertaintyArcsec,
  TRANSIT_BODY_ORDER,
  transitUncertaintyArcsec,
  type GeneralTransit,
} from "./generalTransit";
import { parseRoxyPlanets, ROXY_PLANETS_ADAPTER_VERSION, roxyPlanetsRequest, type RoxyPlanetsRequest } from "./roxyPlanetsClient";

export type TransitResolution =
  /** Yerel motor tüm aktivasyonları kesin buldu. */
  | "local-certain"
  /** Belirsizler doğrulanmış Roxy gezegen konumlarıyla çözüldü; sonuç tam. */
  | "roxy-resolved"
  /** Roxy ile bile sınır payı (Ay 0,7″ / diğer 0,15″) altında vaka kaldı (çok nadir) — sonuç EKSİK. */
  | "roxy-partial"
  /** Roxy kullanılamadı (yapılandırma / kota / hata) — sonuç EKSİK; belirsizler kesin gösterilmez. */
  | "unresolved";

export type ResolvedTransit = { transit: GeneralTransit; resolution: TransitResolution; reason?: string };

export class TransitVerificationError extends Error {
  constructor(public readonly details: Array<{ body: PlanetName; roxyLon: number; localLon: number; diffArcsec: number; allowedArcsec: number }>) {
    super("Gezegen konumları bağımsız motorla doğrulanamadı.");
  }
}

export type ResolveDeps = {
  config: RoxyServerConfig | null;
  callPlanets: (config: RoxyServerConfig, body: RoxyPlanetsRequest) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  userId: string;
  tenantId: string;
  /** Kalıcı paylaşılan önbellek (route'ta Next Data Cache). Verilmezse yalnız süreç önbelleği. */
  sharedCache?: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string, detail?: unknown) => void;
};

/** Transit Roxy çağrısı kotası (BodyGraph kotasından AYRI: transit keşfi analiz oluşturmayı engellemesin). */
export const TRANSIT_PLANETS_LIMITS = Object.freeze({
  perUser: { limit: 60, windowSeconds: 60 * 60 },
  perTenant: { limit: 600, windowSeconds: 24 * 60 * 60 },
  inFlight: { limit: 1, windowSeconds: 20 },
});

// ── Süreç önbelleği (boylamlar; an başına değişmez) ───────────────────────────
const MEM_MAX = 2000;
const mem = new Map<string, Record<PlanetName, number>>();
const pending = new Map<string, Promise<Record<PlanetName, number>>>();
/** Bu süreçte az önce başarısız olan anahtar: yeniden deneme bitmemiş DB kilidine takılmaz (kota yine uygulanır). */
const recentFailures = new Map<string, number>();
const RECENT_FAILURE_MS = 30_000;
export function __resetTransitResolverCache() {
  mem.clear();
  pending.clear();
  recentFailures.clear();
}

class ProviderUnavailable extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

const angDiffArcsec = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) * 3600;

/** Roxy boylamlarını BAĞIMSIZ yerel motorla denetle — önbelleğe yazmadan ÖNCE (uyumsuz yanıt hiçbir katmana girmez). */
function verifyAgainstLocal(lon: Record<PlanetName, number>, local: GeneralTransit, year: number): void {
  const bad: TransitVerificationError["details"] = [];
  for (const body of TRANSIT_BODY_ORDER) {
    const l = local.activations.find((a) => a.body === body)!;
    const d = angDiffArcsec(lon[body], l.longitude);
    const allowed = transitUncertaintyArcsec(body, year) + roxyPlanetsUncertaintyArcsec(body);
    if (d > allowed) bad.push({ body, roxyLon: lon[body], localLon: l.longitude, diffArcsec: d, allowedArcsec: allowed });
  }
  if (bad.length) throw new TransitVerificationError(bad);
}

async function fetchPlanetLongitudes(utcIso: string, local: GeneralTransit, deps: ResolveDeps): Promise<Record<PlanetName, number>> {
  const key = `${ROXY_PLANETS_ADAPTER_VERSION}|${utcIso}`;
  const hit = mem.get(key);
  if (hit) return hit;
  const inProcess = pending.get(key);
  if (inProcess) return inProcess;
  const run = (async () => {
    const load = async () => {
      if (!deps.config) throw new ProviderUnavailable("not_configured");
      const failedAt = recentFailures.get(key);
      const claim = failedAt !== undefined && Date.now() - failedAt < RECENT_FAILURE_MS
        ? { allowed: true, retryAfterSec: 0 }
        : await deps.rateLimit("hd-transit-planets-inflight", key, TRANSIT_PLANETS_LIMITS.inFlight.limit, TRANSIT_PLANETS_LIMITS.inFlight.windowSeconds);
      if (!claim.allowed) {
        // Başka örnek aynı anı çekiyor → kısa bekleme; paylaşılan önbellek bir sonraki istekte dolu olur.
        await (deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))))(1500);
        throw new ProviderUnavailable("in_progress");
      }
      const u = await deps.rateLimit("hd-transit-planets-user", deps.userId, TRANSIT_PLANETS_LIMITS.perUser.limit, TRANSIT_PLANETS_LIMITS.perUser.windowSeconds);
      if (!u.allowed) throw new ProviderUnavailable("rate_limited_user");
      const t = await deps.rateLimit("hd-transit-planets-tenant", deps.tenantId, TRANSIT_PLANETS_LIMITS.perTenant.limit, TRANSIT_PLANETS_LIMITS.perTenant.windowSeconds);
      if (!t.allowed) throw new ProviderUnavailable("rate_limited_tenant");
      const r = await deps.callPlanets(deps.config, roxyPlanetsRequest(utcIso));
      if (!r.ok) throw new ProviderUnavailable(`provider_${r.kind}`);
      const p = parseRoxyPlanets(r.raw);
      if (!p.ok) throw new ProviderUnavailable("provider_schema");
      verifyAgainstLocal(p.longitudes, local, new Date(utcIso).getUTCFullYear());
      return p.longitudes;
    };
    // Paylaşılan önbellek yalnız BAŞARILI + şemadan ve bağımsız denetimden geçmiş boylamları saklar (load hata fırlatırsa saklanmaz).
    let lon: Record<PlanetName, number>;
    try {
      lon = deps.sharedCache ? await deps.sharedCache(key, load) : await load();
    } catch (e) {
      recentFailures.set(key, Date.now());
      throw e;
    }
    // Paylaşılan önbellekten gelen kayıt da (eski sürüm vb.) yeniden denetlenir.
    verifyAgainstLocal(lon, local, new Date(utcIso).getUTCFullYear());
    recentFailures.delete(key);
    mem.set(key, lon);
    while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
    return lon;
  })();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }
}

export async function resolveGeneralTransit(utc: Date, deps: ResolveDeps): Promise<ResolvedTransit> {
  const local = computeGeneralTransit(utc);
  if (!local.hasUncertainty) return { transit: local, resolution: "local-certain" };
  const utcIso = utc.toISOString().replace(".000Z", "Z");
  let lon: Record<PlanetName, number>;
  try {
    lon = await fetchPlanetLongitudes(utcIso, local, deps);
  } catch (e) {
    if (e instanceof ProviderUnavailable) {
      deps.log?.("[hd-transit] planets unavailable", { reason: e.reason, utc: utcIso });
      return { transit: local, resolution: "unresolved", reason: e.reason };
    }
    throw e;
  }
  // Çapraz denetim fetchPlanetLongitudes içinde (önbelleğe yazmadan önce) yapıldı.
  const map = new Map<PlanetName, number>(TRANSIT_BODY_ORDER.map((b) => [b, lon[b]]));
  const resolved = buildGeneralTransit(utc, map, { provider: "roxy-planets", mode: "verified", nodeType: ROXY_POLICY.nodeType }, (body) => roxyPlanetsUncertaintyArcsec(body));
  // Yerelin KESİN bulduğu aktivasyonlar birebir aynı olmalı (bağımsız ikinci denetim).
  for (const l of local.activations) {
    if (!l.certain) continue;
    const r = resolved.activations.find((a) => a.body === l.body)!;
    if (r.gate !== l.gate || r.line !== l.line) throw new TransitVerificationError([{ body: l.body, roxyLon: lon[l.body], localLon: l.longitude, diffArcsec: angDiffArcsec(lon[l.body], l.longitude), allowedArcsec: 0 }]);
  }
  return { transit: resolved, resolution: resolved.hasUncertainty ? "roxy-partial" : "roxy-resolved" };
}
