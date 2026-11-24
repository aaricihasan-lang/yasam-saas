// Gökyüzü Atlası — AYLIK EFEMERİS servisi (YALNIZ SUNUCU): önbellek → sağlayıcı → izdüşüm → bağımsız kontrol.
//
// MALİYET KURALI: bir ay = sağlayıcıya EN ÇOK 1 istek (ayın tamamı tek yanıt). Sıra:
//   1) süreç belleği (LRU)  2) kalıcı önbellek (astro_sky_monthly_cache, tenant'sız; içerik kişisel veri değildir)
//   3) yalnız `allowProvider` ise sağlayıcı — aynı ay için eşzamanlı istekler TEK uçuşta birleşir (ikinci istek ücret ödemez).
// Önbellek anahtarı: uç + gövde (yıl, ay, Vedik'te koordinat sistemi) + izdüşüm sürümü + sağlayıcı API sürümü + dil → tür (tropikal /
// sideral), kaynak, koordinat sistemi ve yöntem sürümü anahtara girer. Gezegen filtresi, sıralama, rapor ve arşivden açma bu servisi
// `allowProvider: false` ile çağırır (ya da kayıtlı anlık görüntüyü kullanır) → yeni ücretli çağrı BAŞLATAMAZ.
// Kalıcı önbellek tablosu yoksa (migration uygulanmamış) yalnız süreç belleğiyle çalışır; hata kullanıcıya yansımaz.
// Ücretli çağrı yeniden DENENMEZ (zaman aşımında sağlayıcı hesabı yapmış olabilir → çift maliyet).
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ROXY_API_VERSION, ROXY_PROVIDER } from "@/lib/astrology/config";
import type { RoxyCallResult } from "@/lib/astrology/providers/roxy/client";
import { Lru } from "../ephemeris/provider";
import { MONTHLY_ADAPTER_VERSION, MONTHLY_ENDPOINT, MONTHLY_NODE_METHOD, monthlyProviderBody, projectMonthly } from "./contract";
import { crossCheckMonthly } from "./crossCheck";
import type { MonthlyEphemeris, MonthlyError, MonthlyRequest } from "./types";

assertServerOnly("lib/astrology/pro/monthly/service");

export const MONTHLY_PROVIDER_LANG = "en" as const;
export const MONTHLY_METHODOLOGY_VERSION = `${MONTHLY_ADAPTER_VERSION}@12utc+de440-crosscheck-2026-11-24`;
export const CACHE_TABLE = "astro_sky_monthly_cache";

export type ProviderCall = (endpoint: string, body: Record<string, unknown>) => Promise<RoxyCallResult>;
export type MonthlyDeps = {
  db: Pick<SupabaseClient, "from"> | null;
  /** null → sağlayıcı yapılandırılmamış. */
  callProvider: ProviderCall | null;
  /** Sağlayıcı çağrısından HEMEN önce (önbellek ıskası kesinleşince) çağrılır; false → istek atılmaz (hız sınırı). */
  beforeProviderCall?: () => Promise<{ ok: true } | { ok: false; retryAfterSec: number }>;
  now?: () => Date;
};
export type MonthlyOutcome =
  | { ok: true; result: MonthlyEphemeris; cache: "memory" | "db" | "provider"; providerCalls: number }
  | { ok: false; error: MonthlyError & { retryAfterSec?: number }; providerCalls: number };

export function monthlyCacheKey(req: MonthlyRequest): string {
  const canon = JSON.stringify({ e: MONTHLY_ENDPOINT[req.kind], b: monthlyProviderBody(req), a: MONTHLY_ADAPTER_VERSION, v: ROXY_API_VERSION, l: MONTHLY_PROVIDER_LANG });
  return createHash("sha256").update(canon).digest("hex");
}

