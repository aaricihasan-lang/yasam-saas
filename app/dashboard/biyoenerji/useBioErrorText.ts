"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { bioErrorCodeFor } from "@/lib/biyoenerji/secureApi";

/**
 * I18N (2026-11-25) — Biyoenerji istemci hata metni.
 *
 * Kaynak dilde (tr) davranış BİREBİR bugünkü gibidir: sunucunun/istemcinin Türkçe mesajı aynen gösterilir
 * (`e instanceof Error ? e.message : string ? string : fallback`). Kaynak dil dışında Türkçe sunucu metni
 * ekrana YAPIŞTIRILMAZ (karışık dil yok). I18N-F1-R3: metnin dil-bağımsız kodu biliniyorsa
 * (`lib/biyoenerji/secureApi` kaydı; BIO_* ya da ortak DEMO_READONLY vb.) `bioenergy.errors.codes.<KOD>`,
 * yoksa ortak `common.apiErrors.codes.<KOD>` gösterilir; eşlenemeyen her şey çağıranın çevrilmiş fallback'i.
 * Kontrol akışı bu metne bağlanmaz.
 */
export function useBioErrorText(): (e: unknown, fallback: string) => string {
  const locale = useLocale();
  const t = useTranslations("bioenergy.errors");
  const tCommon = useTranslations("common.apiErrors");
  return useCallback(
    (e: unknown, fallback: string) => {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : null;
      if (locale === DEFAULT_LOCALE) return msg ?? fallback;
      const code = bioErrorCodeFor(msg);
      if (code) {
        if (t.has(`codes.${code}`)) return t(`codes.${code}`);
        if (tCommon.has(`codes.${code}`)) return tCommon(`codes.${code}`);
      }
      return fallback;
    },
    [locale, t, tCommon],
  );
}
