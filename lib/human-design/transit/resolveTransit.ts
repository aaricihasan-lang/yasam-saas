// Human Design GENEL TRANSİT — SUNUCU ÇÖZÜCÜSÜ (Seçenek A: yerel motor + gerektiğinde doğrulanmış Roxy gezegen konumları).
//
//   1. Yerel motor (computeGeneralTransit). Hiçbir aktivasyon belirsiz değilse → sonuç (Roxy çağrısı YOK).
//   2. Belirsizlik varsa → Roxy POST /astrology/planets (tek UTC anı; doğum verisi YOK). Katmanlar: süreç LRU → kalıcı
//      L2 (`planetStore` verilmişse Supabase hd_transit_planet_positions; verilmemişse / tablo yoksa / DB erişilemezse
//      ESKİ yol: Next Data Cache, unstable_cache) → DB eşzamanlılık kilidi → transit kotası → çağrı. Başarısız / şemasız
//      yanıt HİÇBİR katmana yazılmaz. L2 isabeti kota TÜKETMEZ ve sağlayıcıyı çağırmaz.
//      L2 yolunda kilidi alamayan istek hemen hata vermez: liderin yazmasını SINIRLI süre (WAIT_BUDGET_MS) L2'de yoklar.
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
import type { PlanetStore } from "./transitPlanetStore";

export type TransitResolution =
  /** Yerel motor tüm aktivasyonları kesin buldu. */
  | "local-certain"
  /** Belirsizler doğrulanmış Roxy gezegen konumlarıyla çözüldü; sonuç tam. */
  | "roxy-resolved"
  /** Roxy ile bile sınır payı (Ay 0,7″ / diğer 0,15″) altında vaka kaldı (çok nadir) — sonuç EKSİK. */
  | "roxy-partial"
  /** Roxy kullanılamadı (yapılandırma / kota / hata) — sonuç EKSİK; belirsizler kesin gösterilmez. */
  | "unresolved";

export type ResolvedTransit = { transit: GeneralTransit; resolution: TransitResolution; reason?: string; retryAfterSec?: number };

/** "unresolved" nedenleri (kullanıcı mesajı ayrımı için): kota / başka istek hesaplıyor / diğer (kesinti, yapılandırma). */
export const TRANSIT_UNRESOLVED_QUOTA_REASONS: ReadonlySet<string> = new Set(["rate_limited_user", "rate_limited_tenant"]);
export const TRANSIT_UNRESOLVED_IN_PROGRESS_REASON = "in_progress";

/** Ölçüm olayları (test / gözlem; kişisel veri İÇERMEZ). */
export type TransitResolveMetric =
  | "l1_hit" | "l2_hit" | "l2_repaired_hit" | "l2_miss" | "l2_unavailable" | "lock_acquired" | "lock_denied"
  | "wait_hit" | "wait_timeout" | "provider_call" | "provider_error" | "quota_denied" | "store_written" | "store_exists" | "store_write_failed";

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
  /** Kalıcı L2 (Supabase). Verilirse Next Data Cache'in ÖNÜNDE kullanılır; `unavailable` → sharedCache yolu (eski davranış). */
  planetStore?: PlanetStore;
  /** L2 yolunda kilidi alamayan isteğin liderin sonucunu bekleme üst sınırı (ms). */
  waitBudgetMs?: number;
  metrics?: (m: TransitResolveMetric) => void;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string, detail?: unknown) => void;
};

/**
 * Bekleme üst sınırı: lider en kötü durumda kilit + 2 kota sorgusu + sağlayıcı zaman aşımı (ROXY_POLICY.timeoutMs, 15 sn) +
 * L2 yazma zaman aşımı (2,5 sn) kadar sürer → 15 + 3 sn. Kilit penceresi (inFlight 20 sn) bundan uzundur: süre dolmadan
 * ikinci lider çıkmaz. Bekleme sonsuz değildir; aşılırsa kontrollü "in_progress".
 */
