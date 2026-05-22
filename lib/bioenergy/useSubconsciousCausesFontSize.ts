"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampSubconsciousCausesFontSize,
  subconsciousCausesTypography,
  SUBCONSCIOUS_CAUSES_FONT_DEFAULT,
  SUBCONSCIOUS_CAUSES_FONT_MAX,
  SUBCONSCIOUS_CAUSES_FONT_MIN,
  SUBCONSCIOUS_CAUSES_FONT_STEP,
  readStoredSubconsciousCausesFontSize,
  writeStoredSubconsciousCausesFontSize,
} from "@/lib/bioenergy/subconsciousCausesFontSize";

export function useSubconsciousCausesFontSize() {
  const [fontSizePx, setFontSizePx] = useState(SUBCONSCIOUS_CAUSES_FONT_DEFAULT);

  useEffect(() => {
    setFontSizePx(readStoredSubconsciousCausesFontSize());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampSubconsciousCausesFontSize(next);
    setFontSizePx(clamped);
    writeStoredSubconsciousCausesFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - SUBCONSCIOUS_CAUSES_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(SUBCONSCIOUS_CAUSES_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + SUBCONSCIOUS_CAUSES_FONT_STEP);
  }, [fontSizePx, persist]);

  const typography = useMemo(
    () => subconsciousCausesTypography(fontSizePx),
    [fontSizePx],
  );

  return {
    fontSizePx,
    typography,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > SUBCONSCIOUS_CAUSES_FONT_MIN,
    canIncrease: fontSizePx < SUBCONSCIOUS_CAUSES_FONT_MAX,
    isDefault: fontSizePx === SUBCONSCIOUS_CAUSES_FONT_DEFAULT,
  };
}
