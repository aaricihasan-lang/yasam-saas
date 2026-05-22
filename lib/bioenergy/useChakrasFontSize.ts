"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CHAKRAS_FONT_DEFAULT,
  CHAKRAS_FONT_MAX,
  CHAKRAS_FONT_MIN,
  CHAKRAS_FONT_STEP,
  chakrasTypography,
  readStoredChakrasFontSize,
  writeStoredChakrasFontSize,
  clampChakrasFontSize,
} from "@/lib/bioenergy/chakrasFontSize";

export function useChakrasFontSize() {
  const [fontSizePx, setFontSizePx] = useState(CHAKRAS_FONT_DEFAULT);

  useEffect(() => {
    setFontSizePx(readStoredChakrasFontSize());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampChakrasFontSize(next);
    setFontSizePx(clamped);
    writeStoredChakrasFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - CHAKRAS_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(CHAKRAS_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + CHAKRAS_FONT_STEP);
  }, [fontSizePx, persist]);

  const typography = useMemo(() => chakrasTypography(fontSizePx), [fontSizePx]);

  return {
    fontSizePx,
    typography,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > CHAKRAS_FONT_MIN,
    canIncrease: fontSizePx < CHAKRAS_FONT_MAX,
    isDefault: fontSizePx === CHAKRAS_FONT_DEFAULT,
  };
}
