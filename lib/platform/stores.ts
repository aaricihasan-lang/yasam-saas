/**
 * Uygulama mağazası bağlantıları — tek kaynak.
 *
 * Landing (mobil bölüm + mobil hero çipleri) ve ileride başka yüzeyler bu
 * sabitleri kullanır; URL kodda tekrar yazılmaz.
 *
 * iOS: henüz yayında DEĞİL ("Yakında") → bilinçli olarak URL tanımlanmaz.
 */

/** Android (Google Play) uygulama sayfası. */
export const GOOGLE_PLAY_APP_URL =
  "https://play.google.com/store/apps/details?id=com.yasamsistemi.app" as const;
