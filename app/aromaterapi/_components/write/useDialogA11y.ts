"use client";

import { useEffect, type RefObject } from "react";

/**
 * Aromaterapi V2 — erişilebilir (confirm-OLMAYAN) diyalog davranışı.
 *
 * ESC ile kapatma, odak tuzağı (Tab döngüsü panel içinde), açılışta ilk odak,
 * kapanışta odak iadesi. Yalnız yan-etki (state güncellemesi YOK).
 *
 * `AromaterapiConfirmDialog` confirm-semantic (Onayla/Vazgeç) diyaloglar içindir;
 * bu hook büyük-metin/içerik editörü gibi confirm-olmayan modalların erişilebilirlik
 * sözleşmesini (role="dialog" + aria-modal + aria-labelledby ile birlikte) sağlar.
 */
export function useDialogA11y(opts: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  /** Açılışta odaklanacak eleman (verilmezse panel). */
  initialFocusRef?: RefObject<HTMLElement | null>;
}): void {
  const { open, onClose, panelRef, initialFocusRef } = opts;

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    // Açılışta ilk odak (verilen eleman, yoksa panel).
    (initialFocusRef?.current ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Kapanışta odağı tetikleyen elemana iade et.
      prevActive?.focus?.();
    };
  }, [open, onClose, panelRef, initialFocusRef]);
}
