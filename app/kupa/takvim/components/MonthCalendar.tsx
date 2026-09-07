"use client";

import { useMemo } from "react";
import { monthHijriCells, HIJRI_MONTHS_TR } from "@/lib/cupping/hijri";
import { WEEKDAYS_TR, isoWeekday } from "../lib/bulk";

/**
 * FAZ 5 / AŞAMA 3 — Aylık takvim (Gregoryen + Hicrî HER GÜN).
 *
 * NÖTR: Hiçbir gün sistemce "doğru/uygun/önerilen" işaretlenmez. Seçili durum YALNIZCA
 *   "kullanıcı seçti" demektir (yeşil=iyi / kırmızı=yasak / altın=sünnet SEMANTİĞİ YOK).
 * Hicrî değer lib/cupping/hijri.ts'ten TÜRETİLİR (saklanmaz). Hücre başına API çağrısı YOK.
 * Hafta Pazartesi başlar (uygulama geneli Türkçe takvim düzeni).
 */

/** Kısa Hicrî ay adı (dar hücre için); tam ad a11y etiketinde kalır. */
function shortHijriMonth(monthNo: number): string {
  const name = HIJRI_MONTHS_TR[monthNo - 1] ?? "";
  return name.length > 4 ? `${name.slice(0, 3)}.` : name;
}

export function MonthCalendar({
  year,
  month,
  selected,
  savedSet,
  today,
  onToggle,
}: {
  year: number;
  month: number; // 1–12
  selected: Set<string>;
  savedSet: Set<string>;
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
          const isSaved = savedSet.has(ymd);
          const isToday = today === ymd;
          const gDay = Number(ymd.slice(8, 10));
          const hLabel = `${cell.hijri.day} ${cell.hijri.monthName} ${cell.hijri.year}`;
          const aria = `${gDay} ${MONTHS_TR[month - 1]} ${year} — Hicrî ${hLabel}${isSel ? " — seçili" : ""}`;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onToggle(ymd)}
              aria-pressed={isSel}
              aria-label={aria}
              title={aria}
              className={[
                "group relative flex min-h-[46px] flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-center outline-none transition sm:min-h-[58px]",
                "focus-visible:ring-2 focus-visible:ring-amber-400/70",
                isSel
                  ? "border-amber-400 bg-gradient-to-b from-amber-100 to-amber-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/50",
                isToday && !isSel ? "ring-1 ring-inset ring-slate-300" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "text-sm font-bold leading-none sm:text-base",
                  isSel ? "text-amber-900" : "text-slate-800",
                ].join(" ")}
              >
                {gDay}
              </span>
              <span
                className={[
                  "mt-0.5 truncate text-[9px] leading-none sm:text-[11px]",
                  isSel ? "text-amber-700" : "text-slate-400",
                ].join(" ")}
              >
                {cell.hijri.day} {shortHijriMonth(cell.hijri.month)}
              </span>
              {/* Kaydedilmiş gün göstergesi (nötr nokta; durum semantiği YOK). */}
              {isSaved ? (
                <span
                  className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${isSel ? "bg-amber-500" : "bg-slate-300"}`}
                  aria-hidden
                />
              ) : null}
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
