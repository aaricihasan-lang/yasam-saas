/**
 * Android platform tespiti — SSR-güvenli, yan-etkisiz saf yardımcılar.
 *
 * ÜRÜN KARARI: Android cihazlarda Yaşam Sistemi'nin HİÇBİR modülünde Word (.docx)
 * indirme özelliği sunulmaz. Word indirme UI'si Android'de HİÇ render edilmez;
 * masaüstü (Windows/macOS/Linux) ve iOS davranışı DEĞİŞMEZ.
 *
 * "Android" = herhangi bir Android cihaz: Android WebView + Android Chrome/tarayıcı,
 * telefon VE tablet (Android tabletler "Mobile" token'ı taşımaz; bu yüzden yalnız
 * "android" token'ına bakılır — cihaz türü ayrımı yapılmaz).
 */

/** Saf UA testi (server + client'ta aynı sonuç). UA yoksa false. */
export function isAndroidUserAgent(userAgent: string | null | undefined): boolean {
  return /android/i.test(String(userAgent ?? ""));
}

/**
 * Tarayıcıda çalışırken Android cihaz mı? navigator yoksa (SSR) false döner.
 * Not: Bileşenlerde hydration uyumsuzluğunu önlemek için doğrudan render sırasında
 * DEĞİL, `useIsAndroid` hook'u üzerinden (mount sonrası) kullanılmalıdır.
 */
export function isAndroidClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return isAndroidUserAgent(navigator.userAgent);
}
