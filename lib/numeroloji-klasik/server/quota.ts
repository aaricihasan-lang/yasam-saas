/**
 * Klasik Numeroloji — ücretli çağrı korumaları (YALNIZ SUNUCU).
 *
 *   1) Kullanıcı başına saatte 60, tenant başına günde 400 YENİ sağlayıcı çağrısı (önbellek isabeti sayılmaz).
 *   2) Aynı önbellek anahtarı için eşzamanlı TEK çağrı:
 *        • süreç içi single-flight (aynı instance'ta ikinci istek ilk çağrının sonucunu bekler, 0 ek çağrı)
 *        • instance'lar arası DB kilidi (`deps.rateLimit` → hitDbRateLimit, limit 1 / 90 sn)
 *   3) Ortak kota tabanı: sağlayıcı anahtarı HD + Atlas ile ORTAKTIR. Son görülen `x-ratelimit-remaining`
 *      değeri (bellek + provider_calls defteri) NUMEROLOGY_CLASSIC_QUOTA_FLOOR'un (varsayılan 3000) altındaysa
 *      yeni Klasik Numeroloji çağrısı YAPILMAZ. /usage ucu otomatik ÇAĞRILMAZ (1 birim tüketir).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIC_WORST_CALL_MS, type ProviderRateInfo } from "./providerClient";

assertServerOnly("lib/numeroloji-klasik/server/quota");

export const CLASSIC_RATE_LIMITS = Object.freeze({
  perUser: { limit: 60, windowSeconds: 60 * 60 },
  perTenant: { limit: 400, windowSeconds: 24 * 60 * 60 },
  /** ≥ 2 × en kötü çağrı (45 sn) → kilit, çağrı + kayıt bitmeden düşmez. */
  inFlight: { limit: 1, windowSeconds: Math.ceil((2 * CLASSIC_WORST_CALL_MS) / 1000) },
});

export const CLASSIC_QUOTA_FLOOR_DEFAULT = 3000;

export function readQuotaFloor(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.NUMEROLOGY_CLASSIC_QUOTA_FLOOR ?? "").trim();
  if (!/^\d{1,9}$/.test(raw)) return CLASSIC_QUOTA_FLOOR_DEFAULT;
  return Number(raw);
}

export type RateLimitFn = (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;

/** Sağlayıcı aylık kalan kota gözlemi (süreç belleği; soğuk başlangıçta defterden okunur). */
export class ProviderQuotaState {
  remaining: number | null = null;
  resetAt: number | null = null;
  observedAt = 0;
  private loaded = false;

  observe(rate: ProviderRateInfo, now: number): void {
    if (rate.remaining === null) return;
    // Daha eski bir gözlem daha yenisini ezmesin (paralel çağrılar): aynı dönemde yalnız AZALAN değer kabul.
    const sameWindow = this.resetAt !== null && rate.resetAt !== null && this.resetAt === rate.resetAt;
    if (sameWindow && this.remaining !== null && rate.remaining > this.remaining) return;
    this.remaining = rate.remaining;
    this.resetAt = rate.resetAt;
    this.observedAt = now;
  }

  /** Bilinen (ve dönemi geçmemiş) kalan kota; bilinmiyorsa null. */
  known(now: number): number | null {
    if (this.remaining === null) return null;
    if (this.resetAt !== null && now >= this.resetAt) return null;
    return this.remaining;
  }

  /** Soğuk başlangıç: defterdeki son gözlem (tenant'tan bağımsız; yalnız sayı okunur). Hata → bilinmiyor. */
  async loadOnce(db: SupabaseClient, now: number): Promise<void> {
    if (this.loaded || this.remaining !== null) return;
    this.loaded = true;
    try {
      const { data, error } = await db
        .from("numerology_classic_provider_calls")
        .select("quota_remaining, quota_reset_at, created_at")
        .not("quota_remaining", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error || !Array.isArray(data) || data.length === 0) return;
      const r = data[0] as { quota_remaining: number | null; quota_reset_at: string | null; created_at: string };
      if (typeof r.quota_remaining !== "number") return;
      const resetAt = r.quota_reset_at ? Date.parse(r.quota_reset_at) : null;
      this.observe({ limit: null, remaining: r.quota_remaining, resetAt: Number.isFinite(resetAt as number) ? resetAt : null }, now);
    } catch {
      // bilinmiyor
    }
  }
}

/** Süreç geneli tekil durum (route'lar paylaşır; testler kendi örneğini enjekte eder). */
export const sharedProviderQuotaState = new ProviderQuotaState();

/** Süreç içi single-flight: aynı anahtar için tek Promise. */
export class SingleFlight<T> {
  private readonly inflight = new Map<string, Promise<T>>();
  run(key: string, fn: () => Promise<T>): Promise<T> {
    const cur = this.inflight.get(key);
    if (cur) return cur;
    const p = (async () => {
      try {
        return await fn();
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
  get size(): number {
    return this.inflight.size;
  }
}
