"use client";

import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { DOGALTAS_MODAL_LINE_HEIGHT } from "@/lib/dogaltas/dogaltasModalFontSize";
import { useDogaltasModalFontSize } from "@/lib/dogaltas/useDogaltasModalFontSize";
import { useOverlay } from "@/lib/dogaltas/useOverlay";
import { useCallback, type ReactNode } from "react";

export type StoneReaderModalProps = {
  open: boolean;
  title: string;
  badge: string;
  subtitle?: string;
  text: string;
  highlightQuery?: string;
  renderHighlight?: (text: string, key: string) => ReactNode;
  matchBadge?: ReactNode;
  /** Demo hesapta içerik koruması: başlık/kontroller açık kalır, metin alanı blur olur */
  contentBlurred?: boolean;
  onClose: () => void;
};

export function StoneReaderModal({
  open,
  title,
  badge,
  subtitle,
  text,
  highlightQuery,
  renderHighlight,
  matchBadge,
  contentBlurred = false,
  onClose,
}: StoneReaderModalProps) {
  const {
    modalFontSize,
    decrease,
    reset,
    increase,
    canDecrease,
    canIncrease,
    isDefault,
  } = useDogaltasModalFontSize(open);

  const renderSegment = useCallback(
    (segment: string, key: string) => {
      const q = highlightQuery?.trim();
      if (q && renderHighlight) {
        return renderHighlight(segment, key);
      }
      return segment;
    },
    [highlightQuery, renderHighlight],
  );

  const { containerRef } = useOverlay<HTMLDivElement>({ open, onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4 md:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stone-reader-title"
        tabIndex={-1}
        className="flex h-[min(90vh,940px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-t-[28px] border border-violet-200/60 bg-gradient-to-b from-white via-violet-50/25 to-cyan-50/20 shadow-2xl ring-1 ring-white/90 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 shrink-0 border-b border-violet-100/90 bg-white/95 px-4 py-4 backdrop-blur-md sm:px-7 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex rounded-full border border-cyan-200/80 bg-gradient-to-r from-cyan-50 to-violet-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800">
                {badge}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <h2
                  id="stone-reader-title"
                  className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl md:text-4xl"
                >
                  {title}
                </h2>
                {matchBadge}
              </div>

              {subtitle ? (
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500 sm:text-base">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2.5 sm:items-end">
              <DogaltasFontSizeControl
                fontSizePx={modalFontSize}
                onDecrease={decrease}
                onReset={reset}
                onIncrease={increase}
                canDecrease={canDecrease}
                canIncrease={canIncrease}
                isDefault={isDefault}
                compact
              />

              <button
                type="button"
                onClick={onClose}
                className="btn-soft !px-5 !py-3"
              >
                <span aria-hidden>×</span>
                Kapat
              </button>
            </div>
          </div>
        </header>

        <div className="stone-reader-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-8 sm:py-7">
          <div
            className="mx-auto w-full max-w-[58rem]"
            style={{ fontSize: modalFontSize, lineHeight: DOGALTAS_MODAL_LINE_HEIGHT }}
          >
            {contentBlurred ? (
              <>
                <div
                  className="overflow-hidden pointer-events-none select-none"
                  style={{ filter: "blur(6px)", userSelect: "none" }}
                  aria-hidden="true"
                >
                  {formatStoneContent(text, { renderSegment, fontSizePx: modalFontSize })}
                </div>
                <p className="mt-6 text-center text-sm font-black text-amber-600">
                  🔒 Demo hesabında bu içerik korumalıdır
                </p>
              </>
            ) : (
              formatStoneContent(text, { renderSegment, fontSizePx: modalFontSize })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
