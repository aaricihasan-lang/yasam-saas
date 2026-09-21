import { CUPPING_DAY_COLOR_KEYS, type CuppingDayColorKey } from "@/lib/cupping/calendarTypes";

/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 — TAKVİM GÜN DURUMU (tek doğruluk kaynağı).
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Takvim UZMAN-SAHİPLİDİR. Sistem HAZIR gün üretmez; otomatik
 *   Sünnet/Altın/17-19-21 kavramı YOKTUR. Her seçili gün uzmanın KENDİ günüdür. Bu yüzden
 *   köken (provenance) tabanlı renk ayrımı KALDIRILMIŞTIR — yalnızca dört sade durum vardır.
 *
 * Aylık düzenleyici (MonthCalendar) ve Yıllık Özet (AnnualCalendarOverview) günlerin
 *   durumunu AYNI yerden türetir — renk/rozet ASLA bağımsız yeniden hesaplanmaz. Girdi:
 *   seçili taslak (draft) + kaydedilmiş gün kümesi (saved). Böylece iki görünüm HER ZAMAN
 *   aynı planı aynı şekilde gösterir (kaydedilmemiş taslak dâhil).
 */

/**
 * Bir günün durumu (yalnız dört sade durum):
 *   - "none"                  seçili değil, kaydedilmemiş (nötr gün)
 *   - "selected_saved"        seçili + kayıtlı (kalıcı uzman günü)
 *   - "selected_pending_add"  seçili + kaydedilmemiş (yeni; "Kaydedilecek")
 *   - "pending_remove"        seçimden çıkarılmış + kayıtlı ("Kaldırılacak")
 */
export type CuppingCellKind =
  | "none"
  | "selected_saved"
  | "selected_pending_add"
  | "pending_remove";

export type CuppingCellState = {
  kind: CuppingCellKind;
  /** Şu an taslakta seçili mi? */
  selected: boolean;
  /** Kayıtlı bir satır tarafından destekleniyor mu? */
  saved: boolean;
  /** Kaydedilmemiş bir değişiklik mi (eklenecek/kaldırılacak)? */
  pending: boolean;
};

/**
 * Bir gün için durumu tek yerden türetir.
 * @param selected  gün şu an taslakta seçili mi
 * @param saved     gün sunucuda kayıtlı mı
 */
export function getCuppingCellState(selected: boolean, saved: boolean): CuppingCellState {
  const base = { selected, saved };
  if (selected && saved) return { ...base, kind: "selected_saved", pending: false };
  if (selected && !saved) return { ...base, kind: "selected_pending_add", pending: true };
  if (!selected && saved) return { ...base, kind: "pending_remove", pending: true };
  return { ...base, kind: "none", pending: false };
}

/**
 * PASTEL PALET (owner gereksinimi — sakin/okunur; neon YOK).
 *   Seçili (kayıtlı)  → pastel indigo/lavanta (tek uzman-seçim anlamı)
 *   Kaydedilecek      → aynı indigo ailesi, KESİKLİ kenarlık (bekleyen ekleme)
 *   Kaldırılacak      → soluk indigo (bekleyen kaldırma)
 *   Normal            → sıcak beyaz/krem nötr
 * Aylık ve Yıllık görünüm bu AİLELERİ paylaşır (tek tasarım dili). Sünnet/Altın/tıbbi
 *   renk anlamı YOKTUR.
 */
export const CUPPING_CELL_PALETTE: Record<
  CuppingCellKind,
  { cell: string; greg: string; hijri: string }
> = {
  none: {
    cell: "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40",
    greg: "text-slate-800",
    hijri: "text-slate-500",
  },
  selected_saved: {
    cell: "border-indigo-300 bg-indigo-50 shadow-sm",
    greg: "text-indigo-900",
    hijri: "text-indigo-600",
  },
  selected_pending_add: {
    cell: "border-dashed border-indigo-400 bg-indigo-50/70",
    greg: "text-indigo-900",
    hijri: "text-indigo-600",
  },
  pending_remove: {
    cell: "border-indigo-200 bg-indigo-50/40 opacity-70",
    greg: "text-indigo-400 line-through decoration-indigo-300",
    hijri: "text-indigo-300",
  },
};

/** Kısa Türkçe rozet metni (renk tek sinyal DEĞİL — a11y). Tüm günler uzman-sahipli. */
export function cuppingCellBadge(kind: CuppingCellKind): string | null {
  switch (kind) {
    case "selected_saved":
      return "Seçili";
    case "selected_pending_add":
      return "Kaydedilecek";
    case "pending_remove":
      return "Kaldırılacak";
    default:
      return null;
  }
}

