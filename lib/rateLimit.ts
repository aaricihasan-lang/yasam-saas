/**
 * Minimal, bağımlılıksız in-memory rate limiter (fixed-window).
 *
 * Amaç: word-report gibi pahalı uçları tek kullanıcının art arda kötüye
 * kullanmasına karşı korumak. Vercel/Fluid Compute'ta instance-başına state
 * tutar (global değil) — yani en kötü ihtimalle instance sayısı kadar gevşer;
 * ama normal kullanıcının birkaç gerçek export'unu engellemeden burst'ü keser.
 * Ağır/global bir altyapı (Redis vb.) BİLİNÇLİ olarak kurulmadı (Faz 1 kapsamı).
 */
type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * @param key      kullanıcı/tenant bazlı benzersiz anahtar
 * @param limit    pencere başına izin verilen istek sayısı
 * @param windowMs pencere süresi (ms)
 * @param now      test edilebilirlik için enjekte edilebilir zaman
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Test yardımcısı — sayaçları sıfırlar. */
export function __resetRateLimitStore(): void {
  store.clear();
}

// ── Reusable ms-tabanlı arayüz (Beslenme Word ve sonraki uçlar) ──────────────

export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitVerdict = { ok: boolean; remaining: number; retryAfterMs: number };

/**
 * `checkRateLimit` ile AYNI in-memory fixed-window store'u kullanan, ms cinsinden
 * `retryAfterMs` dönen ergonomik sarmalayıcı.
 *
 * BEST-EFFORT / PER-INSTANCE: state yalnız çağıran runtime instance'ında tutulur.
 * Vercel Fluid Compute çok-instance'lı olduğundan gerçek üst-sınır ≈ (limit × instance
 * sayısı) olabilir; global/atomik DEĞİLDİR (Redis vb. yok). Kötüye-kullanım (art arda
 * burst) için MVP koruması olarak KABUL EDİLEBİLİR; sıkı kota gerektiren durumlarda
 * merkezi bir sayaç kullanılmalıdır. Saf/test-edilebilir (`now` enjekte edilebilir).
 */
export function rateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitVerdict {
  const r = checkRateLimit(key, opts.limit, opts.windowMs, now);
  return {
    ok: r.allowed,
    remaining: r.remaining,
    retryAfterMs: r.retryAfterSeconds * 1000,
  };
}
