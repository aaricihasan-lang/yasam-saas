/**
 * GENERIC BODY-MAP MOTORU — public API.
 *
 * Alan-bağımsız işaretleme/nokta motoru. Refleksoloji `bolge-haritasi` motorundan
 * TÜRETİLMİŞTİR (kopya + genelleştirme); refleksoloji dosyaları değişmez. Kupa & Hacamat
 * modülü bu motoru kullanır. point ≠ placement (bkz. types.ts).
 */
export type { BodyMark, MarkGeometry, MarkShape, MarkToolMode, NormalizedPoint } from "./types";
export { BodyMapCanvas, type BodyMapCanvasProps } from "./components/BodyMapCanvas";
export {
  MarkShape as MarkShapeView,
  MarkDraftPreview,
  DEFAULT_MARK_COLORS,
  type MarkColors,
} from "./components/MarkShape";
export { MarkHandles } from "./components/MarkHandles";
export { computeObjectContainRect, type ContainRect } from "./geometry/containRect";
export { pointerToImageNormalized } from "./geometry/normalizePointer";
export {
  clamp01,
  boxFromDrag,
  markToPercentBox,
  MIN_MARK_RX,
  MIN_MARK_RY,
  MIN_DRAG_SIZE,
  DEFAULT_POINT_RX,
  DEFAULT_POINT_RY,
} from "./geometry/markGeometry";
export {
  worldToLocal,
  localToWorld,
  resizeMarkByHandle,
  rotateMarkByPointer,
  moveMarkByDelta,
  type ResizeHandle,
} from "./geometry/markTransform";
