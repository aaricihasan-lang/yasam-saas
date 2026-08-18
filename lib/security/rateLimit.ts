/**
 * En-iyi-çaba (best-effort) bellek-içi rate limiter.
 *
 * SINIRLAMA: Vercel Fluid Compute / çok-instance ortamında sayaç instance-YEREL'dir;
 * global KESİN sınır DEĞİLDİR. Bu nedenle DoS/abuse'a karşı deterministik koruma
 * SAYILMAZ — yalnız gürültü / kaza-tekrar / basit script tekrarını azaltan ek
 * savunma katmanıdır. Asıl deterministik koruma çağrı yerindeki HARD CAP'lerdir
 * (ör. rapor export kayıt tavanı).
 *
 * `now` dışarıdan verilir → saf/test edilebilir (harness deterministik doğrular).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Süresi dolan kovaları temizler (bellek sızıntısını önler). Test/bakım için. */
export function pruneRateLimit(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Yalnız test/harness için — kova durumunu sıfırlar. */
export function __resetRateLimitForTest(): void {
  buckets.clear();
}
