"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampImaginationsFontSize,
  imaginationsTypography,
  IMAGINATIONS_FONT_DEFAULT,
  IMAGINATIONS_FONT_MAX,
  IMAGINATIONS_FONT_MIN,
  IMAGINATIONS_FONT_STEP,
  readStoredImaginationsFontSize,
  writeStoredImaginationsFontSize,
} from "@/lib/bioenergy/imaginationsFontSize";

export function useImaginationsFontSize() {
  const [fontSizePx, setFontSizePx] = useState(IMAGINATIONS_FONT_DEFAULT);

  useEffect(() => {
    setFontSizePx(readStoredImaginationsFontSize());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampImaginationsFontSize(next);
    setFontSizePx(clamped);
    writeStoredImaginationsFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - IMAGINATIONS_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(IMAGINATIONS_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + IMAGINATIONS_FONT_STEP);
  }, [fontSizePx, persist]);

  const typography = useMemo(() => imaginationsTypography(fontSizePx), [fontSizePx]);

  return {
    fontSizePx,
    typography,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > IMAGINATIONS_FONT_MIN,
    canIncrease: fontSizePx < IMAGINATIONS_FONT_MAX,
    isDefault: fontSizePx === IMAGINATIONS_FONT_DEFAULT,
  };
}
