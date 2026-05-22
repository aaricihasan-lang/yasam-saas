import type { CSSProperties } from "react";

export const DOGALTAS_DETAIL_FONT_SIZE_KEY = "dogaltas-detail-font-size";
export const DOGALTAS_DETAIL_FONT_DEFAULT = 17;
export const DOGALTAS_DETAIL_FONT_MIN = 15;
export const DOGALTAS_DETAIL_FONT_MAX = 23;
export const DOGALTAS_DETAIL_FONT_STEP = 1;

export type DogaltasContentTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampDogaltasFontSize(px: number): number {
  return Math.min(
    DOGALTAS_DETAIL_FONT_MAX,
    Math.max(DOGALTAS_DETAIL_FONT_MIN, Math.round(px)),
  );
}

export function readStoredDogaltasFontSize(): number {
  if (typeof window === "undefined") return DOGALTAS_DETAIL_FONT_DEFAULT;
  const raw = localStorage.getItem(DOGALTAS_DETAIL_FONT_SIZE_KEY);
  if (!raw) return DOGALTAS_DETAIL_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampDogaltasFontSize(parsed)
    : DOGALTAS_DETAIL_FONT_DEFAULT;
}

export function writeStoredDogaltasFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    DOGALTAS_DETAIL_FONT_SIZE_KEY,
    String(clampDogaltasFontSize(px)),
  );
}

export function dogaltasContentLineHeight(fontSizePx: number): number {
  if (fontSizePx <= 15) return 1.68;
  if (fontSizePx >= 21) return 1.78;
  return 1.72;
}

export function dogaltasContentTypography(
  fontSizePx: number,
): DogaltasContentTypography {
  const size = clampDogaltasFontSize(fontSizePx);
  const lineHeight = dogaltasContentLineHeight(size);
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
