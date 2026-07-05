/**
 * Danışan listesi için kısa ömürlü, bellek-içi (modül kapsamlı) önbellek.
 *
 * Amaç: Liste → Detay → geri dönüşte listeyi sıfırdan çekip skeleton
 * bekletmemek. Client-side navigasyonda modül kapsamı korunduğu için
 * `Map` yaşam boyu sürer. Kayıt/düzenleme/silme sonrası `invalidate...`
 * çağrısıyla bayatlar; böylece kullanıcı yanlış (eski) veri görmez.
 *
 * TTL üst sınırı: 5 dk. Ayrıca `mutatedAt`'tan eski girişler geçersizdir.
 */
export type DanisanListCache = {
  clients: unknown[];
  total: number;
  fullLoaded: boolean;
  alerts: Record<string, number>;
  ts: number;
};

const cache = new Map<string, DanisanListCache>();
let mutatedAt = 0;
const MAX_AGE_MS = 5 * 60 * 1000;

export function getDanisanListCache(tenantId: string): DanisanListCache | null {
  const entry = cache.get(tenantId);
  if (!entry) return null;
  if (entry.ts < mutatedAt) return null; // mutasyondan önce yazılmış → bayat
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return entry;
}

export function setDanisanListCache(
  tenantId: string,
  entry: Omit<DanisanListCache, "ts">,
): void {
  cache.set(tenantId, { ...entry, ts: Date.now() });
}

/** Kayıt/düzenleme/silme sonrası: tüm önbellek girişlerini bayatlat. */
export function invalidateDanisanListCache(): void {
  mutatedAt = Date.now();
}
