/**
 * Refleksoloji protokol araması için Türkçe + diakritik-duyarsız normalize.
 *
 * Profesyonel kullanımda "böbrek" ile "bobrek", "karaciğer" ile "karaciger"
 * aynı kaydı bulmalı. Yalnız `toLocaleLowerCase("tr-TR")` bunu sağlamaz
 * (ö ≠ o). NFD ayrıştırma + birleşik-işaret (combining marks, U+0300–U+036F)
 * temizliği ile diakritikleri düşürürüz. Türkçe büyük/küçük I/İ katlaması korunur.
 *
 * Salt istemci-tarafı (arama zaten client-side; tüm satırlar bir kez çekiliyor).
 */
export function foldSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
