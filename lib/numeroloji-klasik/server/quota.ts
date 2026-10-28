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
 *   4) Kalan kota BİLİNMİYORSA (soğuk başlangıç / son gözlem 10 dk'dan eski / başlık hiç gelmedi) "keşif" modu:
 *      süreç başına AYNI ANDA YALNIZ BİR sağlayıcı çağrısı. Diğerleri sırayla en çok 5 sn bekler; taze bir
 *      x-ratelimit-remaining gözlenince hepsi serbest kalır, aksi hâlde biri biri ardına geçer; 5 sn içinde sıra
 *      gelmezse 429 CLASSIC_BUSY (Retry-After 5). Sağlayıcı başlığı HİÇ göndermezse seri çalışma KALICIDIR (sessiz
 *      baypas yok) ve bir kez loglanır. Eski (bayat) ama tabanın altındaki gözlem yine ENGELLER (muhafazakâr).
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
/** Bu süreden eski kalan-kota gözlemi "bilinmiyor" sayılır (keşif modu). */
export const CLASSIC_QUOTA_STALE_MS = 10 * 60 * 1000;
/** Keşif modunda sıra bekleme üst sınırı. */
export const CLASSIC_DISCOVERY_WAIT_MS = 5000;

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

  private discoveryBusy = false;
  private readonly waiters: Array<(release: (() => void) | null) => void> = [];
  private missingHeaderLogged = false;

  /** observedAt: gözlemin gerçek anı (defterden okunan satırda created_at); verilmezse now. */
  observe(rate: ProviderRateInfo, now: number, observedAt: number = now): void {
    if (rate.remaining === null) return;
    // Daha eski bir gözlem daha yenisini ezmesin (paralel çağrılar): aynı dönemde yalnız AZALAN değer kabul.
    const sameWindow = this.resetAt !== null && rate.resetAt !== null && this.resetAt === rate.resetAt;
    if (sameWindow && this.remaining !== null && rate.remaining > this.remaining) return;
    this.remaining = rate.remaining;
    this.resetAt = rate.resetAt;
    this.observedAt = observedAt;
  }

  /** Kalan kota bilinen, dönemi geçmemiş VE son 10 dk içinde gözlenmiş mi? (değilse keşif modu) */
  isFresh(now: number): boolean {
    return this.known(now) !== null && now - this.observedAt <= CLASSIC_QUOTA_STALE_MS;
  }

  /**
   * Keşif kapısı. Kota tazeyse anında serbest (no-op release). Değilse süreç başına tek sahip: boşsa alınır;
   * doluysa en çok waitMs sıra beklenir. Süre dolarsa null (çağıran CLASSIC_BUSY döner).
   * Dönen release() çağrı bitince MUTLAKA çağrılır (tekrar çağrı zararsız).
   */
  async acquireDiscovery(now: () => number, waitMs: number = CLASSIC_DISCOVERY_WAIT_MS): Promise<(() => void) | null> {
    if (this.isFresh(now())) return () => undefined;
    if (!this.discoveryBusy) {
      this.discoveryBusy = true;
      return this.makeRelease(now);
    }
    return new Promise<(() => void) | null>((resolve) => {
      let settled = false;
      const waiter = (release: (() => void) | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(release);
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        waiter(null);
      }, Math.max(0, waitMs));
      this.waiters.push(waiter);
    });
  }

  private makeRelease(now: () => number): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (this.isFresh(now())) {
        // Taze gözlem geldi → keşif biter; bekleyenlerin hepsi serbest (kapısız).
        this.discoveryBusy = false;
        for (const w of this.waiters.splice(0)) w(() => undefined);
        return;
      }
      const next = this.waiters.shift();
      if (next) next(this.makeRelease(now)); // sahiplik sıradakine geçer (discoveryBusy true kalır)
      else this.discoveryBusy = false;
    };
  }

  /** Başarılı yanıtta kalan-kota başlığı yoksa bir kez loglar (seri keşif modu kalıcı). */
  noteMissingHeader(log?: (msg: string, detail?: unknown) => void): void {
    if (this.missingHeaderLogged) return;
    this.missingHeaderLogged = true;
    log?.("[numeroloji-klasik] sağlayıcı kalan-kota başlığı göndermedi; çağrılar seri (tek tek) yürütülecek", {});
  }

  /** Test/teşhis: keşif kapısı dolu mu + bekleyen sayısı. */
  discoveryState(): { busy: boolean; waiting: number } {
    return { busy: this.discoveryBusy, waiting: this.waiters.length };
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
      const at = Date.parse(r.created_at);
      // Gözlem anı = defter satırının zamanı (eski satır → bayat → keşif modu).
      this.observe({ limit: null, remaining: r.quota_remaining, resetAt: Number.isFinite(resetAt as number) ? resetAt : null }, now, Number.isFinite(at) ? Math.min(at, now) : 0);
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
