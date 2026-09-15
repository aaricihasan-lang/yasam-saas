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
