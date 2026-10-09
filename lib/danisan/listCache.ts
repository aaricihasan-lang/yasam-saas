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
  /** WT7: ödenmemiş ücret özeti (clientId → adet/toplam); yalnız payment_status='unpaid'. */
  unpaid?: Record<string, { count: number; total: number }>;
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

/**
 * Tekli danışan silme sonrası: cache'deki listeden yalnız bu danışanı id ile çıkar,
 * toplamı bir azalt ve danışanın "Aktif Uyarı" katkısını düşür; diğer alanlar (fullLoaded, kalan danışanlar ve sıralama)
 * korunur. Böylece detaydan silip listeye dönünce cold refetch/skeleton olmadan
 * güncel liste anında görünür — toplu silmedeki setDanisanListCache davranışıyla aynı.
 *
 * Fail-safe: cache girişi yoksa no-op → liste sunucudan taze (silinmiş danışan
 * içermeyen) yüklenir; hiçbir durumda silinmiş danışan gösterilmez.
 * (Detay sayfası liste state'ini tutmadığı için in-place güncelleme yapılır.)
 */
export function removeClientFromDanisanListCache(
  tenantId: string,
  clientId: string,
): void {
  const entry = cache.get(tenantId);
  if (!entry) return;
  const clients = entry.clients.filter(
    (c) => (c as { id?: string } | null | undefined)?.id !== clientId,
  );
  // Silinen danışanın "Aktif Uyarı" katkısı da düşer (danışan sayfalı listede yüklü olmasa bile).
  const hadAlert = Object.prototype.hasOwnProperty.call(entry.alerts ?? {}, clientId);
  const alerts = hadAlert ? { ...entry.alerts } : entry.alerts;
  if (hadAlert) delete (alerts as Record<string, number>)[clientId];
  const removed = clients.length !== entry.clients.length;
  // Ne liste ne uyarı değiştiyse hiçbir şey yazma; total yalnız gerçekten çıkarılınca azalır.
  if (!removed && !hadAlert) return;
  cache.set(tenantId, {
    ...entry,
    clients: removed ? clients : entry.clients,
    total: removed ? Math.max(0, entry.total - 1) : entry.total,
    alerts,
    ts: Date.now(),
  });
}
