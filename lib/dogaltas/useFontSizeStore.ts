"use client";

import { useCallback, useEffect, useState } from "react";
import type { FontSizeStore } from "@/lib/dogaltas/createFontSizeStore";

export type UseFontSizeStoreResult = {
  fontSizePx: number;
  decrease: () => void;
  reset: () => void;
  increase: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
  isDefault: boolean;
};

/**
 * Bir `FontSizeStore` için ortak A-/A/A+ durum hook'u.
 *
 * `options.open` verilirse (modal kullanımı) depo her açılışta yeniden okunur;
 * verilmezse (sayfa kullanımı) yalnızca mount'ta okunur.
 */
export function useFontSizeStore(
  store: FontSizeStore,
  options?: { open?: boolean },
): UseFontSizeStoreResult {
  const open = options?.open;
  const rereadOnOpen = open !== undefined;
  const [fontSizePx, setFontSizePx] = useState(store.config.defaultPx);

  useEffect(() => {
    if (rereadOnOpen && !open) return;
    setFontSizePx(store.read());
  }, [rereadOnOpen, open, store]);

  const persist = useCallback(
    (next: number) => {
      const clamped = store.clamp(next);
      setFontSizePx(clamped);
      store.write(clamped);
    },
    [store],
  );

  const decrease = useCallback(
    () => persist(fontSizePx - store.config.stepPx),
    [fontSizePx, persist, store],
  );

  const increase = useCallback(
    () => persist(fontSizePx + store.config.stepPx),
    [fontSizePx, persist, store],
  );

  const reset = useCallback(
    () => persist(store.config.defaultPx),
    [persist, store],
  );

  return {
    fontSizePx,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > store.config.minPx,
    canIncrease: fontSizePx < store.config.maxPx,
    isDefault: fontSizePx === store.config.defaultPx,
  };
}
