"use client";

import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { useCallback, useEffect, type ReactNode } from "react";

export type StoneReaderModalProps = {
  open: boolean;
  title: string;
  badge: string;
  subtitle?: string;
  text: string;
  highlightQuery?: string;
  renderHighlight?: (text: string, key: string) => ReactNode;
  matchBadge?: ReactNode;
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
  onClose,
}: StoneReaderModalProps) {
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

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="stone-reader-title"
        className="flex h-[min(90vh,920px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-t-[28px] border border-violet-200/60 bg-gradient-to-b from-white via-violet-50/25 to-cyan-50/20 shadow-2xl ring-1 ring-white/90 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 shrink-0 border-b border-violet-100/90 bg-white/95 px-4 py-4 backdrop-blur-md sm:px-7 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 pr-2">
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

            <button
              type="button"
              onClick={onClose}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-2xl border border-slate-200 bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg transition duration-200 hover:bg-slate-800 sm:self-start"
            >
              <span aria-hidden>×</span>
              Kapat
            </button>
          </div>
        </header>

        <div className="stone-reader-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-7 sm:py-6">
          <div className="mx-auto w-full max-w-[52rem]">
            {formatStoneContent(text, { renderSegment })}
          </div>
        </div>
      </div>
    </div>
  );
}
