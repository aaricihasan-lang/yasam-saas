/**
 * Yaşam Sistemi — YABANCI DİL YAYIN KAPISI (I18N-F1, Owner kararı A1 · 2026-11-24).
 *
 * İngilizce sistem genelinde tamamlanıp nihai kabul alana kadar production'da yabancı dil
 * seçimi KULLANICILARDAN GİZLİDİR ve render her zaman kaynak dilde (tr) yapılır. Önceden
 * İngilizce seçmiş bir kullanıcının tarayıcısında kalan NEXT_LOCALE=en çerezi de yok sayılır
 * → karışık dilli arayüz oluşmaz.
 *
 * Bayrak: NEXT_PUBLIC_I18N_LOCALE_SWITCHING
 *   - "on"  → dil seçimi açık (izole geliştirme / test / Preview ortamı için bilinçli açılır)
 *   - "off" → kapalı (geliştirmede bile)
 *   - eksik/başka değer → production'da KAPALI (güvenli varsayılan), `next dev`'de açık
 *
 * NEXT_PUBLIC_ öneki bilinçlidir: hem sunucu (i18n/request.ts, setLocale) hem istemci
 * (LanguageSelector görünürlüğü) AYNI değeri görür. Değer bir sır değildir. Next.js
 * NEXT_PUBLIC_* değerlerini derleme anında koda gömdüğü için değişiklik yeni deployment ister.
 * İstemcide gömülebilmesi için değişken `process.env.NEXT_PUBLIC_…` biçiminde DOĞRUDAN okunur.
 */
import { DEFAULT_LOCALE, resolveLocale, type ActiveLocale } from "./locales";

export const LOCALE_SWITCHING_ENV = "NEXT_PUBLIC_I18N_LOCALE_SWITCHING";

/** Saf karar fonksiyonu (test edilebilir): ham bayrak + NODE_ENV → açık mı? */
export function decideLocaleSwitching(raw: string | undefined | null, nodeEnv: string | undefined | null): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "on") return true;
  if (v === "off") return false;
  return nodeEnv === "development";
}

/** Bu derlemede / süreçte yabancı dil seçimi açık mı? */
export function isLocaleSwitchingEnabled(): boolean {
  return decideLocaleSwitching(process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING, process.env.NODE_ENV);
}

/**
 * Bir aday locale'in (çerez, sorgu parametresi, hesap tercihi) GERÇEKTE uygulanacak hali.
 * Kapı kapalıysa daima kaynak dil; açıksa yalnız aktif bir locale kabul edilir.
 */
export function effectiveLocale(candidate: string | null | undefined, switchingEnabled = isLocaleSwitchingEnabled()): ActiveLocale {
  if (!switchingEnabled) return DEFAULT_LOCALE;
  return resolveLocale(candidate);
}
