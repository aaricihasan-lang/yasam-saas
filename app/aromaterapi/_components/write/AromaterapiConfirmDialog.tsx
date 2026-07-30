"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Aromaterapi V2 — C3D erişilebilir onay diyaloğu primitifi.
 *
 * İleriki tekli/toplu/purge silme akışlarının güçlü onay adımı için temeldir.
 * SALT SUNUM: gerçek silme/mutation YOKTUR (C3D-A). Erişilebilirlik: role="dialog"
 * + aria-modal, odak tuzağı (Tab döngüsü), Escape ile kapatma, açılışta güvenli
 * varsayılan odak (Vazgeç — yıkıcı eylem varsayılan odaklı DEĞİL), 44px hedefler.
 */

export type AromaterapiConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Onay öncesi ek içerik (ör. silme etki önizlemesi). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Onay düğmesi pasif mi? (ör. onay metni/token henüz eşleşmedi.) */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AromaterapiConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  tone = "default",
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: AromaterapiConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Açılışta güvenli odak (Vazgeç); Escape ve odak tuzağı — yalnız yan-etki (state yok).
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls =
    tone === "danger"
      ? "bg-gradient-to-r from-rose-500 to-red-500"
      : "bg-gradient-to-r from-emerald-500 to-teal-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-[16px] font-black tracking-tight text-slate-900">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">
            {description}
          </p>
        ) : null}

        {children ? <div className="mt-3">{children}</div> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[13px] font-black text-white shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${
              confirmDisabled ? "cursor-not-allowed bg-slate-300" : `${confirmCls} hover:brightness-105`
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
