import type { CSSProperties } from "react";

export const ENERGY_BODIES_FONT_SIZE_KEY = "bioenergy-energy-bodies-font-size";
export const ENERGY_BODIES_FONT_DEFAULT = 18;
export const ENERGY_BODIES_FONT_MIN = 16;
export const ENERGY_BODIES_FONT_MAX = 24;
export const ENERGY_BODIES_FONT_STEP = 1;
export const ENERGY_BODIES_LINE_HEIGHT = 1.75;

export type EnergyBodiesTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampEnergyBodiesFontSize(px: number): number {
  return Math.min(
    ENERGY_BODIES_FONT_MAX,
    Math.max(ENERGY_BODIES_FONT_MIN, Math.round(px)),
  );
}

export function readStoredEnergyBodiesFontSize(): number {
  if (typeof window === "undefined") return ENERGY_BODIES_FONT_DEFAULT;
  const raw = localStorage.getItem(ENERGY_BODIES_FONT_SIZE_KEY);
  if (!raw) return ENERGY_BODIES_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampEnergyBodiesFontSize(parsed)
    : ENERGY_BODIES_FONT_DEFAULT;
}

export function writeStoredEnergyBodiesFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    ENERGY_BODIES_FONT_SIZE_KEY,
    String(clampEnergyBodiesFontSize(px)),
  );
}

export function energyBodiesTypography(fontSizePx: number): EnergyBodiesTypography {
  const size = clampEnergyBodiesFontSize(fontSizePx);
  const lineHeight = ENERGY_BODIES_LINE_HEIGHT;
  return {
    fontSizePx: size,
    lineHeight,
    bodyStyle: {
      fontSize: `${size}px`,
      lineHeight,
      letterSpacing: "0.01em",
    },
  };
}
