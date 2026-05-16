import type { Region, RegionShapeType } from "../types";

/** 0..1 aralığına sıkıştır */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export const MIN_REGION_RX = 0.012;
export const MIN_REGION_RY = 0.012;

export const DEFAULT_REGION_COLOR = "rgba(196, 181, 253, 0.55)";

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
  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  const rx = Math.max(Math.abs(end.x - start.x) / 2, MIN_REGION_RX);
  const ry = Math.max(Math.abs(end.y - start.y) / 2, MIN_REGION_RY);

  if (rx < MIN_REGION_RX && ry < MIN_REGION_RY) return null;

  return { shape, cx: clamp01(cx), cy: clamp01(cy), rx, ry, angle: 0 };
}
