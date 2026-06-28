import type { CSSProperties } from "react";
import { createFontSizeStore } from "@/lib/dogaltas/createFontSizeStore";

export const MINERAL_DETAIL_FONT_SIZE_KEY = "mineral-detail-font-size";
export const MINERAL_DETAIL_FONT_DEFAULT = 17;
export const MINERAL_DETAIL_FONT_MIN = 15;
export const MINERAL_DETAIL_FONT_MAX = 23;
export const MINERAL_DETAIL_FONT_STEP = 1;
export const MINERAL_DETAIL_LINE_HEIGHT = 1.75;

export const mineralDetailFontStore = createFontSizeStore({
  storageKey: MINERAL_DETAIL_FONT_SIZE_KEY,
  defaultPx: MINERAL_DETAIL_FONT_DEFAULT,
  minPx: MINERAL_DETAIL_FONT_MIN,
  maxPx: MINERAL_DETAIL_FONT_MAX,
  stepPx: MINERAL_DETAIL_FONT_STEP,
  lineHeight: MINERAL_DETAIL_LINE_HEIGHT,
});

export type MineralContentTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampMineralDetailFontSize(px: number): number {
  return mineralDetailFontStore.clamp(px);
}

export function readStoredMineralDetailFontSize(): number {
  return mineralDetailFontStore.read();
}

export function writeStoredMineralDetailFontSize(px: number): void {
  mineralDetailFontStore.write(px);
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
