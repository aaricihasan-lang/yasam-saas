"use client";

/**
 * Doğaltaş — sunucu hata metninin ekran dilinde gösterimi (I18N gece, Ajan B).
 *
 * Doğaltaş API'leri bugün Türkçe `error` metni döndürüyor. Ortak sözleşme (lib/i18n/apiError.ts):
 *  - Kaynak dilde (tr) sunucu metni BUGÜNKÜ GİBİ aynen gösterilir → Türkçe regresyonu yok.
 *  - Diğer dillerde Türkçe sunucu metni ekrana YAPIŞTIRILMAZ: kod eşlemesi (common.apiErrors.codes) varsa o,
 *    yoksa çağıranın zaten çevrilmiş yedek metni ya da genel hata metni.
 * Kontrol akışı bu metne bağlanmaz; yalnız gösterim içindir.
 */
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { localizeApiError } from "@/lib/i18n/apiError";

export function useDogaltasServerError() {
  const t = useTranslations("common.apiErrors");
  const locale = useLocale();
  // Kararlı kimlik: useCallback/useEffect bağımlılıklarında döngü yaratmaz.
  return useMemo(() => ({
    /** `error ?? fallback` kalıbının dil-güvenli karşılığı. */
    text(error: unknown, fallback?: string, code?: unknown): string {
      return localizeApiError(t, locale, { code, error }, fallback);
    },
    /**
     * Çevrilmiş bir önek metnine `{error}` olarak gömülen ayrıntı. TR'de `error ?? trFallback` ile birebir aynı;
     * diğer dillerde kod eşlemesi ya da genel hata metni.
     */
    detail(error: unknown, trFallback = "", code?: unknown): string {
      if (locale === DEFAULT_LOCALE) return typeof error === "string" ? error : trFallback;
      return localizeApiError(t, locale, { code, error });
    },
  }), [t, locale]);
}
