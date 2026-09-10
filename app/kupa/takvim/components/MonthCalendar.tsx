"use client";

import { useMemo } from "react";
import { monthHijriCells } from "@/lib/cupping/hijri";
import type { CuppingSelectionSource } from "@/lib/cupping/traditionalDays";
import {
  getCuppingCellState,
  CUPPING_CELL_PALETTE,
  cuppingCellBadge,
} from "../lib/cellState";
import { WEEKDAYS_TR, isoWeekday } from "../lib/bulk";

/**
 * FAZ 5 / AŞAMA 3 — Aylık takvim (Gregoryen + Hicrî HER GÜN, TAM ay adı; PASTEL durumlar).
 *
 * TAM HİCRÎ AD: Hiçbir kısaltma YOK (Rec./Şab./Reb.ev. gibi). Her hücre Gregoryen gün
 *   numarası + TAM Hicrî tarih (gün + tam ay adı + yıl) görünür şekilde render eder;
 *   dar ekranda satır kaydırma ile okunur (yatay taşma YOK). Hicrî değer lib/cupping/hijri.ts
 *   üzerinden TÜRETİLİR (saklanmaz). Hücre başına API çağrısı YOK. Hafta Pazartesi başlar.
 *
 * ANLAMSAL DURUM (renk + rozet): getCuppingCellState TEK doğruluk kaynağıdır (Yıllık Özet
 *   ile AYNI). Sünnet=pastel nane, Altın=pastel şampanya ★★★★★, Uzman=pastel indigo,
 *   Kaydedilecek=kesikli indigo, Kaldırılacak=soluk (kökeni korunur). Renk TEK sinyal
 *   DEĞİL — her durum ayrıca Türkçe rozet/etiket taşır (a11y). Manuel gün — kurala uysa
 *   bile — "Uzman"dır (selection_source=manual daima kazanır; otomatik yeşil/altın OLMAZ).
 */

export function MonthCalendar({
  year,
  month,
  selected,
  savedSource,
  today,
  onToggle,
}: {
  year: number;
  month: number; // 1–12
  selected: Set<string>;
  /** ymd → KÖKEN (yalnız KAYITLI günler için). Renk kararında kullanılır. */
  savedSource: Map<string, CuppingSelectionSource>;
  today: string | null; // "YYYY-MM-DD"
  onToggle: (ymd: string) => void;
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
          const state = getCuppingCellState(ymd, isSel, savedSource.get(ymd));
          const isToday = today === ymd;
          const gDay = Number(ymd.slice(8, 10));
          const palette = CUPPING_CELL_PALETTE[state.kind];
          const badge = cuppingCellBadge(state.kind);

          const fullHijri = `${cell.hijri.day} ${cell.hijri.monthName} ${cell.hijri.year}`;
          const statusWord =
            state.kind === "golden"
              ? " — Altın Gün"
              : state.kind === "sunnah"
                ? " — Sünnet Günü"
                : state.kind === "manual-saved"
                  ? " — Uzman seçimi"
                  : state.kind === "manual-unsaved"
                    ? " — Uzman seçimi (kaydedilecek)"
                    : state.kind === "removal-auto" || state.kind === "removal-manual"
                      ? " — kaldırılacak"
                      : "";
          const aria = `${gDay} ${MONTHS_TR[month - 1]} ${year} — Hicrî ${fullHijri}${statusWord}`;

          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onToggle(ymd)}
              aria-pressed={isSel}
              aria-label={aria}
              title={aria}
              className={[
                "group relative flex min-h-[62px] flex-col items-center justify-start gap-0.5 rounded-lg border px-0.5 py-1 text-center outline-none transition sm:min-h-[76px]",
                "focus-visible:ring-2 focus-visible:ring-amber-400/70",
                palette.cell,
                isToday && !isSel ? "ring-1 ring-inset ring-slate-300" : "",
              ].join(" ")}
            >
              <span className={["text-sm font-bold leading-none sm:text-base", palette.greg].join(" ")}>
                {gDay}
              </span>
              {/* TAM Hicrî tarih (kısaltma YOK). Dar hücrede kontrollü kelime kaydırma. */}
              <span
                className={["text-[9px] leading-tight [overflow-wrap:anywhere] sm:text-[10px]", palette.hijri].join(" ")}
              >
                {cell.hijri.day} {cell.hijri.monthName} {cell.hijri.year}
              </span>
              {/* Durum rozeti (renk TEK sinyal değil). Altın Gün: BEŞ altın yıldız. */}
              {state.kind === "golden" ? (
                <span className="flex flex-col items-center leading-none">
                  <span className="text-[9px] font-bold tracking-tight text-amber-500 sm:text-[11px]" aria-hidden>
                    ★★★★★
                  </span>
                  <span className="rounded bg-amber-100 px-1 text-[8px] font-bold uppercase leading-tight text-amber-700" aria-hidden>
                    Altın
                  </span>
                </span>
              ) : state.kind === "sunnah" ? (
                <span className="rounded bg-emerald-100 px-1 text-[8px] font-bold uppercase leading-tight text-emerald-700" aria-hidden>
                  Sünnet
                </span>
              ) : state.kind === "manual-saved" ? (
                <span className="rounded bg-indigo-100 px-1 text-[8px] font-bold uppercase leading-tight text-indigo-700" aria-hidden>
                  Uzman
                </span>
              ) : state.kind === "manual-unsaved" ? (
                <span className="rounded border border-dashed border-indigo-400 px-1 text-[8px] font-bold uppercase leading-tight text-indigo-600" aria-hidden>
                  Kaydedilecek
                </span>
              ) : state.kind === "removal-auto" || state.kind === "removal-manual" ? (
                <span className="text-[8px] font-medium leading-none text-slate-400" aria-hidden>
                  Kaldırılacak
                </span>
              ) : null}
              {badge ? <span className="sr-only">{badge}</span> : null}
            </button>
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
