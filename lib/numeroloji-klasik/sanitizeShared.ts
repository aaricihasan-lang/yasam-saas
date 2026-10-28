/**
 * Klasik Numeroloji — ortak metin temizlik desenleri (SAF; istemci ve sunucu güvenli).
 *
 * Tek kaynak: normalize/index.ts (cleanText) ve report/sanitize.ts (safeText/safeInline) aynı desenleri
 * kullanır; uzmana görünen hiçbir metinde sağlayıcı markası, URL veya API yolu kalmaz.
 * Not: hepsi /g bayraklıdır → yalnız String.prototype.replace ile kullanılır (.test DEĞİL: lastIndex durumu).
 */

/** Sağlayıcı markası içeren sözcük (ör. marka adı, alan adı parçası). */
export const BRAND_TOKEN_RE = /[\p{L}\p{N}._-]*roxy[\p{L}\p{N}._-]*/giu;
export const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
export const API_PATH_RE = /\/api\/v\d\S*/gi;
export const API_KEY_RE = /\b(?:x-api-key|api[_-]?key)\b/gi;
export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Görünmez / yön değiştiren biçim karakterleri (C1 kontrol dahil): U+007F–U+009F, sıfır genişlik + LRM/RLM
 * (U+200B–U+200F), gömme/geçersiz kılma (U+202A–U+202E), yalıtım (U+2066–U+2069), BOM (U+FEFF).
 * cleanNoteBody (compareService) ile aynı küme.
 */
export const INVISIBLE_FORMAT_RE = /[\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
