// Doğaltaş Kütüphanesi · aktarım sınırları (SAF). Route dosyaları yalnız route export'larını taşır.

/** Tek çalıştırmada sunucunun izin verdiği en yüksek ücretli çağrı (owner daha düşüğünü isteyebilir). */
export const IMPORT_MAX_CREDITS_PER_RUN = 1000;
/** Sağlayıcı kalan kotasının altına inilmeyecek taban (Atlas / Human Design canlı kullanımı için pay). */
export const IMPORT_QUOTA_FLOOR = 5000;
/** Aktarım ucunda süre bütçesi: Vercel 300 sn sınırından önce zarif durma. */
export const IMPORT_DEADLINE_MS = 240_000;
