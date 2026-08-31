/**
 * lib/store/categoryVisuals.ts — Doğal Pazar marka görsel eşlemeleri (YÖN B).
 *
 * Yüklenen özgün AI fotoğrafları (public/magaza/*.png) storefront'un taşıyıcı
 * görselleridir. V1.1'den itibaren kategori görseli ÖNCELİĞİ:
 *   1) kategoriye özel yüklenmiş görsel (store_categories.image_path)
 *   2) yoksa slug'a göre ANLAMLI legacy marka görseli (categoryImageForStrict)
 *   3) hiçbir anlamlı eşleşme yoksa → null (yanlış foto ATANMAZ, zarif yedek gösterilir)
 *
 * Not: eski "bilinmeyen slug'a sırayla foto ata" (CYCLE) davranışı KALDIRILDI — ANALİZ gibi
 * kategoriler artık yanlışlıkla taş/aroma fotoğrafı almaz. Saf sabit + saf yardımcı (client-safe).
 */

export const STORE_HERO_IMAGE = "/magaza/hero.png";

export const STORE_CAT_STONES = "/magaza/kategori-dogal-taslar.png";
export const STORE_CAT_AROMA = "/magaza/kategori-aromaterapi.png";
export const STORE_CAT_CARE = "/magaza/kategori-dogal-bakim.png";

/**
 * Kategori slug'ına göre GÜVENİLİR görsel eşlemesi. Yalnız anlamlı eşleşmede foto döner;
 * eşleşme yoksa null (ör. "Analiz", "Kitaplar", "Setler" için yanlış foto atanmaz).
 */
export function categoryImageForStrict(slug: string | null | undefined): string | null {
  const s = (slug ?? "").toLowerCase();
  if (/tas|kristal|stone|kuvars|ametist|dogaltas/.test(s)) return STORE_CAT_STONES;
  if (/aroma|yag|oil|ucucu|difuz|esans/.test(s)) return STORE_CAT_AROMA;
  if (/bakim|krem|serum|sabun|cilt|care|hidrosol|kozmetik/.test(s)) return STORE_CAT_CARE;
  return null;
}

/**
 * Kategori görseli öncelik çözümü (saf): önce özel yüklenmiş görsel URL'i, yoksa anlamlı
 * legacy marka görseli, o da yoksa null. Arbitrary/yanlış foto ASLA üretmez.
 * `customUrl` server'da image_path → public URL çözümünden gelir (yoksa null).
 */
export function pickCategoryImage(
  customUrl: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  if (typeof customUrl === "string" && customUrl.length > 0) return customUrl;
  return categoryImageForStrict(slug);
}
