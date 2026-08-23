/**
 * Yaşam Sistemi — i18n locale registry.
 *
 * FAZ 1 / AŞAMA 2A: Yalnızca Türkçe (tr) AKTİF/source locale'dir.
 * URL-prefix YOKTUR (mevcut rotalar korunur: /danisan-yolculugu, /dashboard/... vb.).
 *
 * Gelecekteki diller (en/de/fr) burada TANIMLI ama SELECTABLE DEĞİL. Yeni dil
 * eklemek için `ACTIVE_LOCALES`'a eklemek + ilgili `messages/<locale>/` dosyalarını
 * yazmak yeterlidir; başka kod değişikliği gerekmez.
 */

export const DEFAULT_LOCALE = "tr" as const;

/** Kullanıcının gerçekten seçebileceği (aktif) diller. Bu turda yalnız TR. */
export const ACTIVE_LOCALES = ["tr"] as const;

/** İleride hedeflenen dil sırası (TR → EN → DE → FR). Henüz selectable DEĞİL. */
export const PLANNED_LOCALES = ["tr", "en", "de", "fr"] as const;

export type ActiveLocale = (typeof ACTIVE_LOCALES)[number];
export type PlannedLocale = (typeof PLANNED_LOCALES)[number];

/** Dil seçici / <html lang> için insan-okunur etiketler. */
export const LOCALE_LABELS: Record<PlannedLocale, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
  fr: "Français",
};

/** Locale tercihini taşıyan cookie adı (next-intl standardı). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isActiveLocale(value: unknown): value is ActiveLocale {
  return typeof value === "string" && (ACTIVE_LOCALES as readonly string[]).includes(value);
}

/**
 * Güvenli locale çözümü: yalnız AKTİF bir locale kabul edilir, aksi halde
 * source locale (tr)'ye düşülür. Böylece cookie ile bilinmeyen/kapalı bir dil
 * zorlanamaz.
 */
export function resolveLocale(candidate: string | null | undefined): ActiveLocale {
  return isActiveLocale(candidate) ? candidate : DEFAULT_LOCALE;
}