const MEMORY = new Lru<MonthlyEphemeris>(400);
const IN_FLIGHT = new Map<string, Promise<MonthlyOutcome>>();
/** Yalnız testler: süreç önbelleğini sıfırlar. */
export function __resetMonthlyMemoryForTests() {
  (MEMORY as unknown as { m: Map<string, unknown> }).m.clear();
  IN_FLIGHT.clear();
}

/** Kayıtlı/önbellekteki sonucun bağımsız kontrolü "yapılamadı" ise (o anda DE440 yoksa) yerelde yeniden denenir — sağlayıcı çağrısı YOK. */
function refreshCrossCheck(e: MonthlyEphemeris): MonthlyEphemeris {
  if (e.crossCheck.status !== "unavailable") return e;
  const cc = crossCheckMonthly(e.kind, e.days);
  return cc.status === "unavailable" ? e : { ...e, crossCheck: cc };
}

function isMonthlyEphemeris(x: unknown, req: MonthlyRequest): x is MonthlyEphemeris {
  const e = x as MonthlyEphemeris | null;
  return !!e && typeof e === "object" && e.kind === req.kind && e.year === req.year && e.month === req.month && Array.isArray(e.days) && Array.isArray(e.bodies) && !!e.crossCheck && !!e.source;
}

async function readDbCache(db: MonthlyDeps["db"], key: string, req: MonthlyRequest): Promise<MonthlyEphemeris | null> {
  if (!db) return null;
  try {
    const { data, error } = await db.from(CACHE_TABLE).select("technical").eq("cache_key", key).maybeSingle();
    if (error || !data) return null;
    const t = (data as { technical?: unknown }).technical;
    return isMonthlyEphemeris(t, req) ? t : null;
  } catch {
    return null;
  }
}

async function writeDbCache(db: MonthlyDeps["db"], key: string, req: MonthlyRequest, raw: unknown, technical: MonthlyEphemeris): Promise<void> {
  if (!db) return;
  try {
    const row = {
      cache_key: key,
      kind: req.kind,
      year: req.year,
      month: req.month,
      provider: ROXY_PROVIDER,
      provider_api_version: ROXY_API_VERSION,
      adapter_version: MONTHLY_ADAPTER_VERSION,
      endpoint: MONTHLY_ENDPOINT[req.kind],
      request: monthlyProviderBody(req),
      raw_response: raw,
      technical,
    };
    // Düz INSERT (tablo yalnız SELECT/INSERT yetkili). Aynı anahtar başka süreçte yazılmışsa 23505 → sessizce geç (içerik
    // deterministik; ilk yazılan korunur). upsert/on_conflict KULLANILMAZ.
    const { error } = await (db.from(CACHE_TABLE) as unknown as { insert: (r: unknown) => Promise<{ error: { code?: string } | null }> }).insert(row);
    if (error && error.code !== "23505") console.error("[astro-monthly] önbellek yazılamadı", { code: error.code ?? "unknown" });
  } catch {
    /* kalıcı önbellek yoksa süreç belleğiyle devam */
  }
}

