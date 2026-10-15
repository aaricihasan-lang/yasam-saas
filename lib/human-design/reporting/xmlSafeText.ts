// HD-09 — Word (OOXML / XML 1.0) için güvenli metin (SAF, yalnız HD raporları).
//
// XML 1.0 yalnız şu karakterlere izin verir: TAB, LF, CR, U+0020–U+D7FF, U+E000–U+FFFD ve geçerli
// vekil çiftleri (U+10000+). Uzmanın Word'den yapıştırdığı U+000B (Shift+Enter), U+000C (sayfa sonu),
// eşleşmemiş vekil karakterleri vb. document.xml'e ham girerse Word dosyayı AÇAMAZ ("okunamayan
// içerik"). Donmuş snapshot her indirmede aynı kalacağı için bozuk rapor kalıcı olurdu.
//
//   • Satır benzeri ayırıcılar (U+000B, U+000C, U+2028, U+2029) → çok satırlı metinde "\n",
//     tek satırlık alanda (başlık/etiket) boşluk. Anlam (satır sonu) korunur.
//   • Diğer yasak kontrol karakterleri, U+FFFE/U+FFFF ve eşleşmemiş vekiller silinir.
//   • Türkçe, Arapça, emoji (geçerli vekil çifti), TAB ve normal satır sonları AYNEN korunur;
//     güvenli metin hiç değişmez (idempotent).
//
// Ortak lib/docx/reportHelpers.sanitizeXmlText'e dokunulmadı (diğer modüller + açık PR'lar);
// bu yardımcı yalnız HD Word üretiminde ve HD kayıtlarında kullanılır.

// Kaynakta ham kontrol/ayırıcı karakter OLMASIN diye desenler kaçışlı dizeden kurulur.
const LINE_LIKE = new RegExp("[\u000B\u000C\u2028\u2029]", "g");
const XML_FORBIDDEN = new RegExp(
  "[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]",
  "g",
);

/** Çok satırlı metin (açıklama içeriği): satır benzeri ayırıcılar satır sonuna dönüşür. */
export function hdXmlSafeMultiline(input: string): string {
  return input.replace(LINE_LIKE, "\n").replace(XML_FORBIDDEN, "");
}

/** Tek satırlık metin (ad, başlık, etiket, belge başlığı): ayırıcılar boşluğa dönüşür. */
export function hdXmlSafeLine(input: string): string {
  return input.replace(LINE_LIKE, " ").replace(XML_FORBIDDEN, "");
}

/** Metinde XML 1.0'da yasak karakter kaldı mı? (testler + savunma kontrolü) */
export function hasXmlForbiddenChars(input: string): boolean {
  XML_FORBIDDEN.lastIndex = 0;
  const bad = XML_FORBIDDEN.test(input) || /[\u000B\u000C]/.test(input);
  XML_FORBIDDEN.lastIndex = 0;
  return bad;
}
