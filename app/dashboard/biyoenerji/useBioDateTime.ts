"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";
import { formatDateTime } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";

/** Biyoenerji kayıt tarihi biçimi (gün.ay.yıl saat:dakika; 24 saat). */
export const BIO_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * I18N-F1-R3 — saf biçimleyici. Eski yerel yardımcılarla (`new Intl.DateTimeFormat("tr-TR", …).format(...)`,
 * boş/geçersiz → "—") TR'de BİREBİR: lib/i18n/format.formatDateTime aynı seçeneklerle `toLocaleString("tr-TR")`
 * üretir; geçersiz tarihte "" döner → "—". EN: en-GB (24 saat).
 */
export function formatBioDateTime(iso: string | null | undefined, locale: ActiveLocale): string {
  if (!iso) return "—";
  return formatDateTime(iso, BIO_DATE_TIME_OPTIONS, locale) || "—";
}

/** Bileşen kancası: ekran diline bağlı `formatDate(iso)` (eski yerel yardımcının yerine). */
export function useBioDateTime(): (iso: string | null | undefined) => string {
  const locale = useLocale() as ActiveLocale;
  return useCallback((iso: string | null | undefined) => formatBioDateTime(iso, locale), [locale]);
}
