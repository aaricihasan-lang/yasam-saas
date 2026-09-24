"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * REF-012 — Modal erişilebilirliği için ortak hook (AtlasEditModal deseninin
 * yeniden kullanılabilir hâli). Beş refleksoloji modalında tekrarlanan 5 ayrı
 * implementasyon yerine tek kaynak:
 *   - focus restore (kapanınca açan elemana döner),
 *   - initial focus (ilk odaklanabilir eleman / verilen ref),
 *   - Tab / Shift+Tab focus trap (arka sayfaya kaçmaz),
 *   - ESC ile kapatma,
 *   - body scroll kilidi.
 *
 * Dönüş: modal PANEL elemanına bağlanacak ref.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(options: {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): RefObject<T | null> {
  const { open, onClose, initialFocusRef } = options;
  const containerRef = useRef<T | null>(null);

  // Focus restore
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    return () => {
      previousFocus?.focus?.();
    };
  }, [open]);

  // İlk odak
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const el =
        initialFocusRef?.current ??
        containerRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
      el?.focus?.();
    }, 30);
    return () => clearTimeout(timer);
  }, [open, initialFocusRef]);

  // ESC + Tab trap
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Body scroll kilidi
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return containerRef;
}
