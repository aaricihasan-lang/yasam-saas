import { createFontSizeStore } from "@/lib/dogaltas/createFontSizeStore";

export const DOGALTAS_MODAL_FONT_SIZE_KEY = "dogaltas-modal-font-size";
export const DOGALTAS_MODAL_FONT_DEFAULT = 18;
export const DOGALTAS_MODAL_FONT_MIN = 16;
export const DOGALTAS_MODAL_FONT_MAX = 24;
export const DOGALTAS_MODAL_FONT_STEP = 1;
export const DOGALTAS_MODAL_LINE_HEIGHT = 1.8;

export const dogaltasModalFontStore = createFontSizeStore({
  storageKey: DOGALTAS_MODAL_FONT_SIZE_KEY,
  defaultPx: DOGALTAS_MODAL_FONT_DEFAULT,
  minPx: DOGALTAS_MODAL_FONT_MIN,
  maxPx: DOGALTAS_MODAL_FONT_MAX,
  stepPx: DOGALTAS_MODAL_FONT_STEP,
  lineHeight: DOGALTAS_MODAL_LINE_HEIGHT,
});

export function clampDogaltasModalFontSize(px: number): number {
  return dogaltasModalFontStore.clamp(px);
}

export function readStoredDogaltasModalFontSize(): number {
  return dogaltasModalFontStore.read();
}

export function writeStoredDogaltasModalFontSize(px: number): void {
  dogaltasModalFontStore.write(px);
}
