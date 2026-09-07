"use client";

import { kupaPill, kupaPillActive } from "@/app/kupa/components/KupaShell";
import { MONTHS_TR } from "./MonthCalendar";

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;

/**
 * FAZ 5 / AŞAMA 3 — Ay gezinme + hızlı 12-ay seçici.
 * Aralık'a ulaşmak için 11 kez ileri gitmek GEREKMEZ (kompakt 12-ay ızgarası).
 */
export function MonthNav({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number; // 1–12
  onChange: (month: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, month - 1))}
          disabled={month <= 1}
          className={`${kupaPill} min-h-[36px] px-3 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label="Önceki ay"
        >
          ‹
        </button>
        <span className="text-sm font-black text-slate-800 sm:text-base" aria-live="polite">
          {MONTHS_TR[month - 1]} {year}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(12, month + 1))}
          disabled={month >= 12}
          className={`${kupaPill} min-h-[36px] px-3 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label="Sonraki ay"
        >
          ›
        </button>
      </div>

      {/* Hızlı 12-ay seçici */}
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Ay seç">
        {MONTHS_SHORT.map((label, i) => {
          const m = i + 1;
          const active = m === month;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={active}
              aria-label={`${MONTHS_TR[i]} ${year}`}
              className={`${active ? kupaPillActive : kupaPill} min-h-[36px]`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
