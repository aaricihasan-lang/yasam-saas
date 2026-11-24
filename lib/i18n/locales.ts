/**
 * Yaşam Sistemi — i18n locale registry.
 *
 * URL-prefix YOKTUR (mevcut rotalar korunur: /danisan-yolculugu, /dashboard/... vb.).
 *
 * Yeni dil eklemek: `messages/<locale>/` katalogları + `npm run i18n:catalog` (katalog kaydı
 * otomatik üretilir) + aşağıda `ACTIVE_LOCALES`/`LOCALE_LABELS`/biçim etiketi. Kullanıcıya
 * görünmesi ayrıca yayın kapısına bağlıdır (lib/i18n/gate.ts).
 */

export const DEFAULT_LOCALE = "tr" as const;

/** Kodda çalışabilen (katalogu olan) diller. Production'da görünürlük lib/i18n/gate.ts'tedir. */
export const ACTIVE_LOCALES = ["tr", "en"] as const;

/**
 * Owner kararı (I18N-F1, 2026-11-24): önce İngilizce eksiksiz, ardından Almanca. Fransızca,
 * Hollandaca ve İspanyolca için ayrıca Owner kararı alınacak — henüz plana alınmadı.
 */
export const PLANNED_LOCALES = ["tr", "en", "de"] as const;

export type ActiveLocale = (typeof ACTIVE_LOCALES)[number];
export type PlannedLocale = (typeof PLANNED_LOCALES)[number];

/** Dil seçici / <html lang> için insan-okunur etiketler (her dil kendi adıyla). */
export const LOCALE_LABELS: Record<PlannedLocale, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
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
