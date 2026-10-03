/**
 * A1 — Biyoenerji metinlerini XML 1.0 için güvenli hâle getirir.
 *
 * Word (.docx) document.xml XML 1.0'dır. Geçerli karakterler:
 *   #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 * `docx` kütüphanesi geçersiz kontrol karakterlerini (ör. \v, NUL, \f, ESC) ham yazar →
 * tek bir kayıt, onu içeren tek/seçili/tüm Word dosyasını AÇILMAZ yapar.
 *
 * Kaldırılanlar: C0 kontrol karakterleri (TAB/LF/CR HARİÇ), U+FFFE/U+FFFF ve eşlenmemiş
 * (yalnız) surrogate'ler. Türkçe karakterler, emoji (geçerli surrogate çiftleri), TAB/LF/CR
 * DEĞİŞMEZ. Yalnız Biyoenerji yolunda kullanılır (ortak lib/docx davranışı değişmez).
 */
const XML_INVALID_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeBioenergyXmlText(value: string): string {
  return value.replace(XML_INVALID_RE, "");
}

/** Bir kaydın tüm string alanlarını temizler (diğer tipler aynen). Yeni nesne döner. */
export function sanitizeBioenergyRow<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[k] = typeof v === "string" ? sanitizeBioenergyXmlText(v) : v;
  }
  return out as T;
}
