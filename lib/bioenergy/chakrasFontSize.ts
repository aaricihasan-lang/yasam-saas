import type { CSSProperties } from "react";

export const CHAKRAS_FONT_SIZE_KEY = "bioenergy-chakras-font-size";
export const CHAKRAS_FONT_DEFAULT = 19;
export const CHAKRAS_FONT_MIN = 16;
export const CHAKRAS_FONT_MAX = 25;
export const CHAKRAS_FONT_STEP = 1;
export const CHAKRAS_LINE_HEIGHT = 1.9;
export const CHAKRAS_FONT_MOBILE_MIN = 17;

export type ChakrasTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampChakrasFontSize(px: number): number {
  return Math.min(CHAKRAS_FONT_MAX, Math.max(CHAKRAS_FONT_MIN, Math.round(px)));
}

export function readStoredChakrasFontSize(): number {
  if (typeof window === "undefined") return CHAKRAS_FONT_DEFAULT;
  const raw = localStorage.getItem(CHAKRAS_FONT_SIZE_KEY);
  if (!raw) return CHAKRAS_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampChakrasFontSize(parsed) : CHAKRAS_FONT_DEFAULT;
}

export function writeStoredChakrasFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAKRAS_FONT_SIZE_KEY, String(clampChakrasFontSize(px)));
}

export function chakrasTypography(fontSizePx: number): ChakrasTypography {
  const size = clampChakrasFontSize(fontSizePx);
  const lineHeight = CHAKRAS_LINE_HEIGHT;
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
