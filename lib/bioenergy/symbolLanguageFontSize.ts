import type { CSSProperties } from "react";

export const SYMBOL_LANGUAGE_FONT_SIZE_KEY = "bioenergy-symbol-language-font-size";
export const SYMBOL_LANGUAGE_FONT_DEFAULT = 19;
export const SYMBOL_LANGUAGE_FONT_MIN = 16;
export const SYMBOL_LANGUAGE_FONT_MAX = 25;
export const SYMBOL_LANGUAGE_FONT_STEP = 1;
export const SYMBOL_LANGUAGE_LINE_HEIGHT = 1.9;
export const SYMBOL_LANGUAGE_FONT_MOBILE_MIN = 17;

export type SymbolLanguageTypography = {
  fontSizePx: number;
  lineHeight: number;
  bodyStyle: CSSProperties;
};

export function clampSymbolLanguageFontSize(px: number): number {
  return Math.min(SYMBOL_LANGUAGE_FONT_MAX, Math.max(SYMBOL_LANGUAGE_FONT_MIN, Math.round(px)));
}

export function readStoredSymbolLanguageFontSize(): number {
  if (typeof window === "undefined") return SYMBOL_LANGUAGE_FONT_DEFAULT;
  const raw = localStorage.getItem(SYMBOL_LANGUAGE_FONT_SIZE_KEY);
  if (!raw) return SYMBOL_LANGUAGE_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampSymbolLanguageFontSize(parsed)
    : SYMBOL_LANGUAGE_FONT_DEFAULT;
}

export function writeStoredSymbolLanguageFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SYMBOL_LANGUAGE_FONT_SIZE_KEY,
    String(clampSymbolLanguageFontSize(px)),
  );
}

export function symbolLanguageTypography(fontSizePx: number): SymbolLanguageTypography {
  const size = clampSymbolLanguageFontSize(fontSizePx);
  const lineHeight = SYMBOL_LANGUAGE_LINE_HEIGHT;
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
