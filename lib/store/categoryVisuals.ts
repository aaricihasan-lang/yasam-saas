/**
 * lib/store/categoryVisuals.ts — Doğal Pazar marka görsel eşlemeleri (YÖN B).
 *
 * Yüklenen özgün AI fotoğrafları (public/magaza/*.png) storefront'un taşıyıcı
 * görselleridir. Kategori tile'ları slug'a göre eşlenir; bilinmeyen slug'lar sırayla
 * üç kategori görselinden birini alır. Saf sabit + saf yardımcı (client-safe).
 */

export const STORE_HERO_IMAGE = "/magaza/hero.png";

export const STORE_CAT_STONES = "/magaza/kategori-dogal-taslar.png";
export const STORE_CAT_AROMA = "/magaza/kategori-aromaterapi.png";
export const STORE_CAT_CARE = "/magaza/kategori-dogal-bakim.png";

const CYCLE = [STORE_CAT_STONES, STORE_CAT_AROMA, STORE_CAT_CARE];

/**
 * Kategori slug'ına göre GÜVENİLİR görsel eşlemesi. Yalnız anlamlı eşleşmede foto döner;
 * eşleşme yoksa null (ör. "Kitaplar", "Setler", "Hizmetler" için yanlış foto atanmaz).
 */
export function categoryImageForStrict(slug: string | null | undefined): string | null {
  const s = (slug ?? "").toLowerCase();
  if (/tas|kristal|stone|kuvars|ametist|dogaltas/.test(s)) return STORE_CAT_STONES;
  if (/aroma|yag|oil|ucucu|difuz|esans/.test(s)) return STORE_CAT_AROMA;
  if (/bakim|krem|serum|sabun|cilt|care|hidrosol|kozmetik/.test(s)) return STORE_CAT_CARE;
  return null;
}

/**
 * Fotoğraflı büyük vitrin tile'ı için görsel (her zaman bir foto döner). Anlamlı eşleşme
 * yoksa sıralı marka görseli kullanılır — yalnız öne çıkan 3 büyük tile için uygundur.
 */
export function categoryImageFor(slug: string | null | undefined, index = 0): string {
  return categoryImageForStrict(slug) ?? CYCLE[index % CYCLE.length];
}
