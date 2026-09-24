"use client";
import { useEffect, type RefObject } from "react";

/**
 * BIO-012 — Modal erişilebilirliği: açılışta odak modala girer, Tab/Shift+Tab
 * modal içinde döner (focus trap), kapanışta odak tetikleyen öğeye geri döner.
 *
 * Escape'i YÖNETMEZ: Escape davranışı (temiz → kapat, dirty → uyarı) ilgili modal
 * tarafından ele alınır ki dirty-guard ile çakışmasın.
 *
 * @param open              modal açık mı
 * @param containerRef      dialog kök öğesi (role="dialog")
 * @param initialFocusRef   açılışta odaklanacak öğe (verilmezse ilk odaklanabilir öğe)
 */
export function useModalFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null,
      );

    // Açılış odağı.
    const initial = initialFocusRef?.current ?? getFocusable()[0] ?? container;
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open, containerRef, initialFocusRef]);
}
