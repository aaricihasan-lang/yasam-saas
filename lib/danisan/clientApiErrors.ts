"use client";
/**
 * Danışanlar modülü — sunucu hata yanıtını ekran diline çevirme (I18N-F1-R3, F0 bulgu 6).
 *
 * Sözleşme (brifing ek kural 3): `/api/clients/**` yanıtları dil-bağımsız `code` + Türkçe `error` döner.
 *  - Kaynak dilde (tr) sunucunun Türkçe metni BİREBİR gösterilir (bugünkü davranış).
 *  - Diğer dillerde önce `clients.errors.codes.<KOD>`, yoksa ortak `common.apiErrors.codes.<KOD>` (oturum,
 *    demo, sunucu hatası gibi ortak kodlar), o da yoksa çağıranın çevrilmiş metni / genel metin.
 * Kontrol akışı hiçbir yerde çevrilmiş metne bağlanmaz.
 *
 * Alan bazlı doğrulama (lib/danisan/clientValidation): aynı kod (INVALID_DATE / INVALID_FIELD) farklı alanlar için
 * farklı metin taşır → `field` ile birleşik anahtar (INVALID_DATE_DOGUM …) önce denenir; yoksa yalın kod.
 */
import { useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localizeApiError, withServerDetail, type ApiErrorPayload, type ErrorTranslator } from "@/lib/i18n/apiError";
import { chainTranslators, resolveClientsErrorPayload } from "./clientApiErrorCore";

export { chainTranslators, fieldScopedCode, resolveClientsErrorPayload } from "./clientApiErrorCore";

export type ClientsApiErrorFns = {
  /** Sunucu hata metni (tr: sunucu metni birebir). fallback: çağıranın zaten çevrilmiş metni. */
  message: (payload: ApiErrorPayload, fallback?: string) => string;
  /** `önek: ayrıntı` kalıbı (eski `t(x) + ": " + json.error`). */
  detail: (prefix: string, payload: ApiErrorPayload) => string;
};

export function useClientsApiError(): ClientsApiErrorFns {
  const tClients = useTranslations("clients.errors");
  const tCommon = useTranslations("common.apiErrors");
  const locale = useLocale();
  const t = useMemo(
    () => chainTranslators(tClients as unknown as ErrorTranslator, tCommon as unknown as ErrorTranslator),
    [tClients, tCommon],
  );
  const message = useCallback(
    (payload: ApiErrorPayload, fallback?: string) =>
      localizeApiError(t, locale, resolveClientsErrorPayload(t, payload), fallback ?? tClients("generic")),
    [t, locale, tClients],
  );
  const detail = useCallback(
    (prefix: string, payload: ApiErrorPayload) => withServerDetail(t, locale, prefix, resolveClientsErrorPayload(t, payload)),
    [t, locale],
  );
  return useMemo(() => ({ message, detail }), [message, detail]);
}
