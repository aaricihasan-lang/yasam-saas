"use client";

import { useMemo } from "react";
import { monthHijriCells } from "@/lib/cupping/hijri";
import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import {
  getCuppingCellState,
  CUPPING_CELL_PALETTE,
  CUPPING_DAY_COLORS,
  cuppingCellBadge,
} from "../lib/cellState";
import { WEEKDAYS_TR, isoWeekday } from "../lib/bulk";

/**
 * FAZ 5 / AŞAMA 3 + 5 — Aylık takvim (Gregoryen + Hicrî HER GÜN, TAM ay adı; PASTEL durumlar
 *   + UZMAN-TANIMLI renk/kısa açıklama).
 *
 * TAM HİCRÎ AD: Hiçbir kısaltma YOK. Her hücre Gregoryen gün numarası + TAM Hicrî tarih (gün +
 *   tam ay adı + yıl); dar ekranda kelime kaydırma ile okunur (yatay taşma YOK). Hicrî değer
 *   lib/cupping/hijri.ts üzerinden TÜRETİLİR (saklanmaz). Hücre başına API çağrısı YOK.
 *
 * DURUM (renk + rozet): getCuppingCellState TEK doğruluk kaynağıdır (Yıllık Özet ile AYNI).
 *   Takvim UZMAN-SAHİPLİDİR — hazır gün KAVRAMI YOKTUR. Yeni günde RENK ZORUNLUDUR; kısa açıklama
 *   opsiyoneldir; renk anlamı platform tarafından sabitlenmez. Kaydedilmiş günlerde hücre ortasında
 *   "SEÇİLİ" YAZISI GÖSTERİLMEZ — seçim renk + kenarlık + aria-pressed + ekran-okuyucu ile ifade
 *   edilir (renk TEK sinyal değildir).
 * TIKLAMA: gün kutusuna tek tık PANELİ AÇAR (boş gün → renk seçerek EKLE; seçili gün → DÜZENLE).
 *   Sıradan tık seçimi ASLA yanlışlıkla KALDIRMAZ; seçimi kaldırma yalnız panelin ayrı
 *   "Gün Seçimini Kaldır" aksiyonuyladır. Kalem simgesi seçili günde ayrıca korunur.
 */

/** Bir günün mevcut stili (renk + kısa açıklama) — taslaktan türetilir. */
export type CuppingDayStyleView = { colorKey: CuppingDayColorKey | null; label: string | null };

