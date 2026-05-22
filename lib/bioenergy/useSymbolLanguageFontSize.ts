"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampSymbolLanguageFontSize,
  symbolLanguageTypography,
  SYMBOL_LANGUAGE_FONT_DEFAULT,
  SYMBOL_LANGUAGE_FONT_MAX,
  SYMBOL_LANGUAGE_FONT_MIN,
  SYMBOL_LANGUAGE_FONT_STEP,
  readStoredSymbolLanguageFontSize,
  writeStoredSymbolLanguageFontSize,
} from "@/lib/bioenergy/symbolLanguageFontSize";

export function useSymbolLanguageFontSize() {
  const [fontSizePx, setFontSizePx] = useState(SYMBOL_LANGUAGE_FONT_DEFAULT);

  useEffect(() => {
    setFontSizePx(readStoredSymbolLanguageFontSize());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampSymbolLanguageFontSize(next);
    setFontSizePx(clamped);
    writeStoredSymbolLanguageFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - SYMBOL_LANGUAGE_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(SYMBOL_LANGUAGE_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + SYMBOL_LANGUAGE_FONT_STEP);
  }, [fontSizePx, persist]);

  const typography = useMemo(() => symbolLanguageTypography(fontSizePx), [fontSizePx]);

  return {
    fontSizePx,
    typography,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > SYMBOL_LANGUAGE_FONT_MIN,
    canIncrease: fontSizePx < SYMBOL_LANGUAGE_FONT_MAX,
    isDefault: fontSizePx === SYMBOL_LANGUAGE_FONT_DEFAULT,
  };
}
