"use client";

import { useEffect, type RefObject } from "react";

/**
 * HD modalleri için erişilebilirlik yardımcı hook'u (HD-P2-a11y).
 *
 * HdUnsavedChangesDialog'daki KANITLANMIŞ yaklaşımı yeniden kullanır:
 *   - Açılışta odağı modal kabına (varsa ilk focusable öğeye) taşır.
 *   - ESC → onClose (backdrop davranışını DEĞİŞTİRMEZ; çağıran ne veriyorsa o).
 *   - Tab / Shift+Tab focus-trap: odak modal dışına KAÇMAZ, döngüsel gezinir.
 *   - Kapanınca odak, modalı AÇAN öğeye geri döner (focus restore).
 *
 * Kullanan modal kabı ayrıca role="dialog" aria-modal="true" aria-labelledby=... ve
 * tabIndex={-1} taşımalıdır. SSR-safe (document yalnız effect içinde). Yeni paket YOK.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type HdModalA11yOptions = {
  /**
   * ESC tuşu modalı kapatsın mı? Salt-okuma modallerinde true (varsayılan).
   * Kaydedilmemiş düzenleme içeren form modallerinde false verin → ESC ile
   * SESSİZ veri kaybı OLMAZ (kullanıcı Kapat/Güncelle ile bilinçli çıkar).
   * Focus-trap + focus-restore + role her durumda uygulanır.
   */
  closeOnEsc?: boolean;
};

export function useHdModalA11y(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  options?: HdModalA11yOptions,
): void {
  const closeOnEsc = options?.closeOnEsc ?? true;
  // Mount-only: açan öğeyi hatırla → ilk odağı ver → kapanınca geri döndür.
  // onClose'a BAĞLI DEĞİL → her render'da odak çalınmaz.
  useEffect(() => {
    const opener = (document.activeElement as HTMLElement | null) ?? null;
    const node = ref.current;
    const focusables = node?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables && focusables.length > 0) {
      focusables[0]!.focus();
    } else {
      node?.focus?.();
    }
    return () => {
      opener?.focus?.();
    };
  }, [ref]);

  // ESC + Tab focus-trap.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!closeOnEsc) return; // form modali: ESC ile sessiz veri kaybı YOK
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const node = ref.current;
        if (!node) return;
        const f = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (f.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const first = f[0]!;
        const last = f[f.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === node)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ref, onClose, closeOnEsc]);
}