export function MonthCalendar({
  year,
  month,
  selected,
  saved,
  today,
  styleOf,
  onEditDay,
}: {
  year: number;
  month: number; // 1–12
  selected: Set<string>;
  /** ymd kümesi — sunucuda KAYITLI günler. Bekleyen ekleme/kaldırma kararında kullanılır. */
  saved: Set<string>;
  today: string | null; // "YYYY-MM-DD"
  /** Bir günün taslak stili (renk + kısa açıklama). Yoksa renk/açıklama yok. */
  styleOf: (ymd: string) => CuppingDayStyleView | undefined;
  /** Gün panelini aç: boş gün → renkle EKLE; seçili gün → DÜZENLE. Seçimi DEĞİŞTİRMEZ. */
  onEditDay: (ymd: string) => void;
}) {
  const cells = useMemo(() => monthHijriCells(year, month), [year, month]);
  // Ayın ilk günü hangi ISO haftagününe düşüyor → baştaki boş hücre sayısı (Pzt-başlangıç).
  const leading = cells.length > 0 ? isoWeekday(cells[0].gregorian) - 1 : 0;

  return (
    <div>
      {/* Haftagünü başlıkları (Pzt→Paz) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="row">
        {WEEKDAYS_TR.map((w) => (
          <div
            key={w.iso}
            className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:text-xs"
            aria-hidden
          >
            {w.short}
          </div>
        ))}
      </div>

      {/* Gün ızgarası */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {cells.map((cell) => {
          const ymd = cell.gregorian;
          const isSel = selected.has(ymd);
          const state = getCuppingCellState(isSel, saved.has(ymd));
          const isToday = today === ymd;
          const gDay = Number(ymd.slice(8, 10));

          // Renk yalnız SEÇİLİ günlerde (saved veya kaydedilecek) uygulanır; kaldırılacak gün
          // ayrılıyor → nötr soluk kalır. Renk yoksa mevcut seçili görünüm korunur.
          const dayStyle = styleOf(ymd);
          const colorKey = dayStyle?.colorKey ?? null;
          const showColor =
            colorKey !== null && (state.kind === "selected_saved" || state.kind === "selected_pending_add");
          const colorDef = showColor ? CUPPING_DAY_COLORS[colorKey] : null;
          const palette = CUPPING_CELL_PALETTE[state.kind];

          const cellCls = colorDef ? colorDef.cell : palette.cell;
          const gregCls = colorDef ? colorDef.greg : palette.greg;
          const hijriCls = colorDef ? colorDef.hijri : palette.hijri;
          // Kaydedilecek (bekleyen ekleme) her zaman KESİKLİ kenarlık (renkli olsa da).
          const dashed = state.kind === "selected_pending_add" ? "border-dashed" : "";

          const label = isSel ? dayStyle?.label ?? null : null;
          const badge = cuppingCellBadge(state.kind);

          const fullHijri = `${cell.hijri.day} ${cell.hijri.monthName} ${cell.hijri.year}`;
          const statusWord =
            state.kind === "selected_saved"
              ? " — seçili gün"
              : state.kind === "selected_pending_add"
                ? " — seçili gün (kaydedilecek)"
                : state.kind === "pending_remove"
                  ? " — kaldırılacak"
                  : "";
          const colorWord = colorDef ? ` — ${colorDef.labelTr} renk` : "";
          const labelWord = label ? ` — ${label}` : "";
          const aria = `${gDay} ${MONTHS_TR[month - 1]} ${year} — Hicrî ${fullHijri}${statusWord}${colorWord}${labelWord}`;

          return (
            <div key={ymd} className="relative">
              <button
                type="button"
                onClick={() => onEditDay(ymd)}
                aria-pressed={isSel}
                aria-label={aria}
                title={aria}
                className={[
                  "group flex min-h-[62px] w-full flex-col items-center justify-start gap-0.5 rounded-lg border px-0.5 py-1 text-center outline-none transition sm:min-h-[76px]",
                  "focus-visible:ring-2 focus-visible:ring-amber-400/70",
                  cellCls,
                  dashed,
                  isToday && !isSel ? "ring-1 ring-inset ring-slate-300" : "",
                ].join(" ")}
              >
                <span className={["text-sm font-bold leading-none sm:text-base", gregCls].join(" ")}>
                  {gDay}
                </span>
                {/* TAM Hicrî tarih (kısaltma YOK). Dar hücrede kontrollü kelime kaydırma. */}
                <span className={["text-[9px] leading-tight [overflow-wrap:anywhere] sm:text-[10px]", hijriCls].join(" ")}>
                  {cell.hijri.day} {cell.hijri.monthName} {cell.hijri.year}
                </span>
                {/* Durum rozeti — KAYDEDİLMİŞ günde "SEÇİLİ" YAZISI YOK (renk+kenarlık+sr-only yeter).
                    Yalnız bekleyen ekleme/kaldırma görünür etiket taşır. Renk TEK sinyal değil. */}
                {state.kind === "selected_pending_add" ? (
                  <span className="rounded border border-dashed border-indigo-400 px-1 text-[8px] font-bold uppercase leading-tight text-indigo-600" aria-hidden>
                    Kaydedilecek
                  </span>
                ) : state.kind === "pending_remove" ? (
                  <span className="text-[8px] font-medium leading-none text-slate-400" aria-hidden>
                    Kaldırılacak
                  </span>
                ) : null}
                {/* Uzmanın kısa açıklaması (güvenli düz metin; HTML render YOK; kontrollü kırpma). */}
                {label ? (
                  <span className="line-clamp-2 w-full px-0.5 text-[9px] font-medium leading-tight text-slate-600 [overflow-wrap:anywhere] sm:text-[10px]" aria-hidden>
                    {label}
                  </span>
                ) : null}
                {badge ? <span className="sr-only">{badge}</span> : null}
              </button>

              {/* "Düzenle" — YALNIZ seçili günlerde; seçim durumunu DEĞİŞTİRMEZ (panel açar). */}
              {isSel ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditDay(ymd);
                  }}
                  aria-label={`${gDay} ${MONTHS_TR[month - 1]} — günü düzenle (renk ve açıklama)`}
                  title="Günü düzenle"
                  className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-[10px] leading-none text-slate-500 shadow-sm outline-none transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  <span aria-hidden>✎</span>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Gregoryen ay adları (a11y etiketi için; nötr). */
export const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;
