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
 *
 * NOT: Bu YALNIZ LEGACY (section-native OLMAYAN) detay görünümü içindir. Görünen sekme
 * legacy `tab` state'ine bağlıdır. Section-native görünümde RECORD-LEVEL görseller için
 * bunu KULLANMA; `selectRecordLevelImages` kullan (aşağıya bakın) — çünkü section-native
 * navigasyon legacy `tab` state'ini DEĞİŞTİRMEZ ve bu seçici her section sekmesinde aynı
 * section'sız görselleri tekrar döndürürdü (duplicate render).
 */
export function selectTabImages<T extends { section?: string | null }>(
  images: readonly T[],
  tab: string,
  defaultTab: string
): T[] {
  return images.filter((img) => isImageInTab(img.section, tab, defaultTab));
}

// ── RECORD-LEVEL SINIFLANDIRMA (LEGACY TAB FİLTRESİNDEN AYRI) ──────────────────
// Aşağıdaki iki yardımcı, "Yeni kayıt" üst "Görseller" alanından gelen GUIDE/RECORD
// seviyesindeki (section'sız) görselleri sınıflandırır. Bunlar legacy `tab` state'iyle
// veya section-native `sectionTab` state'iyle İLİŞKİLİ DEĞİLDİR: section navigasyonundan
// BAĞIMSIZ, guide-level tek bir "Görseller" galerisinde gösterilirler.

/**
 * Bir görselin RECORD-LEVEL (section'sız) olup olmadığını belirler.
 * section undefined/null/boş string/yalnız-whitespace ise record-level kabul edilir.
 */
export function isUnsectionedImage(section: string | null | undefined): boolean {
  return (typeof section === "string" ? section.trim() : "").length === 0;
}

/**
 * RECORD-LEVEL (section'sız) görselleri süzer. Section-native detay görünümündeki
 * guide-level "Görseller" galerisi bu seçiciyi kullanır. Sonuç herhangi bir sekme
 * (`tab` / `sectionTab`) state'inden BAĞIMSIZDIR; girdi sırası korunur. Section atanmış
 * görseller bu galeriye GİRMEZ.
 */
export function selectRecordLevelImages<T extends { section?: string | null }>(
  images: readonly T[]
): T[] {
  return images.filter((img) => isUnsectionedImage(img.section));
}
