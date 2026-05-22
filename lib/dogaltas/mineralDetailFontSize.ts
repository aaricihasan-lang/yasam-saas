import type { CSSProperties } from "react";

export const MINERAL_DETAIL_FONT_SIZE_KEY = "mineral-detail-font-size";
export const MINERAL_DETAIL_FONT_DEFAULT = 17;
export const MINERAL_DETAIL_FONT_MIN = 15;
export const MINERAL_DETAIL_FONT_MAX = 23;
export const MINERAL_DETAIL_FONT_STEP = 1;
export const MINERAL_DETAIL_LINE_HEIGHT = 1.75;

export type MineralContentTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampMineralDetailFontSize(px: number): number {
  return Math.min(
    MINERAL_DETAIL_FONT_MAX,
    Math.max(MINERAL_DETAIL_FONT_MIN, Math.round(px)),
  );
}

export function readStoredMineralDetailFontSize(): number {
  if (typeof window === "undefined") return MINERAL_DETAIL_FONT_DEFAULT;
  const raw = localStorage.getItem(MINERAL_DETAIL_FONT_SIZE_KEY);
  if (!raw) return MINERAL_DETAIL_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampMineralDetailFontSize(parsed)
    : MINERAL_DETAIL_FONT_DEFAULT;
}

export function writeStoredMineralDetailFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    MINERAL_DETAIL_FONT_SIZE_KEY,
    String(clampMineralDetailFontSize(px)),
  );
}

export function mineralContentTypography(
  fontSizePx: number,
): MineralContentTypography {
  const size = clampMineralDetailFontSize(fontSizePx);
  const lineHeight = MINERAL_DETAIL_LINE_HEIGHT;
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
