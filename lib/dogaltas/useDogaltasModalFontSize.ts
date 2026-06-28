"use client";

import { dogaltasModalFontStore } from "@/lib/dogaltas/dogaltasModalFontSize";
import { useFontSizeStore } from "@/lib/dogaltas/useFontSizeStore";

export function useDogaltasModalFontSize(open: boolean) {
  const { fontSizePx, decrease, reset, increase, canDecrease, canIncrease, isDefault } =
    useFontSizeStore(dogaltasModalFontStore, { open });

  return {
    modalFontSize: fontSizePx,
    decrease,
    reset,
    increase,
    canDecrease,
    canIncrease,
    isDefault,
  };
}
