"use client";

import { useEffect, useRef } from "react";

/**
 * Modal erişilebilirliği (MEM-026 kapsamı, minimal): açılınca odağı diyaloğa taşır, Escape ile
 * kapatır (işlem sürerken kapatmaz), kapanınca odağı tetikleyen öğeye geri verir.
 * Kullanım: const ref = useDialogA11y(open, onClose, busy); <div ref={ref} tabIndex={-1} role="dialog" …>
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  busy = false,
) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = el?.querySelector<HTMLElement>(
      "[data-autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (focusable ?? el)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return ref;
}
