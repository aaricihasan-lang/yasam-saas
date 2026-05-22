"use client";

import { DOGALTAS_MODAL_FONT_DEFAULT } from "@/lib/dogaltas/dogaltasModalFontSize";

type DogaltasFontSizeControlProps = {
  fontSizePx: number;
  onDecrease: () => void;
  onReset: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
  isDefault?: boolean;
  compact?: boolean;
};

const btnBase =
  "inline-flex min-w-[2.25rem] items-center justify-center rounded-xl font-black transition duration-200 disabled:cursor-not-allowed disabled:opacity-40";
const btnActive =
  "bg-gradient-to-br from-violet-600 to-cyan-600 text-white shadow-md";
const btnIdle =
  "bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-900";

export function DogaltasFontSizeControl({
  fontSizePx,
  onDecrease,
  onReset,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
  isDefault = fontSizePx === DOGALTAS_MODAL_FONT_DEFAULT,
  compact = false,
}: DogaltasFontSizeControlProps) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-violet-200/90 bg-white/95 shadow-sm ring-1 ring-violet-100/70 ${
        compact ? "p-1" : "px-2 py-1.5"
      }`}
      role="group"
      aria-label="Yazı boyutu"
    >
      <span
        className={`font-black uppercase tracking-wider text-slate-500 ${
          compact ? "px-1.5 text-[9px]" : "px-2 text-[10px]"
        }`}
      >
        Yazı Boyutu
      </span>

      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className={`${btnBase} ${btnIdle}`}
        aria-label="Yazıyı küçült"
        title="Küçült (A-)"
      >
        A-
      </button>

      <button
        type="button"
        onClick={onReset}
        className={`${btnBase} ${isDefault ? btnActive : btnIdle}`}
        aria-label={`Varsayılan yazı boyutu (${DOGALTAS_MODAL_FONT_DEFAULT}px)`}
        title={`Varsayılan (${DOGALTAS_MODAL_FONT_DEFAULT}px)`}
      >
        A
      </button>

      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className={`${btnBase} ${btnIdle}`}
        aria-label="Yazıyı büyüt"
        title="Büyüt (A+)"
      >
        A+
      </button>

      <span
        className={`tabular-nums font-bold text-slate-500 ${
          compact ? "px-1 text-[10px]" : "px-1.5 text-xs"
        }`}
        aria-live="polite"
      >
        {fontSizePx}px
      </span>
    </div>
  );
}
