/**
 * Türkçe arama yardımcıları (ortak).
 *
 * Modülden bağımsız, saf metin normalizasyonu. Büyük/küçük harf ve Türkçe
 * karakter farkı olmadan karşılaştırma yapmak isteyen her yer buradan içe aktarır.
 */

/**
 * Metni Türkçe karakter ve büyük/küçük harf farkı olmadan karşılaştırılabilir
 * forma çevirir.
 *
 * Dönüşümler: ç→c  ğ→g  ı→i  İ→i  ö→o  ş→s  ü→u
 * Ayrıca NFD + combining mark temizliği yapılır (é→e, İ→i̇→i gibi).
 *
 * Not: `"İ".toLowerCase()` JS'te "i̇" (birleşik noktalı) üretir ve düz "i" ile
 * eşleşmez. `toLocaleLowerCase("tr-TR")` + açık harf eşlemesi + NFD temizliği bu
 * sorunu çözer; "İlknur" araması "ilknur" ile eşleşir.
 */
export function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Türkçe normalize ederek `haystack` içinde `needle` arar.
 * "İlknur" ile "ilknur", "Işık" ile "isik" eşleşir.
 */
export function containsTr(
  haystack: string | null | undefined,
  needle: string,
): boolean {
  if (!haystack) return false;
  const n = normalizeTr(needle);
  if (!n) return true;
  return normalizeTr(haystack).includes(n);
}
