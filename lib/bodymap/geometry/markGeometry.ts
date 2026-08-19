import type { BodyMark, MarkGeometry, MarkShape } from "../types";

/** 0..1 aralığına sıkıştır */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export const MIN_MARK_RX = 0.012;
export const MIN_MARK_RY = 0.012;

/** Minimum sürükleme boyutu (normalize) — altında yeni işaret oluşturulmaz */
export const MIN_DRAG_SIZE = 0.012;

/** Tıklama ile bırakılan varsayılan nokta yarıçapı (normalize). */
export const DEFAULT_POINT_RX = 0.02;
export const DEFAULT_POINT_RY = 0.02;

/** CSS yüzde kutusu (görsel overlay kutusu içinde). Refleksoloji regionToPercentBox eşleniği. */
export function markToPercentBox(mark: BodyMark): {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string | undefined;
} {
  const left = (mark.cx - mark.rx) * 100;
  const top = (mark.cy - mark.ry) * 100;
  const width = mark.rx * 2 * 100;
  const height = mark.ry * 2 * 100;
  const angle = mark.angle ?? 0;

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    transform: angle !== 0 ? `rotate(${angle}deg)` : undefined,
  };
}

/** Sürüklemeden kutu geometrisi (çok küçükse varsayılan nokta boyutuna genişler). */
export function boxFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  shape: MarkShape,
): MarkGeometry {
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  // Küçük sürükleme/tıklama → varsayılan nokta işareti.
  if (w < MIN_DRAG_SIZE && h < MIN_DRAG_SIZE) {
    return {
      shape,
      cx: clamp01(end.x),
      cy: clamp01(end.y),
      rx: DEFAULT_POINT_RX,
      ry: DEFAULT_POINT_RY,
      angle: 0,
    };
  }

  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  const rx = Math.max(w / 2, MIN_MARK_RX);
  const ry = Math.max(h / 2, MIN_MARK_RY);

  return { shape, cx: clamp01(cx), cy: clamp01(cy), rx, ry, angle: 0 };
}