async function fetchFromProvider(req: MonthlyRequest, key: string, deps: MonthlyDeps): Promise<MonthlyOutcome> {
  if (!deps.callProvider) return { ok: false, providerCalls: 0, error: { code: "PROVIDER_DISABLED", error: "Hesaplama altyapısı şu anda yapılandırılmamış. Daha önce hesaplanmış aylar yine açılabilir." } };
  if (deps.beforeProviderCall) {
    const g = await deps.beforeProviderCall();
    if (!g.ok) return { ok: false, providerCalls: 0, error: { code: "RATE_LIMITED", error: "Kısa sürede çok fazla yeni ay hesaplandı. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: g.retryAfterSec } };
  }
  const endpoint = MONTHLY_ENDPOINT[req.kind];
  const r = await deps.callProvider(endpoint, monthlyProviderBody(req));
  const calls = Math.max(1, r.attempts);
  if (!r.ok) {
    console.error("[astro-monthly] sağlayıcı hatası", { kind: req.kind, status: r.status ?? null, err: r.kind });
    return { ok: false, providerCalls: calls, error: { code: "PROVIDER_FAILED", error: "Hesaplama altyapısından bu ay alınamadı; tablo eksik veriyle gösterilmez. Lütfen biraz sonra tekrar deneyin." } };
  }
  const pr = projectMonthly(req, r.raw);
  if (!pr.ok) {
    console.error("[astro-monthly] yanıt reddedildi", { kind: req.kind, year: req.year, month: req.month, reason: pr.reason });
    return { ok: false, providerCalls: calls, error: { code: "PROVIDER_INCONSISTENT", error: "Hesaplama altyapısının yanıtı tutarlılık denetiminden geçmedi; tablo gösterilmez." } };
  }
  const cc = crossCheckMonthly(req.kind, pr.days);
  if (cc.status === "fail") {
    console.error("[astro-monthly] bağımsız kontrol başarısız", { kind: req.kind, year: req.year, month: req.month, max: cc.maxAbsArcsec, at: cc.maxAt, retro: cc.retroMismatches });
    return { ok: false, providerCalls: calls, error: { code: "CROSSCHECK_FAILED", error: "Hesaplanan konumlar bağımsız kontrolden geçmedi (tolerans dışı fark); tablo gösterilmez ve saklanmaz." } };
  }
  const result: MonthlyEphemeris = {
    kind: req.kind,
    year: req.year,
    month: req.month,
    zodiac: req.kind === "western" ? "tropical" : "sidereal",
    ayanamsa: req.kind === "western" ? null : "lahiri",
    nodeMethod: MONTHLY_NODE_METHOD[req.kind],
    timeOfDay: "12:00",
    timeReference: "UTC",
    bodies: pr.bodies,
    missingBodies: pr.missingBodies,
    days: pr.days,
    source: { id: "provider", endpoint, adapterVersion: MONTHLY_ADAPTER_VERSION, providerApiVersion: ROXY_API_VERSION, fetchedAt: (deps.now?.() ?? new Date()).toISOString() },
    crossCheck: cc,
  };
  MEMORY.set(key, result);
  await writeDbCache(deps.db, key, req, r.raw, result);
  return { ok: true, result, cache: "provider", providerCalls: calls };
}

export async function getMonthlyEphemeris(req: MonthlyRequest, deps: MonthlyDeps, opts: { allowProvider: boolean }): Promise<MonthlyOutcome> {
  const key = monthlyCacheKey(req);
  const mem = MEMORY.get(key);
  if (mem) {
    const fresh = refreshCrossCheck(mem);
    if (fresh !== mem) MEMORY.set(key, fresh);
    return { ok: true, result: fresh, cache: "memory", providerCalls: 0 };
  }
  const db = await readDbCache(deps.db, key, req);
  if (db) {
    const fresh = refreshCrossCheck(db);
    MEMORY.set(key, fresh);
    return { ok: true, result: fresh, cache: "db", providerCalls: 0 };
  }
  // Kalıcı önbellek okuması beklerken aynı ayın sağlayıcı isteği bu süreçte TAMAMLANMIŞ olabilir (tek uçuş kaydı silinmiştir) →
  // belleğe yeniden bakılır; aksi hâlde aynı ay için ikinci ücretli istek giderdi.
  const late = MEMORY.get(key);
  if (late) return { ok: true, result: late, cache: "memory", providerCalls: 0 };
  if (!opts.allowProvider) return { ok: false, providerCalls: 0, error: { code: "NOT_CACHED", error: "Bu ayın tablosu henüz hesaplanmamış. Önce tabloyu hesaplayın." } };
  const pending = IN_FLIGHT.get(key);
  if (pending) {
    const o = await pending;
    return o.ok ? { ...o, cache: "memory", providerCalls: 0 } : { ...o, providerCalls: 0 };
  }
  const p = fetchFromProvider(req, key, deps).finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, p);
  return p;
}
