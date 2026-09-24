"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { runInEffect } from "@/lib/runInEffect";
import { useModalFocusTrap } from "@/lib/biyoenerji/useModalFocusTrap";
import { useUnsavedChangesWarning } from "@/lib/biyoenerji/useDirtyGuard";

type BiyoenerjiCrudFormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  titleId?: string;
  /** Ek ring rengi (örn. ring-violet-100/50) */
  accentRingClass?: string;
  /**
   * BIO-004/015 — kaydedilmemiş değişiklik var mı. true iken Esc/backdrop/X ile
   * kapatma önce çıkış onayı gösterir; false ise doğrudan kapanır.
   */
  isDirty?: boolean;
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
  isDirty = false,
  children,
  footer,
}: BiyoenerjiCrudFormModalProps) {
  // BIO-004 — kaydedilmemiş değişiklik çıkış onayı katmanı.
  const [askDiscard, setAskDiscard] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Modal her kapandığında onay katmanını da sıfırla (sonraki açılış temiz başlar).
  useEffect(() => {
    if (!open) runInEffect(() => setAskDiscard(false));
  }, [open]);

  // BIO-012 — focus trap + açılış odağı (dialog) + kapanışta odak restore.
  useModalFocusTrap(open, dialogRef, dialogRef);

  // BIO-015 — yalnız kaydedilmemiş değişiklik varken sayfa kapatma/refresh uyarısı.
  useUnsavedChangesWarning(open && isDirty);

  // Çıkış talebi: dirty ise önce onay, temizse doğrudan kapan.
  const requestClose = useCallback(() => {
    if (isDirty) {
      setAskDiscard(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const onEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (askDiscard) {
        setAskDiscard(false);
        return;
      }
      requestClose();
    },
    [askDiscard, requestClose],
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
      onClick={requestClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative flex h-[80vh] max-h-[80vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/85 bg-[linear-gradient(165deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.96)_38%,rgba(241,245,249,0.92)_100%)] shadow-[0_32px_90px_-28px_rgba(15,23,42,0.22)] outline-none ring-1 ${accentRingClass}`}
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
              onClick={requestClose}
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

        {/* BIO-004 — kaydedilmemiş değişiklik çıkış onayı */}
        {askDiscard ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="biyo-crud-discard-title"
          >
            <div className="w-full max-w-[420px] rounded-2xl border border-white/90 bg-white/95 p-6 shadow-[0_20px_50px_-18px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/60">
              <h3
                id="biyo-crud-discard-title"
                className="text-[15px] font-black leading-snug text-slate-950"
              >
                Kaydedilmemiş değişiklikler
              </h3>
              <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-500">
                Kaydedilmemiş değişiklikleriniz var. Çıkarsanız yaptığınız değişiklikler kaybolacak.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAskDiscard(false)}
                  className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Düzenlemeye Devam Et
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAskDiscard(false);
                    onClose();
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)] transition hover:bg-rose-700"
                >
                  Değişiklikleri Sil ve Çık
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
