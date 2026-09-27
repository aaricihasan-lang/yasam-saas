"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { DOGALTAS_TEXTAREA_CLASS } from "@/lib/dogaltas/formStyles";
import { useOverlay } from "@/lib/dogaltas/useOverlay";
import {
  LONG_TEXT_EDITOR_CLOSED,
  closeLongTextEditor,
  openLongTextEditor,
  type LongTextCloseReason,
  type LongTextEditorState,
  type LongTextOpenSource,
} from "@/lib/dogaltas/longTextEditor";

type LongTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Geniş editör başlığı (alan etiketi). */
  title: string;
  placeholder?: string;
  /** Geniş editörde başlık altında gösterilen yardımcı not (ör. "Her satıra bir madde"). */
  hint?: string;
  rows?: number;
  disabled?: boolean;
  /** Dış sarmalayıcı sınıfı (ör. "mt-auto"). */
  className?: string;
  /** Satır içi textarea sınıfı; verilmezse Doğaltaş standart textarea stili. */
  textareaClassName?: string;
  ariaLabel?: string;
  /** Harness/UAT için kararlı seçici. */
  testId?: string;
};

/**
 * Doğaltaş uzun metin alanı: satır içi textarea + ⤢ butonu + geniş editör.
 *
 * - Fare tıklaması / dokunma → geniş editör OTOMATİK açılır.
 * - ⤢ butonu → aynı editörü açar (ikinci yol).
 * - Klavye (Tab) odağı editör AÇMAZ; kullanıcı yerinde yazabilir.
 * - Editör taslak tutmaz: yazılan her karakter doğrudan `onChange` ile forma gider,
 *   bu yüzden hangi yolla kapanırsa kapansın metin kaybolmaz.
 */
export function LongTextField({
  value,
  onChange,
  title,
  placeholder,
  hint,
  rows,
  disabled = false,
  className = "",
  textareaClassName,
  ariaLabel,
  testId,
}: LongTextFieldProps) {
  const t = useTranslations("stones.longText");
  const [editor, setEditor] = useState<LongTextEditorState>(LONG_TEXT_EDITOR_CLOSED);

  const open = (source: LongTextOpenSource) => {
    setEditor((prev) => openLongTextEditor(prev, source, Date.now(), disabled));
  };
  const close = (reason: LongTextCloseReason) => {
    setEditor((prev) => closeLongTextEditor(prev, reason, Date.now()));
  };

  return (
    <div className={`relative ${className}`} data-long-text-field={testId ?? ""}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={() => open("pointer")}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        aria-label={ariaLabel ?? title}
        aria-haspopup="dialog"
        className={`${textareaClassName ?? DOGALTAS_TEXTAREA_CLASS} cursor-text pr-12`}
      />
      <button
        type="button"
        onClick={() => open("arrow")}
        disabled={disabled}
        title={t("expand")}
        aria-label={t("expand")}
        className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/60 bg-white/95 text-base font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ⤢
      </button>

      {editor.open ? (
        <LongTextEditorModal
          title={title}
          hint={hint}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onRequestClose={close}
        />
      ) : null}
    </div>
  );
}

function LongTextEditorModal({
  title,
  hint,
  value,
  placeholder,
  onChange,
  onRequestClose,
}: {
  title: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onRequestClose: (reason: LongTextCloseReason) => void;
}) {
  const t = useTranslations("stones.longText");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Esc burada (dialog onKeyDown) yönetilir ve yayılımı durdurulur: bu editör başka bir
  // modalın içinden açıldığında (ör. toplu güncelleme) alttaki modal da kapanmasın.
  const { containerRef } = useOverlay<HTMLDivElement>({
    open: true,
    onClose: () => onRequestClose("escape"),
    closeOnEsc: false,
    initialFocusRef: textareaRef,
  });

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onRequestClose("escape");
  };

  if (typeof document === "undefined") return null;

  // Portal: satır içi alanın ata kartlarında transform/backdrop-filter var; fixed
  // konumlu modal onların içinde kalırsa kart kutusuna hapsolur.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onRequestClose("backdrop");
      }}
      data-long-text-backdrop=""
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dogaltas-long-text-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex h-[100dvh] w-full flex-col bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-[0_35px_90px_rgba(15,23,42,0.22)] sm:h-[82vh] sm:max-w-[1040px] sm:rounded-[30px] sm:p-6"
        data-long-text-editor=""
      >
        <div className="mb-3 flex items-start justify-between gap-4 sm:mb-5">
          <div className="min-w-0">
            <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
              {t("badge")}
            </div>
            <h2
              id="dogaltas-long-text-title"
              className="break-words text-[20px] font-black text-slate-950 sm:text-[26px]"
            >
              {title}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">{hint || t("subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={() => onRequestClose("close-button")}
            aria-label={t("close")}
            title={t("close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[20px] font-black text-slate-600 transition hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className="min-h-0 flex-1 resize-none rounded-[24px] border-2 border-emerald-200 bg-white/90 p-4 text-[15px] font-medium leading-7 text-slate-700 shadow-inner outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30 sm:p-5"
        />

        <div className="mt-3 flex items-center justify-between gap-3 sm:mt-5">
          <p className="min-w-0 text-[12px] font-semibold text-slate-400">
            {t("charCount", { n: value.length })}
            <span className="hidden sm:inline"> · {t("autoSync")}</span>
          </p>
          <button type="button" onClick={() => onRequestClose("done")} className="btn-primary">
            {t("done")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
