// Astroloji — birleşik rapor sınırları (SAF; istemci de import edebilir). K3 (15.11.2026): toplu Word/PDF düğmeleri sınırı
// sunucuyla AYNI sabitten okur (sunucu denetimi report/service.ts'te aynen kalır).

/** Tek dosyada en çok analiz (sunucu süresi + dosya boyutu sınırı). */
export const COMBINED_REPORT_MAX = 30;
