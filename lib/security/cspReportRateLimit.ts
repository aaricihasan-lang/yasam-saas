/**
 * /api/security/csp-report bellek içi rate limit (IP başına dakikada 60) — DB yazımı YOK.
 *
 * Route dosyasından ayrı tutulur: Next.js route modülleri yalnız HTTP metodları ve segment ayarlarını
 * (runtime, dynamic…) dışa aktarabilir; test yardımcısını route'tan export etmek `next build --webpack`
 * tip kontrolünü kırıyordu (Satış Öncesi #17). Davranış ve sınırlar değişmedi.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { n: number; start: number }>();

export function cspReportRateLimited(key: string, now = Date.now()): boolean {
  const cur = hits.get(key);
  if (!cur || now - cur.start > WINDOW_MS) {
    hits.set(key, { n: 1, start: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

/** Test için. */
export function resetCspReportRateLimit(): void {
  hits.clear();
}
