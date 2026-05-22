import type { CSSProperties } from "react";

export const SUBCONSCIOUS_CAUSES_FONT_SIZE_KEY = "subconscious-causes-font-size";
export const SUBCONSCIOUS_CAUSES_FONT_DEFAULT = 18;
export const SUBCONSCIOUS_CAUSES_FONT_MIN = 16;
export const SUBCONSCIOUS_CAUSES_FONT_MAX = 24;
export const SUBCONSCIOUS_CAUSES_FONT_STEP = 1;
export const SUBCONSCIOUS_CAUSES_LINE_HEIGHT = 1.75;

export type SubconsciousCausesTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampSubconsciousCausesFontSize(px: number): number {
  return Math.min(
    SUBCONSCIOUS_CAUSES_FONT_MAX,
    Math.max(SUBCONSCIOUS_CAUSES_FONT_MIN, Math.round(px)),
  );
}

export function readStoredSubconsciousCausesFontSize(): number {
  if (typeof window === "undefined") return SUBCONSCIOUS_CAUSES_FONT_DEFAULT;
  const raw = localStorage.getItem(SUBCONSCIOUS_CAUSES_FONT_SIZE_KEY);
  if (!raw) return SUBCONSCIOUS_CAUSES_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampSubconsciousCausesFontSize(parsed)
    : SUBCONSCIOUS_CAUSES_FONT_DEFAULT;
}

export function writeStoredSubconsciousCausesFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SUBCONSCIOUS_CAUSES_FONT_SIZE_KEY,
    String(clampSubconsciousCausesFontSize(px)),
  );
}

export function subconsciousCausesTypography(
  fontSizePx: number,
): SubconsciousCausesTypography {
  const size = clampSubconsciousCausesFontSize(fontSizePx);
  const lineHeight = SUBCONSCIOUS_CAUSES_LINE_HEIGHT;
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
