export const DOGALTAS_MODAL_FONT_SIZE_KEY = "dogaltas-modal-font-size";
export const DOGALTAS_MODAL_FONT_DEFAULT = 18;
export const DOGALTAS_MODAL_FONT_MIN = 16;
export const DOGALTAS_MODAL_FONT_MAX = 24;
export const DOGALTAS_MODAL_FONT_STEP = 1;
export const DOGALTAS_MODAL_LINE_HEIGHT = 1.8;

export function clampDogaltasModalFontSize(px: number): number {
  return Math.min(
    DOGALTAS_MODAL_FONT_MAX,
    Math.max(DOGALTAS_MODAL_FONT_MIN, Math.round(px)),
  );
}

export function readStoredDogaltasModalFontSize(): number {
  if (typeof window === "undefined") return DOGALTAS_MODAL_FONT_DEFAULT;
  const raw = localStorage.getItem(DOGALTAS_MODAL_FONT_SIZE_KEY);
  if (!raw) return DOGALTAS_MODAL_FONT_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? clampDogaltasModalFontSize(parsed)
    : DOGALTAS_MODAL_FONT_DEFAULT;
}

export function writeStoredDogaltasModalFontSize(px: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    DOGALTAS_MODAL_FONT_SIZE_KEY,
    String(clampDogaltasModalFontSize(px)),
  );
}
