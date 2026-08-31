"use client";

import { useTranslations } from "next-intl";
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
  /** Orta A varsayılan px (farklı modüller için) */
  defaultFontSizePx?: number;
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
  isDefault,
  compact = false,
  defaultFontSizePx = DOGALTAS_MODAL_FONT_DEFAULT,
}: DogaltasFontSizeControlProps) {
  const isDefaultSize = isDefault ?? fontSizePx === defaultFontSizePx;
  const t = useTranslations("stones.fontSize");
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-violet-200/90 bg-white/95 shadow-sm ring-1 ring-violet-100/70 ${
        compact ? "p-1" : "px-2 py-1.5"
      }`}
      role="group"
      aria-label={t("groupAria")}
    >
      <span
        className={`font-black uppercase tracking-wider text-slate-500 ${
          compact ? "px-1.5 text-[9px]" : "px-2 text-[10px]"
        }`}
      >
        {t("label")}
      </span>

      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className={`${btnBase} ${btnIdle}`}
        aria-label={t("decreaseAria")}
        title={t("decreaseTitle")}
      >
        A-
      </button>

      <button
        type="button"
        onClick={onReset}
        className={`${btnBase} ${isDefaultSize ? btnActive : btnIdle}`}
        aria-label={t("resetAria", { px: defaultFontSizePx })}
        title={t("resetTitle", { px: defaultFontSizePx })}
      >
        A
      </button>

      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className={`${btnBase} ${btnIdle}`}
        aria-label={t("increaseAria")}
        title={t("increaseTitle")}
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
