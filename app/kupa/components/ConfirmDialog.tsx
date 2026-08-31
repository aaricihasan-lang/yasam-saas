"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { kupaBtnGhost, kupaBtnPrimary } from "./KupaShell";

/**
 * Yaşam Sistemi standart onay/uyarı modalı (Kupa görsel dili).
 *
 * Native tarayıcı onay/uyarı popup'ı YERİNE kullanılır. Kanıtlanmış Kupa dialog desenini
 * (MasterPickerDialog / BigNoteEditorDialog) izler: document.body'ye PORTAL, role="dialog"
 * + aria-modal, Escape ile kapanış, arka plan scroll kilidi, backdrop tıklaması, focus
 * modala girer + tetikleyiciye döner + basit focus-trap (Tab döngüsü). Mobil-güvenli.
 *
 * İKİ mod:
 *   A) Yıkıcı onay  → onConfirm + confirmLabel verildiğinde: [cancelLabel] [confirmLabel(kırmızı)].
 *   B) Uyarı        → onConfirm YOKKEN: yalnız [closeLabel]; children ile ek içerik/aksiyon.
 */
export function KupaConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel = "Vazgeç",
  closeLabel = "Kapat",
  busy = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  /** Verildiğinde yıkıcı onay modu aktifleşir (kırmızı aksiyon butonu). */
  confirmLabel?: string;
  onConfirm?: () => void;
  cancelLabel?: string;
  closeLabel?: string;
  busy?: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const isConfirm = typeof onConfirm === "function" && typeof confirmLabel === "string";

  // Tetikleyici odağını sakla → kapanışta geri ver (a11y). Açılışta güvenli butona odaklan.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const trigger = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => initialFocusRef.current?.focus(), 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!busy) onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Basit focus-trap: odak modal panelinin İÇİNDE döner.
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    window.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Odağı tetikleyiciye geri ver (hâlâ DOM'daysa).
      if (trigger && typeof trigger.focus === "function" && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => { if (!busy) onClose(); }}
        aria-hidden
      />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <h3 id={titleId} className="text-lg font-black tracking-tight text-slate-900">
          {title}
        </h3>
        <p id={descId} className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-600">
          {description}
        </p>

        {children ? <div className="mt-3">{children}</div> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {isConfirm ? (
            <>
              <button
                ref={initialFocusRef}
                type="button"
                className={`${kupaBtnGhost} min-h-[44px] justify-center`}
                onClick={onClose}
                disabled={busy}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-rose-600/20 transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? "Siliniyor…" : confirmLabel}
              </button>
            </>
          ) : (
            <button
              ref={initialFocusRef}
              type="button"
              className={`${kupaBtnPrimary} min-h-[44px]`}
              onClick={onClose}
              disabled={busy}
            >
              {closeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
