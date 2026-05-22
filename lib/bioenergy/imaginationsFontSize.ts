import type { CSSProperties } from "react";

export const IMAGINATIONS_FONT_SIZE_KEY = "bioenergy-imaginations-font-size";
export const IMAGINATIONS_FONT_DEFAULT = 19;
export const IMAGINATIONS_FONT_MIN = 16;
export const IMAGINATIONS_FONT_MAX = 25;
export const IMAGINATIONS_FONT_STEP = 1;
export const IMAGINATIONS_LINE_HEIGHT = 1.9;
export const IMAGINATIONS_FONT_MOBILE_MIN = 17;

export type ImaginationsTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampImaginationsFontSize(px: number): number {
  return Math.min(IMAGINATIONS_FONT_MAX, Math.max(IMAGINATIONS_FONT_MIN, Math.round(px)));
}

export function readStoredImaginationsFontSize(): number {
  if (typeof window === "undefined") return IMAGINATIONS_FONT_DEFAULT;
  const raw = localStorage.getItem(IMAGINATIONS_FONT_SIZE_KEY);
  if (!raw) return IMAGINATIONS_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampImaginationsFontSize(parsed)
    : IMAGINATIONS_FONT_DEFAULT;
}

export function writeStoredImaginationsFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    IMAGINATIONS_FONT_SIZE_KEY,
    String(clampImaginationsFontSize(px)),
  );
}

export function imaginationsTypography(fontSizePx: number): ImaginationsTypography {
  const size = clampImaginationsFontSize(fontSizePx);
  const lineHeight = IMAGINATIONS_LINE_HEIGHT;
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
