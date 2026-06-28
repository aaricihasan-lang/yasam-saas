"use client";

import { useEffect, useRef } from "react";

export type UseOverlayOptions = {
  /** Overlay açık mı? */
  open: boolean;
  /** Kapatma isteği (Esc veya — çağıran tarafından — arka plan tıklaması). */
  onClose: () => void;
  /** Esc ile kapatmayı etkinleştir (varsayılan: true). */
  closeOnEsc?: boolean;
  /** Açıkken arka plan scroll'unu kilitle (varsayılan: true). */
  lockScroll?: boolean;
  /** Focus tuzağı + ilk-focus + kapanışta focus geri-yükleme (varsayılan: true). */
  trapFocus?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Doğaltaş overlay'leri (modal/drawer/reader) için ortak davranış: scroll-lock,
 * Esc-ile-kapat, focus tuzağı, ilk-focus ve kapanışta focus geri-yükleme.
 *
 * Döndürülen `containerRef`'i overlay'in kök (kart) elemanına bağlayın.
 * Arka plan tıklamasıyla kapatma, görsel yapı çağırana ait olduğu için burada
 * yönetilmez — `onClose`'u backdrop `onMouseDown`'ında siz çağırın.
 */
export function useOverlay<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  closeOnEsc = true,
  lockScroll = true,
  trapFocus = true,
}: UseOverlayOptions) {
  const containerRef = useRef<T>(null);

  // onClose'u ref'te tut — effect bağımlılıklarını sade tutar.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Scroll kilidi
  useEffect(() => {
    if (!open || !lockScroll || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, lockScroll]);

  // Esc ile kapat
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, closeOnEsc]);

  // Focus tuzağı + ilk-focus + geri-yükleme
  useEffect(() => {
    if (!open || !trapFocus || typeof document === "undefined") return;
    const node = containerRef.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // İlk focus
    const focusables = getFocusable();
    (focusables[0] ?? node).focus?.();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", handleKey);
    return () => {
      node.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [open, trapFocus]);

  return { containerRef };
}
