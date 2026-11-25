"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isActiveLocale } from "./locales";
import { isLocaleSwitchingEnabled } from "./gate";
import { localeCookieOptions } from "./localeCookie";

/**
 * Dil tercihini NEXT_LOCALE cookie'sine yazar (cihaz/tarayıcı önbelleği).
 *
 * - Yalnız AKTİF (selectable) bir locale kabul edilir.
 * - Yayın kapısı kapalıysa (production varsayılanı) hiçbir şey yazılmaz → { ok: false }.
 * - Hesap tercihi (kalıcı, cihazlar arası) ayrıca /api/me/locale ile saklanır; bu action
 *   yalnız render'ı belirleyen çerezi günceller (bkz. lib/i18n/localePreference.ts öncelik sırası).
 */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isLocaleSwitchingEnabled() || !isActiveLocale(locale)) {
    return { ok: false };
  }
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, localeCookieOptions());
  return { ok: true };
}

/**
 * Dil çerezini siler. Ortak bilgisayarda bir uzmanın çıkışından sonra sonraki uzmana
 * önceki dilin taşınmaması için oturum kapatma akışında çağrılır (entegrasyon planı:
 * güvenlik çalışması main'e alındıktan sonra çıkış uçlarına bağlanacak).
 */
export async function clearLocale(): Promise<{ ok: boolean }> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, "", { ...localeCookieOptions(), maxAge: 0 });
  return { ok: true };
}
