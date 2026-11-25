"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import { HIJRI_MONTHS_TR, type HijriDate } from "@/lib/cupping/hijri";
import { MONTHS_TR } from "../components/MonthCalendar";
import { WEEKDAYS_TR } from "./bulk";
import { CUPPING_DAY_COLORS, cuppingCellBadge, type CuppingCellKind } from "./cellState";
import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";

/**
 * I18N (2026-11-25) — Hacamat Takvimi ay/gün/Hicrî ay adlarının GÖSTERİMİ.
 *
 * YALNIZ GÖSTERİM: tarih/Hicrî hesap (lib/cupping/hijri.ts, bulk.ts) DEĞİŞMEZ; ay/gün NUMARALARI aynı kalır.
 * - tr: mevcut sabitler BİREBİR (MONTHS_TR, WEEKDAYS_TR, HIJRI_MONTHS_TR, HijriDate.formatted).
 * - diğer diller: Miladi ay + haftagünü Intl ile (lib/i18n/format → en-GB); Hicrî ay adı yerleşik
 *   İngilizce transliterasyon (messages/<dil>/cupping.calendar.json → cupping.calendar.hijriMonths.<1-12>);
 *   renk adı / durum rozeti aynı katalogdan (colors.<key>, badge.<kind>).
 */
export function useCalendarNames() {
  const locale = useLocale() as ActiveLocale;
  const t = useTranslations("cupping.calendar");
  return useMemo(() => {
    const isTr = locale === DEFAULT_LOCALE;
    const months: readonly string[] = isTr
      ? MONTHS_TR
      : Array.from({ length: 12 }, (_, i) => formatDate(new Date(2024, i, 1, 12), { month: "long" }, locale));
    // 2024-01-01 Pazartesi → ISO 1..7.
    const weekdays: { iso: number; long: string; short: string }[] = isTr
      ? WEEKDAYS_TR
      : WEEKDAYS_TR.map((w) => {
          const d = new Date(2024, 0, w.iso, 12);
          return { iso: w.iso, long: formatDate(d, { weekday: "long" }, locale), short: formatDate(d, { weekday: "short" }, locale) };
        });
    const hijriMonth = (n: number): string => (isTr ? (HIJRI_MONTHS_TR[n - 1] ?? "") : n >= 1 && n <= 12 ? t(`hijriMonths.${n}`) : "");
    const hijriText = (h: HijriDate | null | undefined): string =>
      !h ? "" : isTr ? h.formatted : `${h.day} ${hijriMonth(h.month)} ${h.year}`;
    /** Renk ADI (a11y; renk anlamı değil). Anahtar kanonik (CUPPING_DAY_COLOR_KEYS). */
    const colorLabel = (key: CuppingDayColorKey): string => (isTr ? CUPPING_DAY_COLORS[key].labelTr : t(`colors.${key}`));
    /** Durum rozeti (tr: cuppingCellBadge birebir). */
    const badge = (kind: CuppingCellKind): string | null => {
      const tr = cuppingCellBadge(kind);
      return isTr || tr === null ? tr : t(`badge.${kind}`);
    };
    return { isTr, months, weekdays, hijriMonth, hijriText, colorLabel, badge };
  }, [locale, t]);
}

export type CalendarNames = ReturnType<typeof useCalendarNames>;
