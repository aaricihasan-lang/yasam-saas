"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — ana sayfa kişiselleştirme görünümünün küçük metin sözlüğü (TR birincil, EN).
 * Ortak messages/*.json dosyalarına dokunmamak için yalnız bu katmanın yeni metinleri burada tutulur.
 * KDO-05: hazır bölge adları kaldırıldı (Serbest Yerleştir). KDO-06: Okuma modu metinleri kaldırıldı.
 */
import { useLocale } from "next-intl";

const TR = {
  viewMode: "Görünüm modu",
  view_auto: "Otomatik",
  view_day: "Gündüz",
  view_night: "Gece",
  view_focus: "Odak",
  viewDesc_auto: "Cihazın açık/koyu tercihine uyar",
  viewDesc_day: "Ferah, aydınlık",
  viewDesc_night: "Premium koyu, dengeli kontrast",
  viewDesc_focus: "Sade; Favorilerim ve çalıştığınız içerik öne çıkar",
  autoNow: "şu an",
  editWorkspace: "Çalışma Alanımı Düzenle",
  editDisabledDemo: "Demo hesapta düzenleme kapalı",
  favorites: "Favorilerim",
  logoLabel: "Firma logosu",
  logoEditLabel: "Firma logosu — tutup sürükleyerek serbestçe taşıyın, ok tuşlarıyla kaydırın, + / − ile boyutlandırın, Esc ile bitirin",
  logoFreeEditLabel: "Firma logosu — tutup sayfada veya sol menünün altındaki boş alanda istediğiniz yere sürükleyin; köşelerden boyutlandırın; ok tuşları kaydırır (Shift ile büyük adım), + / − boyutlandırır, Esc bitirir",
  logoKept: "Logo bu ekran genişliğinde istenen konuma sığmıyor; son geçerli konumunda gösteriliyor.",
  logoNoFit: "Logo bu ekran genişliğinde kayıtlı konumuna sığmıyor ve yakınında boş alan yok. Logoyu boş bir alana sürükleyin veya küçültün.",
  logoRejected: "Bu değişiklikle logo sığmıyor; son geçerli konum korundu.",
  logoDropInvalid: "Logo buraya bırakılamaz: Yaşam Sistemi alanını, karşılama metnini, düğmeleri veya kartları örter ya da sayfa dışına taşar. Logo son geçerli konumunda kaldı.",
  logoDropOk: "Buraya bırakabilirsiniz",
  logoDropNo: "Buraya bırakılamaz",
  logoFrameMissing: "Bu alan şu an ekranda görünmüyor (ör. sol menü daraltılmış veya mobil çekmece kapalı).",
} as const;

export type PwTextKey = keyof typeof TR;

const EN: Record<PwTextKey, string> = {
  viewMode: "View mode",
  view_auto: "Automatic",
  view_day: "Day",
  view_night: "Night",
  view_focus: "Focus",
  viewDesc_auto: "Follows your device light/dark setting",
  viewDesc_day: "Bright and airy",
  viewDesc_night: "Premium dark, balanced contrast",
  viewDesc_focus: "Minimal; Favourites and your work come first",
  autoNow: "now",
  editWorkspace: "Edit My Workspace",
  editDisabledDemo: "Editing is disabled on the demo account",
  favorites: "My Favourites",
  logoLabel: "Company logo",
  logoEditLabel: "Company logo — drag to move freely, arrow keys to nudge, + / − to resize, Esc to finish",
  logoFreeEditLabel: "Company logo — drag it anywhere on the page or into the empty area below the left menu; resize from the corners; arrow keys nudge (Shift for larger steps), + / − resize, Esc finishes",
  logoKept: "The logo does not fit the requested position at this screen width; it is shown at its last valid position.",
  logoNoFit: "At this screen width the logo does not fit its saved position and there is no free space nearby. Drag it to an empty area or make it smaller.",
  logoRejected: "The logo would not fit with this change; the last valid position was kept.",
  logoDropInvalid: "The logo cannot be dropped here: it would cover the Yaşam Sistemi area, the welcome text, buttons or cards, or leave the page. It stayed at its last valid position.",
  logoDropOk: "You can drop it here",
  logoDropNo: "Cannot drop here",
  logoFrameMissing: "This area is not visible right now (e.g. the left menu is collapsed or the mobile drawer is closed).",
};

export function pwText(locale: string, key: PwTextKey): string {
  return locale.toLowerCase().startsWith("en") ? EN[key] : TR[key];
}

/** Bileşenler için: aktif dile göre metin işlevi. */
export function usePwText(): (key: PwTextKey) => string {
  const locale = useLocale();
  return (key) => pwText(locale, key);
}
