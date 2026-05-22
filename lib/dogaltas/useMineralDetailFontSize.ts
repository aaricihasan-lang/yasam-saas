"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampMineralDetailFontSize,
  mineralContentTypography,
  MINERAL_DETAIL_FONT_DEFAULT,
  MINERAL_DETAIL_FONT_MAX,
  MINERAL_DETAIL_FONT_MIN,
  MINERAL_DETAIL_FONT_STEP,
  readStoredMineralDetailFontSize,
  writeStoredMineralDetailFontSize,
} from "@/lib/dogaltas/mineralDetailFontSize";

export function useMineralDetailFontSize() {
  const [fontSizePx, setFontSizePx] = useState(MINERAL_DETAIL_FONT_DEFAULT);

  useEffect(() => {
    setFontSizePx(readStoredMineralDetailFontSize());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampMineralDetailFontSize(next);
    setFontSizePx(clamped);
    writeStoredMineralDetailFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - MINERAL_DETAIL_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(MINERAL_DETAIL_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + MINERAL_DETAIL_FONT_STEP);
  }, [fontSizePx, persist]);

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
    canDecrease: fontSizePx > MINERAL_DETAIL_FONT_MIN,
    canIncrease: fontSizePx < MINERAL_DETAIL_FONT_MAX,
    isDefault: fontSizePx === MINERAL_DETAIL_FONT_DEFAULT,
  };
}
