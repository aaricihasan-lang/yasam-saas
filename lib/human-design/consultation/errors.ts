/**
 * HD Danışmanlık Kullanım Katmanı (F0B) · Typed hata sınıfları
 * ============================================================
 *
 * Saf/deterministik. Bilinmeyen/eşleşmeyen girdi SESSİZCE yutulmaz; typed hata
 * fırlatılır. Hata mesajlarına ASLA tam kaynak metni / hak notu / uzun içerik
 * kopyalanmaz — yalnız alan adı + kısa değer özeti taşınır.
 */

/** Girdi değerini kısa, sızıntısız biçimde özetler (uzun metin kesilir). */
function safeValueLabel(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    const trimmed = value.length > 48 ? `${value.slice(0, 48)}…` : value;
    return JSON.stringify(trimmed);
  }
  return `[${typeof value}]`;
}

/**
 * Harita normalizasyonunda bilinmeyen/eşleşmeyen değer.
 * `field` = "type" | "authority" | "gate" | "channel" | "gates" | "channels".
 */
export class UnknownChartValueError extends Error {
  readonly field: string;
  readonly valueLabel: string;
  constructor(field: string, value: unknown) {
    super(`Bilinmeyen/eşleşmeyen harita değeri (${field}): ${safeValueLabel(value)}`);
    this.name = "UnknownChartValueError";
    this.field = field;
    this.valueLabel = safeValueLabel(value);
  }
}

export type ConditionEvalErrorCode = "UNKNOWN_CONDITION_KIND" | "INVALID_CONDITION_VALUE";

/** Koşul değerlendirmede bilinmeyen kind veya kanonik olmayan değer. Fail-loud. */
export class ConditionEvalError extends Error {
  readonly code: ConditionEvalErrorCode;
  readonly valueLabel: string;
  constructor(code: ConditionEvalErrorCode, value: unknown) {
    super(`Koşul değerlendirme hatası (${code}): ${safeValueLabel(value)}`);
    this.name = "ConditionEvalError";
    this.code = code;
    this.valueLabel = safeValueLabel(value);
  }
}