export const TRANSIT_PLANETS_WAIT_BUDGET_MS = ROXY_POLICY.timeoutMs + 3_000;
const WAIT_STEPS_MS = [250, 500, 750, 1000];

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
  constructor(public readonly reason: string, public readonly retryAfterSec?: number) {
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

/**
 * L2 (Supabase) yolu. `null` = L2 kullanılamıyor (tablo yok / DB hatası / onarım sınırı) → çağıran eski sharedCache yoluna döner.
 * İsabet: kota / kilit / sağlayıcı YOK. Iskalama: mevcut kilit + kotalar aynen; kilidi alamayan istek liderin yazmasını
 * TRANSIT_PLANETS_WAIT_BUDGET_MS boyunca yoklar. Yeni sonuç yalnız şema + yerel denetimden SONRA yazılır; yazma hatası sonucu
 * engellemez. L2'den okunan kayıt da aynı yerel denetimden geçer (geçmezse deterministik onarım anahtarı — transitPlanetStore).
 */
async function fetchViaPlanetStore(utcIso: string, key: string, local: GeneralTransit, deps: ResolveDeps): Promise<Record<PlanetName, number> | null> {
  const store = deps.planetStore!;
  const metric = deps.metrics ?? (() => undefined);
  const year = new Date(utcIso).getUTCFullYear();
  const nodeType = roxyPlanetsRequest(utcIso).nodeType;
  const accept = (lon: Record<PlanetName, number>) => {
    try {
      verifyAgainstLocal(lon, local, year);
      return true;
    } catch {
      return false;
    }
  };
  const first = await store.read(utcIso, nodeType, accept);
  if (first.status === "unavailable") {
    metric("l2_unavailable");
    return null;
  }
  if (first.status === "hit") {
    metric(first.repaired ? "l2_repaired_hit" : "l2_hit");
    return first.lon;
  }
  metric("l2_miss");
  if (!deps.config) throw new ProviderUnavailable("not_configured");
  const failedAt = recentFailures.get(key);
  const claim = failedAt !== undefined && Date.now() - failedAt < RECENT_FAILURE_MS
    ? { allowed: true, retryAfterSec: 0 }
    : await deps.rateLimit("hd-transit-planets-inflight", key, TRANSIT_PLANETS_LIMITS.inFlight.limit, TRANSIT_PLANETS_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    metric("lock_denied");
    const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const deadline = Date.now() + (deps.waitBudgetMs ?? TRANSIT_PLANETS_WAIT_BUDGET_MS);
    for (let i = 0; Date.now() < deadline; i++) {
      await sleep(Math.max(0, Math.min(WAIT_STEPS_MS[Math.min(i, WAIT_STEPS_MS.length - 1)], deadline - Date.now())));
      const r = await store.read(utcIso, nodeType, accept);
      if (r.status === "hit") {
        metric("wait_hit");
        return r.lon;
      }
      if (r.status === "unavailable") break;
    }
    metric("wait_timeout");
    throw new ProviderUnavailable(TRANSIT_UNRESOLVED_IN_PROGRESS_REASON, 5);
  }
  metric("lock_acquired");
  // Çift kontrol: kilit alınana kadar başka bir örnek yazmış olabilir (ücretli çağrı yapılmaz).
  const again = await store.read(utcIso, nodeType, accept);
  if (again.status === "hit") {
    metric("l2_hit");
    return again.lon;
  }
  const writeKey = again.status === "miss" ? again.cacheKey : first.cacheKey;
  const u = await deps.rateLimit("hd-transit-planets-user", deps.userId, TRANSIT_PLANETS_LIMITS.perUser.limit, TRANSIT_PLANETS_LIMITS.perUser.windowSeconds);
  if (!u.allowed) {
    metric("quota_denied");
    throw new ProviderUnavailable("rate_limited_user", u.retryAfterSec);
  }
  const t = await deps.rateLimit("hd-transit-planets-tenant", deps.tenantId, TRANSIT_PLANETS_LIMITS.perTenant.limit, TRANSIT_PLANETS_LIMITS.perTenant.windowSeconds);
  if (!t.allowed) {
    metric("quota_denied");
    throw new ProviderUnavailable("rate_limited_tenant", t.retryAfterSec);
  }
  metric("provider_call");
  const r = await deps.callPlanets(deps.config, roxyPlanetsRequest(utcIso));
  if (!r.ok) {
    metric("provider_error");
    throw new ProviderUnavailable(`provider_${r.kind}`);
  }
  const p = parseRoxyPlanets(r.raw);
  if (!p.ok) {
    metric("provider_error");
    throw new ProviderUnavailable("provider_schema");
  }
  verifyAgainstLocal(p.longitudes, local, year); // uyumsuz → TransitVerificationError; HİÇBİR katmana yazılmaz
  const w = await store.write(writeKey, utcIso, nodeType, p.longitudes);
  metric(w === "stored" ? "store_written" : w === "exists" ? "store_exists" : "store_write_failed");
  return p.longitudes;
}

async function fetchPlanetLongitudes(utcIso: string, local: GeneralTransit, deps: ResolveDeps): Promise<Record<PlanetName, number>> {
  const key = `${ROXY_PLANETS_ADAPTER_VERSION}|${utcIso}`;
  const hit = mem.get(key);
  if (hit) {
    deps.metrics?.("l1_hit");
    return hit;
  }
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
      if (!u.allowed) throw new ProviderUnavailable("rate_limited_user", u.retryAfterSec);
      const t = await deps.rateLimit("hd-transit-planets-tenant", deps.tenantId, TRANSIT_PLANETS_LIMITS.perTenant.limit, TRANSIT_PLANETS_LIMITS.perTenant.windowSeconds);
      if (!t.allowed) throw new ProviderUnavailable("rate_limited_tenant", t.retryAfterSec);
      const r = await deps.callPlanets(deps.config, roxyPlanetsRequest(utcIso));
      if (!r.ok) throw new ProviderUnavailable(`provider_${r.kind}`);
      const p = parseRoxyPlanets(r.raw);
      if (!p.ok) throw new ProviderUnavailable("provider_schema");
      verifyAgainstLocal(p.longitudes, local, new Date(utcIso).getUTCFullYear());
      return p.longitudes;
    };
    // L2 (Supabase) yolu: verilmişse ve erişilebilirse ESKİ sharedCache yolunun yerine geçer; erişilemezse (null) eski yol.
    if (deps.planetStore) {
      let viaStore: Record<PlanetName, number> | null;
      try {
        viaStore = await fetchViaPlanetStore(utcIso, key, local, deps);
      } catch (e) {
        recentFailures.set(key, Date.now());
        throw e;
      }
      if (viaStore) {
        recentFailures.delete(key);
        mem.set(key, viaStore);
        while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
        return viaStore;
      }
    }
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
      return { transit: local, resolution: "unresolved", reason: e.reason, ...(e.retryAfterSec ? { retryAfterSec: e.retryAfterSec } : {}) };
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
