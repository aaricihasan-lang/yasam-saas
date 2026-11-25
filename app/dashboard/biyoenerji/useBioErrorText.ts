"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

/**
 * I18N (2026-11-25) — Biyoenerji istemci hata metni.
 *
 * Kaynak dilde (tr) davranış BİREBİR bugünkü gibidir: sunucunun/istemcinin Türkçe mesajı aynen gösterilir
 * (`e instanceof Error ? e.message : string ? string : fallback`). Kaynak dil dışında Türkçe sunucu metni
 * ekrana YAPIŞTIRILMAZ (karışık dil yok): çağıranın çevrilmiş fallback'i gösterilir. Kontrol akışı bu
 * metne bağlanmaz.
 */
export function useBioErrorText(): (e: unknown, fallback: string) => string {
  const locale = useLocale();
  // Hook kuralı: çeviri bağlamı burada gerekmez; ileride kod eşlemesi için ad alanı ayrıldı.
  useTranslations("bioenergy.common");
  return useCallback(
    (e: unknown, fallback: string) => {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : null;
      if (locale === DEFAULT_LOCALE) return msg ?? fallback;
      return fallback;
    },
    [locale],
  );
}
