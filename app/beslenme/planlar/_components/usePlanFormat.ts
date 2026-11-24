"use client";
/**
 * Beslenme planı — ekran diline göre biçim / etiket yardımcıları (I18N gece, Ajan B).
 * TR'de planFormat.ts'nin bugünkü çıktısı BİREBİR korunur (tarih "02.08.2026", "2 Ağu Cum", binlik "1.930").
 * Diğer dillerde ay/gün adları katalogdan, sayılar Intl ile (yalnız gösterim; hesap değişmez).
 * Kanonik değerler (plan durumu, besin kodu, şablon tipi) çevrilmez; yalnız etiketleri eşlenir.
 */
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE, isActiveLocale } from "@/lib/i18n/locales";
import { localeTag } from "@/lib/i18n/format";
import { NUTRIENT_LABELS } from "@/lib/beslenme/planContracts";
import { TEMPLATE_TYPE_LABELS, type TemplateType } from "@/lib/beslenme/templateContracts";
import { formatDateShort, formatDateTr, planErrorKey, type PlanStatusLike } from "./planFormat";

const STATUS_KEYS = new Set(["draft", "active", "archived"]);

export function usePlanFormat() {
  const t = useTranslations("beslenme.fmt");
  const locale = useLocale();
  return useMemo(() => {
    const isTr = locale === DEFAULT_LOCALE;
    const numTag = isTr ? "tr-TR" : localeTag(isActiveLocale(locale) ? locale : DEFAULT_LOCALE);
    const parts = (iso: string | null | undefined) => {
      if (!iso || typeof iso !== "string") return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
      return m ? { y: m[1], mo: m[2], d: m[3] } : null;
    };
    return {
      /** Sayı biçimi etiketi (TR'de bugünkü "tr-TR"). */
      numTag,
      /** API hata kodu → ekran dilinde kullanıcı mesajı. */
      error: (code?: string, status?: number) => t(`errors.${planErrorKey(code, status)}`),
      status: (s: PlanStatusLike) => t(`status.${STATUS_KEYS.has(s) ? s : "draft"}`),
      nutrient: (code: string) => (t.has(`nutrient.${code}`) ? t(`nutrient.${code}`) : (NUTRIENT_LABELS[code] ?? code)),
      templateType: (ty: TemplateType) => (t.has(`templateType.${ty}`) ? t(`templateType.${ty}`) : TEMPLATE_TYPE_LABELS[ty]),
      /** "02.08.2026" (TR) · "02/08/2026" (diğer). */
      date: (iso: string | null | undefined) => {
        if (isTr) return formatDateTr(iso);
        const p = parts(iso);
        return p ? `${p.d}/${p.mo}/${p.y}` : "—";
      },
      /** "2 Ağu Cum" (TR) · "Fri 2 Aug" (diğer). */
      dateShort: (iso: string | null | undefined) => {
        if (isTr) return formatDateShort(iso);
        const p = parts(iso);
        if (!p) return "—";
        const dt = new Date(`${p.y}-${p.mo}-${p.d}T00:00:00Z`);
        if (Number.isNaN(dt.getTime())) return "—";
        return `${t(`weekdayShort.${dt.getUTCDay()}`)} ${Number(p.d)} ${t(`monthShort.${Number(p.mo)}`)}`;
      },
    };
  }, [t, locale]);
}
