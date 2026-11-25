/**
 * Kalıcı dil tercihi — ÖNCELİK SIRASI ve senkron kararı (saf, test edilebilir; I18N-F1, Owner kararı A7).
 *
 * Kaynaklar:
 *   1. Yayın kapısı (lib/i18n/gate.ts) — kapalıysa her şey kaynak dil (tr); hiçbir tercih uygulanmaz.
 *   2. HESAP tercihi (public.user_locale_prefs, /api/me/locale) — uzmanın kalıcı seçimi; cihazdan,
 *      tarayıcıdan ve oturumdan bağımsızdır. Giriş yapılmışken TEK doğru kaynaktır.
 *   3. NEXT_LOCALE çerezi — render anında okunabilen cihaz önbelleği (sunucu oturumu render sırasında
 *      çözmez; Android'de oturum başlıkla taşınır). Hesap tercihinin bu cihazdaki kopyasıdır.
 *   4. Varsayılan: tr.
 *
 * Ortak bilgisayar: uzman A İngilizce seçip çıkış yapmadan uzman B giriş yaparsa çerez "en" kalır.
 * B'nin hesabında tercih yoksa ("unset") hedef dil kaynak dildir → çerez tr'ye çekilir; B, A'nın
 * dilini görmeye devam etmez. Tercih okunamıyorsa ("unavailable": migration uygulanmamış, demo hesap,
 * ağ hatası) çereze dokunulmaz — elde olmayan bilgiyle mevcut seçimi bozmak yerine korunur.
 */
import { DEFAULT_LOCALE, isActiveLocale, type ActiveLocale } from "./locales";

export type AccountPreference =
  | { status: "set"; locale: ActiveLocale }
  | { status: "unset" }
  | { status: "unavailable"; reason?: string };

export function parseAccountPreference(value: unknown): AccountPreference {
  if (!value || typeof value !== "object") return { status: "unavailable", reason: "invalid" };
  const v = value as Record<string, unknown>;
  if (v.status === "set" && isActiveLocale(v.locale)) return { status: "set", locale: v.locale };
  if (v.status === "unset") return { status: "unset" };
  return { status: "unavailable", reason: typeof v.reason === "string" ? v.reason : undefined };
}

/** Giriş yapılmış bir uzman için uygulanması gereken dil (null = karar verilemez, mevcut korunur). */
export function desiredLocaleForAccount(switchingEnabled: boolean, pref: AccountPreference): ActiveLocale | null {
  if (!switchingEnabled) return DEFAULT_LOCALE;
  if (pref.status === "set") return pref.locale;
  if (pref.status === "unset") return DEFAULT_LOCALE;
  return null;
}

/**
 * Çerez senkron kararı: ekranda görünen dil (currentLocale) hesabın istediğinden farklıysa çerez
 * güncellenip sayfa yenilenir. Kapı kapalıyken çerez zaten yok sayıldığı için işlem yapılmaz.
 */
export function syncDecision(
  switchingEnabled: boolean,
  currentLocale: ActiveLocale,
  pref: AccountPreference,
): { action: "none" } | { action: "apply"; locale: ActiveLocale } {
  if (!switchingEnabled) return { action: "none" };
  const desired = desiredLocaleForAccount(true, pref);
  if (desired === null || desired === currentLocale) return { action: "none" };
  return { action: "apply", locale: desired };
}
