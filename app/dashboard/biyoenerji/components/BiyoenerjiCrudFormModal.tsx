"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type BiyoenerjiCrudFormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  titleId?: string;
  /** Ek ring rengi (örn. ring-violet-100/50) */
  accentRingClass?: string;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Biyoenerji CRUD formları — geniş ortalanmış panel (max-w-6xl, ~80vh, gövde scroll).
 * LargeTextModal (daha yüksek z-index) üzerinde açılabilir.
 */
export function BiyoenerjiCrudFormModal({
  open,
  onClose,
  title,
  subtitle,
  titleId = "biyo-crud-form-modal-title",
  accentRingClass = "ring-violet-100/45",
  children,
  footer,
}: BiyoenerjiCrudFormModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onEscape]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-md sm:p-5"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`flex h-[80vh] max-h-[80vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/85 bg-[linear-gradient(165deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.96)_38%,rgba(241,245,249,0.92)_100%)] shadow-[0_32px_90px_-28px_rgba(15,23,42,0.22)] ring-1 ${accentRingClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-slate-200/70 bg-white/35 px-4 py-3.5 backdrop-blur-sm sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-[15px] font-black leading-snug tracking-tight text-slate-900 sm:text-lg"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500 sm:text-[12px]">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-lg leading-none text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              aria-label="Kapat"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        <div className="shrink-0 border-t border-slate-200/70 bg-white/45 px-4 py-3.5 backdrop-blur-sm sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
