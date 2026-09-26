/**
 * lib/dogaltas/reportSanitize.ts — Doğaltaş Word/DOCX rapor sınırı için XML 1.0
 * güvenli metin temizliği (RPT-XML). dogaltas-scoped; paylaşımlı builder
 * primitive'lerine (reportHelpers) DOKUNMAZ → başka modüllerin rapor davranışı
 * değişmez.
 *
 * AMAÇ: kullanıcı/DB string'lerinde bulunabilecek XML 1.0'da GEÇERSİZ kontrol
 * karakterlerini (docx'i bozar) yalnızca Doğaltaş rapor motoruna girmeden önce
 * temizlemek. Türkçe karakter, Unicode ve emoji KORUNUR (sanitizeXmlText yalnız
 * illegal kontrol karakterlerini kaldırır). Metin anlamsızca kısaltılmaz.
 */
import { sanitizeXmlText } from "@/lib/docx/reportHelpers";

/**
 * Bir değeri (string / dizi / düz nesne) derinlemesine dolaşıp tüm string
 * alanlarını XML-güvenli hale getirir. String olmayan değerler (number/boolean/
 * null/undefined) aynen döner. Referans şekli korunur (yeni kopya üretir).
 */
export function sanitizeXmlDeep<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeXmlText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeXmlDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeXmlDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}
