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
