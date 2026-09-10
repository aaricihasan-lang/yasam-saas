"use client";

import { kupaPill } from "@/app/kupa/components/KupaShell";
import { MONTHS_TR } from "./MonthCalendar";

/**
 * FAZ 5 / AŞAMA 3 — TEK-AY gezinme (kompakt).
 *
 * OWNER GÖRSEL KARARI: kalıcı 12-buton ay duvarı KALDIRILDI. Yerine tek satır:
 *   [‹]  [ Eylül 2026 ▼ ]  [›]
 * Ortadaki gerçek <select>; önceki/sonraki plan yılı sınırında durur (Aralık'tan sonrası
 * ve Ocak'tan öncesi devre dışı — plan yılı terk edilmez). Aynı anda TEK ay görünür.
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
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, month - 1))}
        disabled={month <= 1}
        className={`${kupaPill} min-h-[40px] min-w-[40px] px-3 text-base disabled:cursor-not-allowed disabled:opacity-40`}
        aria-label="Önceki ay"
      >
        ‹
      </button>

      <label className="relative flex items-center">
        <span className="sr-only">Ay seç</span>
        <select
          value={month}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={`Ay seç — şu an ${MONTHS_TR[month - 1]} ${year}`}
          className="min-h-[40px] appearance-none rounded-xl border border-amber-200 bg-white px-4 py-2 pr-9 text-center text-sm font-black text-slate-800 outline-none transition hover:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-400/60 sm:text-base"
        >
          {MONTHS_TR.map((label, i) => (
            <option key={i + 1} value={i + 1}>
              {label} {year}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 text-slate-400" aria-hidden>
          ▼
        </span>
      </label>

      <button
        type="button"
        onClick={() => onChange(Math.min(12, month + 1))}
        disabled={month >= 12}
        className={`${kupaPill} min-h-[40px] min-w-[40px] px-3 text-base disabled:cursor-not-allowed disabled:opacity-40`}
        aria-label="Sonraki ay"
      >
        ›
      </button>
    </div>
  );
}
