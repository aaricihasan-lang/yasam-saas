"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampDogaltasFontSize,
  dogaltasContentTypography,
  DOGALTAS_DETAIL_FONT_DEFAULT,
  DOGALTAS_DETAIL_FONT_MAX,
  DOGALTAS_DETAIL_FONT_MIN,
  DOGALTAS_DETAIL_FONT_STEP,
  readStoredDogaltasFontSize,
  writeStoredDogaltasFontSize,
} from "@/lib/dogaltas/dogaltasDetailFontSize";

export function useDogaltasDetailFontSize() {
  const [fontSizePx, setFontSizePx] = useState(DOGALTAS_DETAIL_FONT_DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFontSizePx(readStoredDogaltasFontSize());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampDogaltasFontSize(next);
    setFontSizePx(clamped);
    writeStoredDogaltasFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - DOGALTAS_DETAIL_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(DOGALTAS_DETAIL_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + DOGALTAS_DETAIL_FONT_STEP);
  }, [fontSizePx, persist]);

  const typography = useMemo(
    () => dogaltasContentTypography(fontSizePx),
    [fontSizePx],
  );

  return {
    fontSizePx,
    hydrated,
    typography,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > DOGALTAS_DETAIL_FONT_MIN,
    canIncrease: fontSizePx < DOGALTAS_DETAIL_FONT_MAX,
    isDefault: fontSizePx === DOGALTAS_DETAIL_FONT_DEFAULT,
  };
}
