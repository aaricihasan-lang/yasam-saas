/**
 * Danışanlar modülü — hata kodu çözümleme çekirdeği (SAF; React/next-intl yok → harness ile test edilir).
 * Kullanım: lib/danisan/clientApiErrors.ts (useClientsApiError). Bkz. oradaki sözleşme açıklaması.
 */
import { apiErrorCode, type ApiErrorPayload, type ErrorTranslator } from "@/lib/i18n/apiError";

const FIELD_RE = /^[a-z_]{1,32}$/;

/** `{ code, field }` → alan bazlı birleşik kod adayı (ör. INVALID_DATE + dogum → INVALID_DATE_DOGUM). Saf. */
export function fieldScopedCode(payload: ApiErrorPayload): string | null {
  const code = apiErrorCode(payload);
  const field = payload && typeof payload === "object" ? (payload as { field?: unknown }).field : undefined;
  if (!code || typeof field !== "string" || !FIELD_RE.test(field)) return null;
  return `${code}_${field.toUpperCase()}`;
}

/** İki çevirici: önce modül (clients.errors), sonra ortak (common.apiErrors). Saf birleştirici. */
export function chainTranslators(primary: ErrorTranslator, secondary: ErrorTranslator): ErrorTranslator {
  const fn = ((key: string, values?: Record<string, string | number>) =>
    primary.has(key) ? primary(key, values) : secondary(key, values)) as ErrorTranslator;
  fn.has = (key: string) => primary.has(key) || secondary.has(key);
  return fn;
}

/** Payload'ı, varsa alan bazlı koda yönlendirilmiş hâliyle döndürür (Türkçe `error` aynen kalır). Saf. */
export function resolveClientsErrorPayload(t: ErrorTranslator, payload: ApiErrorPayload): ApiErrorPayload {
  const scoped = fieldScopedCode(payload);
  if (scoped && t.has(`codes.${scoped}`)) return { ...(payload as object), code: scoped };
  return payload;
}
