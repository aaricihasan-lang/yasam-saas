"use client";

import { useMemo } from "react";
import {
  mineralContentTypography,
  mineralDetailFontStore,
} from "@/lib/dogaltas/mineralDetailFontSize";
import { useFontSizeStore } from "@/lib/dogaltas/useFontSizeStore";

export function useMineralDetailFontSize() {
  const { fontSizePx, decrease, reset, increase, canDecrease, canIncrease, isDefault } =
    useFontSizeStore(mineralDetailFontStore);

  const typography = useMemo(
    () => mineralContentTypography(fontSizePx),
    [fontSizePx],
  );

  return {
    fontSizePx,
    typography,
    decrease,
    reset,
    increase,
    canDecrease,
    canIncrease,
    isDefault,
  };
}
