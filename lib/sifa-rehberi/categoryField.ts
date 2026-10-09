/**
 * Şifa Rehberi kategori alanı — SAF karar mantığı (WT4, DOM'suz, test edilebilir).
 * Bileşen: components/sifa-rehberi/SifaCategoryField.tsx.
 */
import { SUGGESTED_CATEGORIES } from "@/lib/sifa-rehberi/categories";

/** "Diğer (kendim yazayım)" seçeneğinin değeri — gerçek bir kategori adıyla çakışmaz. */
export const CATEGORY_CUSTOM_OPTION = "__sifa_custom_category__";

/** Önerilen listedeki KANONİK yazımı döndürür (büyük/küçük harf farkı yok sayılır); yoksa null. */
export function canonicalSuggestedCategory(value: string): string | null {
  const v = value.trim().toLocaleLowerCase("tr-TR");
  if (!v) return null;
  return SUGGESTED_CATEGORIES.find((c) => c.toLocaleLowerCase("tr-TR") === v) ?? null;
}

/**
 * `<select>`'in göstereceği değer:
 *  - boş + özel mod kapalı → "" (seçilmedi)
 *  - önerilen kategori → kanonik ad
 *  - önerilen DIŞI dolu değer (eski kayıt) veya kullanıcı "Diğer"i seçtiyse → özel seçenek
 */
export function categorySelectValue(value: string, customMode: boolean): string {
  if (customMode) return CATEGORY_CUSTOM_OPTION;
  if (!value.trim()) return "";
  return canonicalSuggestedCategory(value) ?? CATEGORY_CUSTOM_OPTION;
}

/**
 * Kullanıcı açılır listeden bir seçenek seçti → yeni kategori değeri + özel mod.
 *  - "Diğer": mevcut değer önerilen bir kategoriyse temizlenir (kullanıcı yeni metin yazar);
 *    zaten özel bir metinse korunur.
 *  - "" → kategori kaldırılır.
 *  - önerilen ad → o ad.
 */
export function resolveCategorySelection(
  selected: string,
  current: string,
): { value: string; customMode: boolean } {
  if (selected === CATEGORY_CUSTOM_OPTION) {
    const keep = current.trim() && !canonicalSuggestedCategory(current) ? current : "";
    return { value: keep, customMode: true };
  }
  return { value: selected, customMode: false };
}
