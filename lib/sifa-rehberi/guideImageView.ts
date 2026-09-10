/**
 * ŞİFA REHBERİ — GÖRSEL GÖRÜNÜM (DETAY SEKME) SAF YARDIMCILARI
 *
 * BUG (post-merge UAT): "Yeni kayıt" ekranındaki üst "Görseller" alanından yüklenen
 * görseller RECORD-LEVEL / TOP-LEVEL olarak `healing_guides.images` içine `section`
 * ALANI OLMADAN yazılır ({ id, name, file_path }). Detay sekmeleri görselleri
 * `img.section === tab` ile filtrelediği için section'sız görseller HİÇBİR sekmeyle
 * eşleşmiyordu → DB'de mevcut olmasına rağmen görünmüyordu.
 *
 * ÇÖZÜM (backward-compatible, DB REWRITE YOK): section'sız (top-level) görseller
 * varsayılan/ilk sekmede ("Rahatsızlık" / genel görünüm) gösterilir; section atanmış
 * görseller kendi sekme davranışını korur. Aynı görsel iki yerde render EDİLMEZ.
 *
 * Bu saf yardımcılar production DB/storage'a DOKUNMAZ; yalnız render-filtre kararıdır.
 */

/**
 * Bir görselin verilen sekmede gösterilip gösterilmeyeceğini belirler.
 *
 * - section'sız (undefined/null/boş/whitespace) görsel → yalnız `defaultTab`'te görünür.
 * - section atanmış görsel → yalnız o section === tab olduğunda görünür.
 */
export function isImageInTab(
  section: string | null | undefined,
  tab: string,
  defaultTab: string
): boolean {
  const normalized = typeof section === "string" ? section.trim() : "";
  if (normalized.length === 0) {
    // TOP-LEVEL / section'sız RECORD-LEVEL görsel → varsayılan sekme.
    return tab === defaultTab;
  }
  return normalized === tab;
}

/**
 * Aktif sekmede gösterilecek görselleri süzer. Girdi sırası korunur; hiçbir görsel
 * birden fazla kez döndürülmez (her görsel ya section'sız → defaultTab, ya da tek bir
 * section'a ait).
 */
export function selectTabImages<T extends { section?: string | null }>(
  images: readonly T[],
  tab: string,
  defaultTab: string
): T[] {
  return images.filter((img) => isImageInTab(img.section, tab, defaultTab));
}
