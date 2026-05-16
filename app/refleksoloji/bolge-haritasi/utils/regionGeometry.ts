import type { Region, RegionPoint, RegionShapeType } from "../types";

/** 0..1 aralığına sıkıştır */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export const MIN_REGION_RX = 0.012;
export const MIN_REGION_RY = 0.012;

/** Minimum sürükleme boyutu (normalize) — altında çizim oluşturulmaz */
export const MIN_DRAG_SIZE = 0.018;

export { DEFAULT_REGION_COLOR } from "./regionStyles";

export function regionHasBox(region: Region): region is Region & {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  return (
    (region.shape === "oval" || region.shape === "rect") &&
    region.cx != null &&
    region.cy != null &&
    region.rx != null &&
    region.ry != null
  );
}

/** CSS yüzde kutusu (görsel overlay kutusu içinde). */
export function regionToPercentBox(region: Region): {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string | undefined;
} | null {
  if (!regionHasBox(region)) return null;

  const left = (region.cx - region.rx) * 100;
  const top = (region.cy - region.ry) * 100;
  const width = region.rx * 2 * 100;
  const height = region.ry * 2 * 100;
  const angle = region.angle ?? 0;

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    transform: angle !== 0 ? `rotate(${angle}deg)` : undefined,
  };
}

export function boxFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  shape: Extract<RegionShapeType, "oval" | "rect">,
): Pick<Region, "shape" | "cx" | "cy" | "rx" | "ry" | "angle"> | null {
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < MIN_DRAG_SIZE && h < MIN_DRAG_SIZE) return null;

  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  const rx = Math.max(w / 2, MIN_REGION_RX);
  const ry = Math.max(h / 2, MIN_REGION_RY);

  return { shape, cx: clamp01(cx), cy: clamp01(cy), rx, ry, angle: 0 };
}

export function getPointsBounds(points: RegionPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 0.01;
  return {
    minX: clamp01(minX - pad),
    minY: clamp01(minY - pad),
    maxX: clamp01(maxX + pad),
    maxY: clamp01(maxY + pad),
  };
}
