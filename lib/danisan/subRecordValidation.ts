/**
 * Danışan alt kayıtları (seans / taş) yazma doğrulaması — saf, ortak (sunucu + istemci).
 *
 * AŞAMA 2 / D1 (DY-04 ≡ CLI-F02, BUG-001): eski route'lar yalnız tenant_id/id/client_id/created_at
 * anahtarlarını atan bir YASAK listesi kullanıyordu → gövdedeki her başka anahtar (bilinmeyen kolon,
 * legacy kolon, updated_at…) doğrudan DB'ye gidiyordu; seans süresi hiç doğrulanmıyordu (negatif
 * değer kabul ediliyordu).
 *  - İZİN LİSTESİ: yalnız UI'ın (SessionsTab / StonesTab formToPayload) yazdığı alanlar.
 *    Diğer anahtarlar yok sayılır (clientValidation ile aynı sözleşme); tenant_id/client_id
 *    sunucuda zorlanır.
 *  - duration_minutes: tam sayı, 0–1440 dakika; boş/null → alan temizlenir.
 *  - Tarihler: gerçek takvim tarihi (YYYY-MM-DD, 1900–2100) ya da boş/null.
 *  - Metinler: string ya da null; uzunluk tavanı.
 * Mevcut kayıtlar değiştirilmez — yalnız yeni yazma istekleri doğrulanır.
 */
import { isValidIsoDate } from "./dateValidation";

export const SESSION_DURATION_MIN = 0;
export const SESSION_DURATION_MAX = 1440;
export const SHORT_TEXT_MAX = 500;
export const LONG_TEXT_MAX = 50000;

type FieldKind = "short" | "long" | "date" | "duration";

const SESSION_FIELDS: Record<string, FieldKind> = {
  session_date: "date",
  session_type: "short",
  duration_minutes: "duration",
  session_note: "long",
  actions_done: "long",
  suggestions: "long",
  next_plan: "long",
};

const STONE_FIELDS: Record<string, FieldKind> = {
  stone_name: "short",
  stone_type: "short",
  note: "long",
  usage_area: "long",
  combination_text: "long",
  warning_text: "long",
  other_notes: "long",
  stone_date: "date",
};

export const SESSION_WRITABLE_FIELDS = Object.keys(SESSION_FIELDS);
export const STONE_WRITABLE_FIELDS = Object.keys(STONE_FIELDS);

export const SUB_RECORD_MESSAGES = {
  durationInvalid: `Seans süresi 0 ile ${SESSION_DURATION_MAX} dakika arasında tam sayı olmalı.`,
  dateInvalid: "Tarih geçerli bir takvim tarihi olmalı (GG.AA.YYYY).",
  textInvalid: "Geçersiz metin alanı.",
  textTooLong: "Metin alanı çok uzun.",
  noFields: "Güncellenecek alan yok.",
} as const;

export type SubRecordValidationResult =
  | { ok: true; fields: Record<string, string | number | null> }
  | { ok: false; code: string; field: string; error: string };

/** Seans süresi kuralı (istemci ve sunucu aynı kuralı kullanır). */
export function isValidSessionDuration(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SESSION_DURATION_MIN &&
    value <= SESSION_DURATION_MAX
  );
}

function validate(
  spec: Record<string, FieldKind>,
  body: Record<string, unknown> | null | undefined,
  mode: "create" | "patch",
): SubRecordValidationResult {
  const src = body ?? {};
  const fields: Record<string, string | number | null> = {};
  for (const [key, kind] of Object.entries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const v = src[key];
    if (kind === "duration") {
      if (v === null || v === undefined || v === "") { fields[key] = null; continue; }
      if (!isValidSessionDuration(v)) {
        return { ok: false, code: "DURATION_INVALID", field: key, error: SUB_RECORD_MESSAGES.durationInvalid };
      }
      fields[key] = v as number;
      continue;
    }
    if (kind === "date") {
      if (v === null || v === undefined || v === "") { fields[key] = null; continue; }
      if (!isValidIsoDate(v)) {
        return { ok: false, code: "DATE_INVALID", field: key, error: SUB_RECORD_MESSAGES.dateInvalid };
      }
      fields[key] = v;
      continue;
    }
    if (v === null || v === undefined) { fields[key] = null; continue; }
    if (typeof v !== "string") {
      return { ok: false, code: "TEXT_INVALID", field: key, error: SUB_RECORD_MESSAGES.textInvalid };
    }
    if (v.length > (kind === "short" ? SHORT_TEXT_MAX : LONG_TEXT_MAX)) {
      return { ok: false, code: "TEXT_TOO_LONG", field: key, error: SUB_RECORD_MESSAGES.textTooLong };
    }
    fields[key] = v;
  }
  if (mode === "patch" && Object.keys(fields).length === 0) {
    return { ok: false, code: "NO_FIELDS", field: "", error: SUB_RECORD_MESSAGES.noFields };
  }
  return { ok: true, fields };
}

/** client_sessions POST/PATCH gövdesi. */
export function validateSessionWrite(
  body: Record<string, unknown> | null | undefined,
  mode: "create" | "patch",
): SubRecordValidationResult {
  return validate(SESSION_FIELDS, body, mode);
}

/** client_stones POST/PATCH gövdesi. */
export function validateStoneWrite(
  body: Record<string, unknown> | null | undefined,
  mode: "create" | "patch",
): SubRecordValidationResult {
  return validate(STONE_FIELDS, body, mode);
}
