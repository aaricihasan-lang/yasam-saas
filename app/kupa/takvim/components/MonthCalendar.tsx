"use client";

import { useMemo } from "react";
import { monthHijriCells } from "@/lib/cupping/hijri";
import {
  getCuppingTraditionalDayStatus,
  type CuppingSelectionSource,
} from "@/lib/cupping/traditionalDays";
import { WEEKDAYS_TR, isoWeekday } from "../lib/bulk";

/**
 * FAZ 5 / AŞAMA 3 — Aylık takvim (Gregoryen + Hicrî HER GÜN, TAM ay adı).
 *
 * TAM HİCRÎ AD: Hiçbir kısaltma YOK (Rec./Şab./Reb.ev. gibi). Her hücre Gregoryen gün
 *   numarası + TAM Hicrî tarih (gün + tam ay adı + yıl) görünür şekilde render eder;
 *   dar ekranda satır kaydırma ile okunur (yatay taşma YOK). Hicrî değer lib/cupping/hijri.ts
 *   üzerinden TÜRETİLİR (saklanmaz). Hücre başına API çağrısı YOK. Hafta Pazartesi başlar.
 *
 * GELENEKSEL SINIF (renk): YALNIZCA seçili + KÖKEN 'sunnah_auto' olan gün geleneksel
 *   renk alır (yeşil=Sünnet / altın=Altın Gün ★★★★★). Uzmanın MANUEL seçtiği gün — kurala
 *   uysa bile — nötr "seçili" görünümündedir (otomatik yeşil/altın OLMAZ). Sınıf tarihten
 *   TÜRETİLİR (getCuppingTraditionalDayStatus); DB'de saklanmaz.
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
          const source = savedSource.get(ymd);
          const isSaved = source !== undefined;
          const isToday = today === ymd;
          const gDay = Number(ymd.slice(8, 10));

          // Geleneksel sınıf YALNIZCA seçili + sistem-otomatik günlerde renk verir.
          const isAutoSelected = isSel && source === "sunnah_auto";
          const trad = isAutoSelected ? getCuppingTraditionalDayStatus(ymd) ?? "sunnah" : null;
          const isGolden = trad === "golden";
          const isSunnah = trad === "sunnah";

          const fullHijri = `${cell.hijri.day} ${cell.hijri.monthName} ${cell.hijri.year}`;
          const statusWord = isGolden ? " — Altın Gün" : isSunnah ? " — Sünnet Günü" : isSel ? " — seçili" : "";
          const aria = `${gDay} ${MONTHS_TR[month - 1]} ${year} — Hicrî ${fullHijri}${statusWord}`;

          const stateClass = isGolden
            ? "border-amber-400 bg-gradient-to-b from-amber-200 to-yellow-50 shadow-sm ring-1 ring-amber-300"
            : isSunnah
              ? "border-emerald-400 bg-emerald-50"
              : isSel
                ? "border-slate-400 bg-slate-100 shadow-sm"
                : "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40";

          const gregClass = isGolden
            ? "text-amber-900"
            : isSunnah
              ? "text-emerald-900"
              : isSel
                ? "text-slate-800"
                : "text-slate-800";

          const hijriClass = isGolden
            ? "text-amber-700"
            : isSunnah
              ? "text-emerald-700"
              : "text-slate-500";

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
                stateClass,
                isToday && !isSel ? "ring-1 ring-inset ring-slate-300" : "",
              ].join(" ")}
            >
              <span className={["text-sm font-bold leading-none sm:text-base", gregClass].join(" ")}>
                {gDay}
              </span>
              {/* TAM Hicrî tarih (kısaltma YOK). Dar hücrede kontrollü kelime kaydırma. */}
              <span
                className={["text-[9px] leading-tight [overflow-wrap:anywhere] sm:text-[10px]", hijriClass].join(" ")}
              >
                {cell.hijri.day} {cell.hijri.monthName} {cell.hijri.year}
              </span>
              {/* Altın Gün: BEŞ altın yıldız (dar ekranda kaybolmaz; tek yıldıza inmez). */}
              {isGolden ? (
                <span className="text-[9px] font-bold leading-none tracking-tight text-amber-500 sm:text-[11px]" aria-hidden>
                  ★★★★★
                </span>
              ) : isSunnah ? (
                <span className="rounded bg-emerald-100 px-1 text-[8px] font-bold uppercase leading-tight text-emerald-700" aria-hidden>
                  Sünnet
                </span>
              ) : isSaved && !isSel ? (
                // Kaydedilmiş ama seçimden çıkarılmış (kaydedilince silinecek) — nötr işaret.
                <span className="text-[8px] font-medium leading-none text-slate-400" aria-hidden>
                  kaldırılacak
                </span>
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
