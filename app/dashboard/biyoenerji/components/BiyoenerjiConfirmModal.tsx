"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

type BiyoenerjiConfirmModalProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  titleId?: string;
};

/**
 * Tek kayıt silme onayı — modül geneli tek premium cam stil.
 * (Toplu silme için BiyoenerjiDangerDeleteModal kullanılır.)
 */
export function BiyoenerjiConfirmModal({
  open,
  title,
  message = "Bu işlem geri alınamaz. Kayıt listeden kaldırılır.",
  confirmLabel = "Evet, sil",
  busyLabel = "Siliniyor…",
  busy = false,
  onClose,
  onConfirm,
  titleId = "bio-confirm-modal-title",
}: BiyoenerjiConfirmModalProps) {
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
      if (e.key === "Escape" && !busy) onClose();
    },
    [busy, onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onEscape]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-[420px] rounded-[22px] border border-white/90 bg-white/88 p-6 shadow-[0_20px_50px_-18px_rgba(15,23,42,0.12)] ring-1 ring-violet-100/50 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
          SİLME ONAYI
        </div>
        <h3 id={titleId} className="mt-2 text-[17px] font-black leading-snug text-slate-950">
          {title}
        </h3>
        <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-500">{message}</p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
