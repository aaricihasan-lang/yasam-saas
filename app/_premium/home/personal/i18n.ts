"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — ana sayfa kişiselleştirme görünümünün küçük metin sözlüğü (TR birincil, EN).
 * Ortak messages/*.json dosyalarına dokunmamak için yalnız bu katmanın yeni metinleri burada tutulur.
 */
import { useLocale } from "next-intl";

const TR = {
  viewMode: "Görünüm modu",
  view_auto: "Otomatik",
  view_day: "Gündüz",
  view_night: "Gece",
  view_reading: "Okuma",
  view_focus: "Odak",
  viewDesc_auto: "Cihazın açık/koyu tercihine uyar",
  viewDesc_day: "Ferah, aydınlık",
  viewDesc_night: "Premium koyu, dengeli kontrast",
  viewDesc_reading: "Büyük yazı, rahat satır aralığı, dar sütun",
  viewDesc_focus: "Sade; Favorilerim ve çalıştığınız içerik öne çıkar",
  autoNow: "şu an",
  editWorkspace: "Çalışma Alanımı Düzenle",
  editDisabledDemo: "Demo hesapta düzenleme kapalı",
  favorites: "Favorilerim",
  logoLabel: "Firma logosu",
  logoEditLabel: "Firma logosu — sürükleyerek taşıyın, köşelerden boyutlandırın, ok tuşlarıyla kaydırın, + / − ile boyutlandırın, Esc ile bitirin",
  logoKept: "Logo bu ekran genişliğinde istenen konuma sığmıyor; son geçerli konumunda gösteriliyor.",
  logoNoFit: "Logo bu bölgeye sığmıyor (izinli en küçük boyut: uzun kenar 36 px). Başka bir bölge seçin veya boyutu küçültün.",
  logoRejected: "Bu değişiklikle logo sığmıyor; son geçerli konum korundu.",
  zone_hero: "Karşılama bandı",
  zone_cerceve: "Fotoğraf çerçevesi",
  zone_toolbar: "Üst şerit",
  zone_sec: "Modüller başlığı yanı",
  zone_rightTop: "Sağ sütun üstü",
  zone_footer: "Sayfa altı imza şeridi",
} as const;

export type PwTextKey = keyof typeof TR;

const EN: Record<PwTextKey, string> = {
  viewMode: "View mode",
  view_auto: "Automatic",
  view_day: "Day",
  view_night: "Night",
  view_reading: "Reading",
  view_focus: "Focus",
  viewDesc_auto: "Follows your device light/dark setting",
  viewDesc_day: "Bright and airy",
  viewDesc_night: "Premium dark, balanced contrast",
  viewDesc_reading: "Larger text, relaxed line spacing, narrow column",
  viewDesc_focus: "Minimal; Favourites and your work come first",
  autoNow: "now",
  editWorkspace: "Edit My Workspace",
  editDisabledDemo: "Editing is disabled on the demo account",
  favorites: "My Favourites",
  logoLabel: "Company logo",
  logoEditLabel: "Company logo — drag to move, resize from the corners, arrow keys to nudge, + / − to resize, Esc to finish",
  logoKept: "The logo does not fit the requested position at this screen width; it is shown at its last valid position.",
  logoNoFit: "The logo does not fit this area (minimum size: 36 px long side). Choose another area or make it smaller.",
  logoRejected: "The logo would not fit with this change; the last valid position was kept.",
  zone_hero: "Welcome band",
  zone_cerceve: "Photo frame",
  zone_toolbar: "Top bar",
  zone_sec: "Next to module heading",
  zone_rightTop: "Top of right column",
  zone_footer: "Page footer signature strip",
};

export function pwText(locale: string, key: PwTextKey): string {
  return locale.toLowerCase().startsWith("en") ? EN[key] : TR[key];
}

/** Bileşenler için: aktif dile göre metin işlevi. */
export function usePwText(): (key: PwTextKey) => string {
  const locale = useLocale();
  return (key) => pwText(locale, key);
}
