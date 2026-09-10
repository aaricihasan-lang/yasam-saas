/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 — TAKVİM GÜN DURUMU (tek doğruluk kaynağı).
 *
 * Aylık düzenleyici (MonthCalendar) ve Yıllık Özet (AnnualCalendarOverview) günlerin
 * anlamsal durumunu AYNI yerden türetir — renk/rozet ASLA bağımsız yeniden hesaplanmaz.
 * Girdi: seçili taslak (draft) + kaydedilmiş köken (savedSource) + kanonik geleneksel
 * yardımcı (getCuppingTraditionalDayStatus). Böylece iki görünüm HER ZAMAN aynı planı
 * aynı şekilde gösterir (kaydedilmemiş taslak dâhil).
 *
 * KÖKEN vs GÖSTERİM: "sunnah_auto" bir KAYIT kökenidir (server-sahipli). Geleneksel
 * gösterim sınıfı (sunnah/golden) tarihten TÜRETİLİR. Manuel gün — kurala uysa bile —
 * "Uzman"dır (geleneksel yeşil/altın OLMAZ); selection_source=manual DAİMA kazanır.
 */

import {
  getCuppingTraditionalDayStatus,
  type CuppingSelectionSource,
} from "@/lib/cupping/traditionalDays";

/**
 * Bir günün anlamsal durumu:
 *   - "none"           seçili değil, kaydedilmemiş (nötr beyaz gün)
 *   - "sunnah"         seçili + kayıtlı sunnah_auto + geleneksel Sünnet
 *   - "golden"         seçili + kayıtlı sunnah_auto + Altın Gün (Hicrî 17 + Salı)
 *   - "manual-saved"   seçili + kayıtlı manuel (Uzman Seçimi, kalıcı)
 *   - "manual-unsaved" seçili + kaydedilmemiş (Uzman'ın yeni eklediği; "Kaydedilecek")
 *   - "removal-auto"   seçimden çıkarılmış + kayıtlı sunnah_auto ("Kaldırılacak"; kökeni belli)
 *   - "removal-manual" seçimden çıkarılmış + kayıtlı manuel ("Kaldırılacak"; kökeni belli)
 */
export type CuppingCellKind =
  | "none"
  | "sunnah"
  | "golden"
  | "manual-saved"
  | "manual-unsaved"
  | "removal-auto"
  | "removal-manual";

export type CuppingCellState = {
  kind: CuppingCellKind;
  /** Şu an taslakta seçili mi? */
  selected: boolean;
  /** Kayıtlı bir satır tarafından destekleniyor mu? */
  saved: boolean;
  /** Kaydedilmiş satırın kökeni (varsa). */
  source: CuppingSelectionSource | null;
  /** Kaydedilmemiş bir değişiklik mi (eklenecek/kaldırılacak)? */
  pending: boolean;
};

/**
 * Bir gün için anlamsal durumu tek yerden türetir.
 * @param ymd         "YYYY-MM-DD"
 * @param selected    gün şu an taslakta seçili mi
 * @param source      kaydedilmiş kökeni (yoksa undefined)
 */
export function getCuppingCellState(
  ymd: string,
  selected: boolean,
  source: CuppingSelectionSource | undefined,
): CuppingCellState {
  const saved = source !== undefined;
  const base = { selected, saved, source: source ?? null };

  if (selected) {
    if (source === "sunnah_auto") {
      // Geleneksel gösterim sınıfı tarihten türetilir (kayıtlı auto satır daima geleneksel).
      const trad = getCuppingTraditionalDayStatus(ymd) ?? "sunnah";
      return { ...base, kind: trad === "golden" ? "golden" : "sunnah", pending: false };
    }
    if (source === "manual") return { ...base, kind: "manual-saved", pending: false };
    // Seçili ama kaydedilmemiş → yeni manuel ekleme (kaydedilecek).
    return { ...base, kind: "manual-unsaved", pending: true };
  }

  // Seçili değil.
  if (source === "sunnah_auto") return { ...base, kind: "removal-auto", pending: true };
  if (source === "manual") return { ...base, kind: "removal-manual", pending: true };
  return { ...base, kind: "none", pending: false };
}

/**
 * PASTEL ANLAMSAL PALET (owner gereksinimi — sakin/okunur; neon YOK).
 *   Sünnet          → pastel nane/zümrüt
 *   Altın Gün       → pastel şampanya/altın
 *   Uzman Seçimi    → pastel indigo/lavanta (owner düz gri/slate'i REDDETTİ)
 *   Kaydedilecek    → aynı indigo ailesi, KESİKLİ kenarlık (bekleyen)
 *   Kaldırılacak    → soluk; ama kökeni (yeşil/altın vs indigo) korunur
 * Aylık ve Yıllık görünüm bu AİLELERİ paylaşır (tek tasarım dili).
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
  sunnah: {
    cell: "border-emerald-300 bg-emerald-50",
    greg: "text-emerald-900",
    hijri: "text-emerald-700",
  },
  golden: {
    cell: "border-amber-300 bg-gradient-to-b from-amber-100 to-yellow-50 shadow-sm ring-1 ring-amber-200",
    greg: "text-amber-900",
    hijri: "text-amber-700",
  },
  "manual-saved": {
    cell: "border-indigo-300 bg-indigo-50 shadow-sm",
    greg: "text-indigo-900",
    hijri: "text-indigo-600",
  },
  "manual-unsaved": {
    cell: "border-dashed border-indigo-400 bg-indigo-50/70",
    greg: "text-indigo-900",
    hijri: "text-indigo-600",
  },
  "removal-auto": {
    cell: "border-emerald-200 bg-emerald-50/40 opacity-70",
    greg: "text-emerald-500 line-through decoration-emerald-300",
    hijri: "text-emerald-400",
  },
  "removal-manual": {
    cell: "border-indigo-200 bg-indigo-50/40 opacity-70",
    greg: "text-indigo-400 line-through decoration-indigo-300",
    hijri: "text-indigo-300",
  },
};

/**
 * ANLAMSAL SAYILAR (ŞU ANKİ taslak). Owner görsel gereksinimi: belirsiz "X gün seçili"
 * yerine üç net sayı. DEĞİŞMEZ: auto + practitioner = total (DAİMA).
 *   auto         = taslakta seçili VE kayıtlı satırı 'sunnah_auto' olan günler.
 *   practitioner = seçili olup otomatik OLMAYAN her gün (kayıtlı manuel + kaydedilmemiş
 *                  yeni manuel ekleme). Kurala uyan MANUEL gün burada sayılır (Uzman'dır).
 *   total        = taslaktaki tekil seçili gün sayısı.
 * Pür fonksiyon (React'tan bağımsız) → harness ile doğrudan doğrulanır.
 */
export function computeCalendarCounts(
  draft: Set<string>,
  savedSource: Map<string, CuppingSelectionSource>,
): { auto: number; practitioner: number; total: number } {
  let auto = 0;
  for (const ymd of draft) {
    if (savedSource.get(ymd) === "sunnah_auto") auto++;
  }
  const total = draft.size;
  return { auto, practitioner: total - auto, total };
}

/** Kısa Türkçe rozet metni (renk tek sinyal DEĞİL — a11y). */
export function cuppingCellBadge(kind: CuppingCellKind): string | null {
  switch (kind) {
    case "sunnah":
      return "Sünnet";
    case "golden":
      return "Altın Gün";
    case "manual-saved":
      return "Uzman";
    case "manual-unsaved":
      return "Kaydedilecek";
    case "removal-auto":
    case "removal-manual":
      return "Kaldırılacak";
    default:
      return null;
  }
}