/**
 * FAZ 5 / AŞAMA 5 — UZMAN-TANIMLI RENK PALETİ (görsel eşleme; tek doğruluk kaynağı).
 *
 * ANLAM SABİT DEĞİL: Bu eşleme yalnız GÖRSEL sınıfları (pastel arka plan + okunur metin) ve
 *   Türkçe renk ADINI verir. Hiçbir renk hazır tıbbi/geleneksel anlam TAŞIMAZ — anlamı uzman
 *   kendi kısa açıklamasıyla belirler. Anahtarlar CUPPING_DAY_COLOR_KEYS ile BİREBİR; ileride
 *   Word çıktısı da bu SABİT anahtar→renk eşlemesini kullanır (aktarılabilir sözleşme).
 * KONTRAST: Tüm pastel dolgular koyu metinle (text-*-900/800) okunur kalır; seçili durum renk
 *   TEK sinyal değildir (durum rozeti + aria-pressed ayrıca taşınır).
 */
export type CuppingDayColorVisual = {
  /** Palet ızgarası/erişilebilir etiket (a11y; renk anlamı DEĞİL, yalnız ad). */
  labelTr: string;
  /** Düzenleme panelindeki dolu renk kutucuğu. */
  swatch: string;
  /** Aylık hücre arka planı + kenarlık (seçili-renkli gün). */
  cell: string;
  /** Aylık hücrede Gregoryen gün numarası metni. */
  greg: string;
  /** Aylık hücrede Hicrî tarih metni. */
  hijri: string;
  /** Yıllık Özet minik hücre dolgusu (kompakt). */
  mini: string;
};

export const CUPPING_DAY_COLORS: Record<CuppingDayColorKey, CuppingDayColorVisual> = {
  blue: {
    labelTr: "Mavi",
    swatch: "bg-sky-200 border-sky-300",
    cell: "border-sky-300 bg-sky-50 shadow-sm",
    greg: "text-sky-900",
    hijri: "text-sky-600",
    mini: "bg-sky-100 text-sky-800 font-bold ring-1 ring-sky-300",
  },
  green: {
    labelTr: "Yeşil",
    swatch: "bg-emerald-200 border-emerald-300",
    cell: "border-emerald-300 bg-emerald-50 shadow-sm",
    greg: "text-emerald-900",
    hijri: "text-emerald-600",
    mini: "bg-emerald-100 text-emerald-800 font-bold ring-1 ring-emerald-300",
  },
  yellow: {
    labelTr: "Sarı",
    swatch: "bg-yellow-200 border-yellow-300",
    cell: "border-yellow-300 bg-yellow-50 shadow-sm",
    greg: "text-yellow-800",
    hijri: "text-yellow-700",
    mini: "bg-yellow-100 text-yellow-800 font-bold ring-1 ring-yellow-300",
  },
  red: {
    labelTr: "Kırmızı",
    swatch: "bg-rose-200 border-rose-300",
    cell: "border-rose-300 bg-rose-50 shadow-sm",
    greg: "text-rose-900",
    hijri: "text-rose-600",
    mini: "bg-rose-100 text-rose-800 font-bold ring-1 ring-rose-300",
  },
  purple: {
    labelTr: "Mor",
    swatch: "bg-violet-200 border-violet-300",
    cell: "border-violet-300 bg-violet-50 shadow-sm",
    greg: "text-violet-900",
    hijri: "text-violet-600",
    mini: "bg-violet-100 text-violet-800 font-bold ring-1 ring-violet-300",
  },
  orange: {
    labelTr: "Turuncu",
    swatch: "bg-orange-200 border-orange-300",
    cell: "border-orange-300 bg-orange-50 shadow-sm",
    greg: "text-orange-900",
    hijri: "text-orange-600",
    mini: "bg-orange-100 text-orange-800 font-bold ring-1 ring-orange-300",
  },
  pink: {
    labelTr: "Pembe",
    swatch: "bg-pink-200 border-pink-300",
    cell: "border-pink-300 bg-pink-50 shadow-sm",
    greg: "text-pink-900",
    hijri: "text-pink-600",
    mini: "bg-pink-100 text-pink-800 font-bold ring-1 ring-pink-300",
  },
};

/** Palet ızgarası sırası (düzenleme paneli + testler paylaşır). "Renk Yok" bunun DIŞINDA. */
export const CUPPING_DAY_COLOR_ORDER: CuppingDayColorKey[] = [...CUPPING_DAY_COLOR_KEYS];
