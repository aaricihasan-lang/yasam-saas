/**
 * Doğaltaş modülü — ortak font-size deposu (factory).
 *
 * Daha önce modal ve mineral detayı için iki ayrı clamp/read/write modülü +
 * iki ayrı hook vardı (P1-B, ~110 satır tekrar, davranış driftiyle). Tek
 * kaynak: bu factory clamp/read/write üretir; React tarafı `useFontSizeStore`
 * ile paylaşılır. Saf (React'siz) tutulur ki sunucu/istemci ayrımı sorun olmasın.
 */

export type FontSizeStoreConfig = {
  /** localStorage anahtarı. */
  storageKey: string;
  /** Varsayılan punto. */
  defaultPx: number;
  /** İzin verilen en küçük punto. */
  minPx: number;
  /** İzin verilen en büyük punto. */
  maxPx: number;
  /** A+/A- adım miktarı. */
  stepPx: number;
  /** İçerik satır yüksekliği. */
  lineHeight: number;
};

export type FontSizeStore = {
  config: FontSizeStoreConfig;
  /** Değeri [min, max] aralığına yuvarlayıp sıkıştırır. */
  clamp: (px: number) => number;
  /** localStorage'dan okur (SSR'da default döner). */
  read: () => number;
  /** localStorage'a yazar (clamp'lenmiş). */
  write: (px: number) => void;
};

export function createFontSizeStore(config: FontSizeStoreConfig): FontSizeStore {
  const clamp = (px: number): number =>
    Math.min(config.maxPx, Math.max(config.minPx, Math.round(px)));

  const read = (): number => {
    if (typeof window === "undefined") return config.defaultPx;
    const raw = localStorage.getItem(config.storageKey);
    if (!raw) return config.defaultPx;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed) : config.defaultPx;
  };

  const write = (px: number): void => {
    if (typeof window === "undefined") return;
    localStorage.setItem(config.storageKey, String(clamp(px)));
  };

  return { config, clamp, read, write };
}
