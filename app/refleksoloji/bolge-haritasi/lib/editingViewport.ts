/**
 * Bölge Haritası düzenleme viewport eşiği — SAF (React'sız, test edilebilir).
 *
 * ÜRÜN KURALI: ayak üzerinde HASSAS koordinat düzenleme yalnız yeterince geniş
 * ekranlarda (masaüstü/laptop) açıktır. Karar viewport GENİŞLİĞİNE dayanır
 * (user-agent sniffing DEĞİL). Eşik, mevcut Tailwind `lg` kırılımıdır (1024px) —
 * Bölge Haritası masaüstü 3-panel düzeninin de başladığı genişlik.
 */

/** Düzenlemenin açık olduğu en küçük viewport genişliği (Tailwind `lg`). */
export const REGION_EDIT_MIN_WIDTH = 1024;

/** Verilen genişlikte hassas bölge düzenleme açık mı? */
export function isEditViewportWidth(width: number): boolean {
  return width >= REGION_EDIT_MIN_WIDTH;
}
