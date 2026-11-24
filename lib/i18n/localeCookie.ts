/**
 * NEXT_LOCALE çerez seçenekleri (I18N-F1). Değer yalnız arayüz tercihidir (sır değil), yine de:
 *   - HttpOnly: istemci kodu çerezi okumuyor (dil seçici useLocale kullanır) → betiğe kapalı.
 *   - Secure: production'da yalnız HTTPS.
 *   - SameSite=Lax, Path=/, 1 yıl.
 * Oturum çerezinden (__Host-yasam_sid) BAĞIMSIZDIR; oturum açma / kapama akışına dokunmaz.
 */
export function localeCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
}

/** Yanıta dil çerezini silen Set-Cookie ekler (çıkış uçları; aynı path → tarayıcı çerezi kaldırır). */
export function clearLocaleCookie(res: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => unknown } }): void {
  res.cookies.set("NEXT_LOCALE", "", { ...localeCookieOptions(), maxAge: 0 });
}
