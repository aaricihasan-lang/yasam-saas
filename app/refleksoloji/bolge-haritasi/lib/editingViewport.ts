/**
 * Bölge Haritası düzenleme viewport eşiği — SAF (React'sız, test edilebilir).
 *
 * ÜRÜN KURALI: ayak üzerinde HASSAS koordinat düzenleme yalnız yeterince geniş
 * ekranlarda açıktır. Karar viewport GENİŞLİĞİNE + cihaz ekranının KISA KENARINA
 * dayanır (user-agent sniffing DEĞİL):
 *  - ≥ 1024px (Tailwind `lg`, masaüstü 3-panel düzeni): her zaman açık.
 *  - 768–1023px: yalnız cihaz ekranının kısa kenarı ≥ 600px ise (tablet) açık.
 *    Telefonların kısa kenarı ≤ ~480px'tir → yatay tutulan telefon (ör. 932×430)
 *    768px'i aşsa da KAPALI kalır. Kısa kenar `screen` boyutundan okunur; sanal
 *    klavye veya döndürme bunu değiştirmez.
 *  - < 768px: kapalı.
 * Koordinatlar görsel içerik kutusuna göre 0..1 normalize edildiğinden eşik,
 * kaydedilen değerleri etkilemez; yalnız düzenleme yüzeyinin açılıp açılmadığını belirler.
 */

/** Düzenlemenin koşulsuz açık olduğu en küçük viewport genişliği (Tailwind `lg`). */
export const REGION_EDIT_MIN_WIDTH = 1024;

/** Tablet düzenlemesinin açıldığı en küçük viewport genişliği (Tailwind `md`). */
export const REGION_EDIT_TABLET_MIN_WIDTH = 768;

/** Tablet sayılması için cihaz ekranının kısa kenarı (CSS px) en az bu olmalı. */
export const REGION_EDIT_TABLET_MIN_SCREEN_SHORT_SIDE = 600;

/** Verilen genişlikte masaüstü (koşulsuz) bölge düzenleme açık mı? */
export function isEditViewportWidth(width: number): boolean {
  return width >= REGION_EDIT_MIN_WIDTH;
}

/** Viewport genişliği + cihaz ekranının kısa kenarına göre bölge düzenleme açık mı? */
export function isEditViewport(width: number, screenShortSide: number): boolean {
  if (isEditViewportWidth(width)) return true;
  return (
    width >= REGION_EDIT_TABLET_MIN_WIDTH &&
    screenShortSide >= REGION_EDIT_TABLET_MIN_SCREEN_SHORT_SIDE
  );
}
