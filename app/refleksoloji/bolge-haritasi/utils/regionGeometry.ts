import type { Region, RegionShape } from "../types";

/** 0..1 aralığına sıkıştır */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Eski % kutusu (sol-üst x,y + genişlik/yükseklik, 0..100) → normalize merkez modeli */
export function regionFromLegacyPercentBox(
  base: Omit<Region, "shape" | "cx" | "cy" | "rx" | "ry" | "angle"> & {
    x: number;
    y: number;
    width: number;
    height: number;
    shape?: RegionShape;
  },
): Region {
  const x = base.x / 100;
  const y = base.y / 100;
  const w = base.width / 100;
  const h = base.height / 100;

  return {
    id: base.id,
    organ: base.organ,
    footSide: base.footSide,
    view: base.view,
    shape: base.shape ?? "oval",
    cx: clamp01(x + w / 2),
    cy: clamp01(y + h / 2),
    rx: clamp01(w / 2),
    ry: clamp01(h / 2),
    angle: 0,
    color: base.color,
  };
}

/** CSS yüzde kutusu: left/top/width/height + isteğe bağlı rotate */
export function regionToPercentBox(region: Region): {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string | undefined;
} {
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

export const DEFAULT_NEW_REGION_RX = 0.06;
export const DEFAULT_NEW_REGION_RY = 0.04;
