"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampEnergyBodiesFontSize,
  energyBodiesTypography,
  ENERGY_BODIES_FONT_DEFAULT,
  ENERGY_BODIES_FONT_MAX,
  ENERGY_BODIES_FONT_MIN,
  ENERGY_BODIES_FONT_STEP,
  readStoredEnergyBodiesFontSize,
  writeStoredEnergyBodiesFontSize,
} from "@/lib/bioenergy/energyBodiesFontSize";

export function useEnergyBodiesFontSize() {
  const [fontSizePx, setFontSizePx] = useState(ENERGY_BODIES_FONT_DEFAULT);

  useEffect(() => {
    setFontSizePx(readStoredEnergyBodiesFontSize());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = clampEnergyBodiesFontSize(next);
    setFontSizePx(clamped);
    writeStoredEnergyBodiesFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    persist(fontSizePx - ENERGY_BODIES_FONT_STEP);
  }, [fontSizePx, persist]);

  const reset = useCallback(() => {
    persist(ENERGY_BODIES_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    persist(fontSizePx + ENERGY_BODIES_FONT_STEP);
  }, [fontSizePx, persist]);

  const typography = useMemo(
    () => energyBodiesTypography(fontSizePx),
    [fontSizePx],
  );

  return {
    fontSizePx,
    typography,
    decrease,
    reset,
    increase,
    canDecrease: fontSizePx > ENERGY_BODIES_FONT_MIN,
    canIncrease: fontSizePx < ENERGY_BODIES_FONT_MAX,
    isDefault: fontSizePx === ENERGY_BODIES_FONT_DEFAULT,
  };
}
