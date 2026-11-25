/**
 * KUPA & HACAMAT — API hata yanıtlarının dil-bağımsız kodları (I18N-F1-R3).
 *
 * Sözleşme: `/api/kupa/**` hata yanıtı `{ ok:false, code:"CUP_*", error:<Türkçe güvenli metin AYNEN> }`.
 * İstemci kodu `cupping.errors.codes.<KOD>` ile ekran diline çevirir; kaynak dilde (tr) sunucu metni
 * BİREBİR gösterilir. Kontrol akışı (ör. 404 → "bulunamadı" ekranı) metne değil KODA bağlanır.
 *
 * Saf modül (sunucu + istemci ortak; Next/DB bağımlılığı yok).
 */
export const CUPPING_ERROR_CODES = [
  // Genel
  "CUP_DB_FAIL",
  "CUP_READ_FAILED",
  "CUP_NOT_FOUND",
  "CUP_DUPLICATE",
  "CUP_IN_USE",
  "CUP_INVALID_BODY",
  "CUP_NO_FIELDS",
  "CUP_ID_REQUIRED",
  "CUP_CLIENT_ID_REQUIRED",
  "CUP_FIELD_INVALID",
  "CUP_FIELD_TOO_LONG",
  "CUP_LIST_TOO_LONG",
  "CUP_WORD_FAILED",
  // Zorunlu alanlar
  "CUP_NAME_REQUIRED",
  "CUP_TITLE_REQUIRED",
  "CUP_NOTE_TEXT_REQUIRED",
  "CUP_CONTENT_REQUIRED",
  "CUP_STEP_TEXT_REQUIRED",
  // Sahiplik / bulunamadı
  "CUP_PROTOCOL_NOT_OWNED",
  "CUP_POINT_NOT_OWNED",
  "CUP_POINT_OR_TOPIC_NOT_OWNED",
  "CUP_TOPIC_NOT_OWNED",
  "CUP_TEMPLATE_NOT_OWNED",
  "CUP_SOURCE_NOT_OWNED",
  "CUP_TECHNIQUE_NOT_OWNED",
  "CUP_SAFETY_NOT_OWNED",
  "CUP_TECHNIQUE_NOT_FOUND",
  "CUP_SOURCE_NOT_FOUND",
  "CUP_POINT_NOT_FOUND",
  "CUP_SAFETY_NOT_FOUND",
  // Protokol ilişkileri
  "CUP_TECHNIQUE_ALREADY_ADDED",
  "CUP_SAFETY_ALREADY_ADDED",
  "CUP_POINT_ALREADY_ADDED",
  "CUP_TECHNIQUE_IN_STEP",
  "CUP_POINT_IN_STEP",
  "CUP_STEP_TECHNIQUE_NOT_IN_PROTOCOL",
  "CUP_STEP_POINT_NOT_IN_PROTOCOL",
  "CUP_TOO_MANY_POINTS",
  // Noktalar / güvenlik
  "CUP_MAP_INVALID",
  "CUP_POSITION_INVALID",
  "CUP_SEVERITY_INVALID",
  // Hacamat Takvimi
  "CUP_YEAR_INVALID",
  "CUP_YEAR_OUT_OF_RANGE",
  "CUP_MONTH_INVALID",
  "CUP_MONTH_DUPLICATE",
  "CUP_TOO_MANY_DAYS",
  "CUP_DATE_OUTSIDE_PLAN_YEAR",
  "CUP_DATE_INVALID",
  "CUP_DAY_ITEM_INVALID",
  "CUP_DATES_REQUIRED",
  "CUP_PLAN_HAS_DAYS",
  "CUP_ADVICE_TEMPLATE_MISSING",
  "CUP_DAY_COLOR_INVALID",
  "CUP_DAY_COLOR_REQUIRED",
  "CUP_DAY_COLOR_REMOVE",
  "CUP_DAY_LABEL_INVALID",
  "CUP_DAY_LABEL_TOO_LONG",
  "CUP_DAY_NOTE_INVALID",
  "CUP_DAY_NOTE_TOO_LONG",
] as const;

export type CuppingErrorCode = (typeof CUPPING_ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(CUPPING_ERROR_CODES);

export function isCuppingErrorCode(v: unknown): v is CuppingErrorCode {
  return typeof v === "string" && CODE_SET.has(v);
}
