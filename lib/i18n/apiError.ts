/**
 * Sunucu hata kodlarını arayüz dilinde gösterme — ORTAK YARDIMCI (I18N-F1; F0 bulgu 6).
 *
 * Sözleşme: API'ler dil-bağımsız `code` döndürür (bugün 685 yerde var). Kullanıcıya gösterilecek metin
 * istemcide `common.apiErrors.codes.<KOD>` anahtarından üretilir. Kontrol akışı ASLA çevrilmiş metne
 * bağlanmaz (Stones 2G/2I dersi).
 *
 * Türkçe regresyonu yok: kaynak dilde (tr) ve kod eşlemesi bulunmayan durumda sunucunun gönderdiği
 * Türkçe `error` metni bugünkü gibi gösterilir. Kaynak dil dışındaki bir dilde, eşlenmemiş kodun Türkçe
 * metni ASLA ekrana yapıştırılmaz → genel hata metni gösterilir (karışık dil yok).
 */
import { DEFAULT_LOCALE } from "./locales";

/** next-intl çeviri fonksiyonunun burada kullanılan alt kümesi (useTranslations("common.apiErrors")). */
export type ErrorTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

export type ApiErrorPayload = { code?: unknown; error?: unknown } | null | undefined;

const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

export function apiErrorCode(payload: ApiErrorPayload): string | null {
  const code = payload && typeof payload === "object" ? payload.code : undefined;
  return typeof code === "string" && CODE_RE.test(code) ? code : null;
}

/**
 * Bir API hata yanıtının ekran metni.
 * @param t        useTranslations("common.apiErrors")
 * @param locale   ekran dili (useLocale())
 * @param payload  API JSON gövdesi ({ code?, error? })
 * @param fallback kod eşlenemezse gösterilecek, çağıranın kendi (zaten çevrilmiş) metni; yoksa genel metin
 */
export function localizeApiError(t: ErrorTranslator, locale: string, payload: ApiErrorPayload, fallback?: string): string {
  const code = apiErrorCode(payload);
  const serverText = payload && typeof payload === "object" && typeof payload.error === "string" ? payload.error.trim() : "";
  // Kaynak dilde (tr) sunucunun metni BİREBİR gösterilir — kod eşlemesi olsa bile (katalog metni sunucu metninden
  // farklı olabilir; ör. DEMO_READONLY). Kod eşlemesi yalnız diğer dillerde ya da sunucu metni yoksa devreye girer.
  if (locale === DEFAULT_LOCALE && serverText) return serverText;
  if (code && t.has(`codes.${code}`)) return t(`codes.${code}`);
  return fallback ?? t("generic");
}

/**
 * Bugünkü `t("toast.x") + ": " + json.error` kalıbının dil-güvenli karşılığı: önek her zaman ekran dilinde;
 * sunucu ayrıntısı kaynak dilde (tr) birebir; diğer dillerde yalnız kod eşlemesi varsa eklenir.
 */
export function withServerDetail(t: ErrorTranslator, locale: string, prefix: string, payload: ApiErrorPayload): string {
  const code = apiErrorCode(payload);
  const serverText = payload && typeof payload === "object" && typeof payload.error === "string" ? payload.error.trim() : "";
  if (locale === DEFAULT_LOCALE && serverText) return `${prefix}: ${serverText}`;
  if (code && t.has(`codes.${code}`)) return `${prefix}: ${t(`codes.${code}`)}`;
  return prefix;
}
