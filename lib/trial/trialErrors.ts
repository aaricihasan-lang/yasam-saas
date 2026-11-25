/**
 * TRIAL7 — deneme hata yanıtlarının DİL-BAĞIMSIZ kodları + ekran metni eşlemesi (I18N-F1-R3, saf; IO yok).
 *
 * Sunucu (userGuard / roxyMeter / trialCore.trialDenial) Türkçe `error` metnini AYNEN döndürür
 * (TRIAL_MESSAGES — testlerce kilitli, değişmez). Dil-bağımsız ayrım için:
 *   - faz retleri:            `code` = TRIAL_EXPIRED | TRIAL_SUSPENDED | TRIAL_REVIEW | TRIAL_NOT_STARTED
 *   - deneme dışı modül:      `code` = MODULE_DENIED (kontrol akışı için DEĞİŞMEDİ) + EK `trialCode` = MODULE_NOT_IN_TRIAL
 *   - kredi sınırı (429):     `code` = TRIAL_CREDIT_LIMIT + EK `trialCode` = TRIAL_CREDIT_LIMIT | TRIAL_CREDIT_MODULE_LIMIT
 *   - kredi doğrulanamadı:    `code` = TRIAL_CREDIT_UNAVAILABLE
 * İstemci metni `trial.errors.codes.<KOD>` (messages/<dil>/trial.json). Kaynak dilde (tr) sunucunun
 * Türkçe metni BİREBİR gösterilir; diğer dillerde koddan çeviri (karışık dil yok).
 */
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export const MODULE_NOT_IN_TRIAL_CODE = "MODULE_NOT_IN_TRIAL" as const;
export const TRIAL_CREDIT_MODULE_LIMIT_CODE = "TRIAL_CREDIT_MODULE_LIMIT" as const;
export const TRIAL_CREDIT_UNAVAILABLE_CODE = "TRIAL_CREDIT_UNAVAILABLE" as const;

export const TRIAL_ERROR_CODES = [
  "TRIAL_EXPIRED",
  "TRIAL_SUSPENDED",
  "TRIAL_REVIEW",
  "TRIAL_NOT_STARTED",
  "TRIAL_CREDIT_LIMIT",
  TRIAL_CREDIT_MODULE_LIMIT_CODE,
  TRIAL_CREDIT_UNAVAILABLE_CODE,
  MODULE_NOT_IN_TRIAL_CODE,
] as const;
export type TrialErrorCode = (typeof TRIAL_ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(TRIAL_ERROR_CODES);

export type TrialErrorPayload = { code?: unknown; trialCode?: unknown; error?: unknown } | null | undefined;

/** Yanıt gövdesinin deneme hata kodu (önce EK `trialCode`, sonra `code`); deneme hatası değilse null. */
export function trialErrorCode(payload: TrialErrorPayload): TrialErrorCode | null {
  if (!payload || typeof payload !== "object") return null;
  for (const c of [payload.trialCode, payload.code]) {
    if (typeof c === "string" && CODE_SET.has(c)) return c as TrialErrorCode;
  }
  return null;
}

/** useTranslations("trial.errors") alt kümesi. */
export type TrialErrorTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

/**
 * Deneme hata yanıtının ekran metni; deneme hatası değilse null (çağıran kendi eşlemesine devam eder).
 * tr → sunucunun Türkçe metni BİREBİR (yoksa katalog TR kopyası — TRIAL_MESSAGES ile birebir, testle kilitli).
 */
export function localizeTrialError(t: TrialErrorTranslator, locale: string, payload: TrialErrorPayload): string | null {
  const code = trialErrorCode(payload);
  if (!code) return null;
  const serverText = payload && typeof payload.error === "string" ? payload.error.trim() : "";
  if (locale === DEFAULT_LOCALE && serverText) return serverText;
  return t.has(`codes.${code}`) ? t(`codes.${code}`) : null;
}
