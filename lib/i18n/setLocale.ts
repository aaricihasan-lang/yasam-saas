"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isActiveLocale } from "./locales";

/**
 * Dil tercihini NEXT_LOCALE cookie'sine yazar.
 *
 * FAZ 2A: Yalnız AKTİF (selectable) bir locale kabul edilir; şimdilik yalnız TR.
 * i18n/request.ts bu turda cookie OKUMADIĞI için tercih henüz render'ı
 * değiştirmez — altyapı ikinci dil (EN) açılışına hazırdır (ayrı onay turu).
 */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isActiveLocale(locale)) {
    return { ok: false };
  }
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}
