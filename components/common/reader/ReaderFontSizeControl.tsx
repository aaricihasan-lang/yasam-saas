"use client";

import { useTranslations } from "next-intl";
import { READER_FONT_DEFAULT } from "./readerFontStore";

/**
 * Genel amaçlı okuyucu yazı-boyutu kontrolü (A− / A / A+). Görsel dil Yaşam Sistemi
 * premium violet/cyan aksanıyla uyumludur; Doğaltaş kontrolüyle aynı markup kullanılır
 * (tek reader implementasyonu). Modüller kendi default'unu geçebilir.
 */
type ReaderFontSizeControlProps = {
  fontSizePx: number;
  onDecrease: () => void;
  onReset: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
  isDefault?: boolean;
  compact?: boolean;
  defaultFontSizePx?: number;
};

const btnBase =
  "inline-flex min-w-[2.25rem] items-center justify-center rounded-xl font-black transition duration-200 disabled:cursor-not-allowed disabled:opacity-40";
const btnActive = "bg-gradient-to-br from-violet-600 to-cyan-600 text-white shadow-md";
const btnIdle = "bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-900";

export function ReaderFontSizeControl({
  fontSizePx,
  onDecrease,
  onReset,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
  isDefault,
  compact = false,
  defaultFontSizePx = READER_FONT_DEFAULT,
}: ReaderFontSizeControlProps) {
  // I18N (QTM-DG-02): ortak okuyucu yazı boyutu metinleri ekran dilinde (common.reader; TR birebir).
  const tr = useTranslations("common.reader");
  const isDefaultSize = isDefault ?? fontSizePx === defaultFontSizePx;
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-violet-200/90 bg-white/95 shadow-sm ring-1 ring-violet-100/70 ${
        compact ? "p-1" : "px-2 py-1.5"
      }`}
      role="group"
      aria-label={tr("fontSizeGroup")}
    >
      <span
        className={`font-black uppercase tracking-wider text-slate-500 ${
          compact ? "px-1.5 text-[9px]" : "px-2 text-[10px]"
        }`}
      >
        {tr("fontSize")}
      </span>
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className={`${btnBase} ${btnIdle}`}
        aria-label={tr("decreaseAria")}
        title={tr("decreaseTitle")}
      >
        A-
      </button>
      <button
        type="button"
        onClick={onReset}
        className={`${btnBase} ${isDefaultSize ? btnActive : btnIdle}`}
        aria-label={tr("resetAria", { px: defaultFontSizePx })}
        title={tr("resetTitle", { px: defaultFontSizePx })}
      >
        A
      </button>
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className={`${btnBase} ${btnIdle}`}
        aria-label={tr("increaseAria")}
        title={tr("increaseTitle")}
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
