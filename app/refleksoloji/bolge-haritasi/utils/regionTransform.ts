import type { Region } from "../types";
import { clamp01, MIN_REGION_RX, MIN_REGION_RY, regionHasBox } from "./regionGeometry";

export type ResizeHandle =
  | "tl"
  | "t"
  | "tr"
  | "r"
  | "br"
  | "b"
  | "bl"
  | "l";

type BoxRegion = Region & { cx: number; cy: number; rx: number; ry: number };

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Dünya (normalize) noktasını bölge merkezine göre yerel eksene çevir */
export function worldToLocal(
  point: { x: number; y: number },
  cx: number,
  cy: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = toRadians(-angleDeg);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad),
    y: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** Yerel ofseti dünya koordinatına */
export function localToWorld(
  local: { x: number; y: number },
  cx: number,
  cy: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = toRadians(angleDeg);
  return {
    x: cx + local.x * Math.cos(rad) - local.y * Math.sin(rad),
    y: cy + local.x * Math.sin(rad) + local.y * Math.cos(rad),
  };
}

function clampBox(region: BoxRegion): BoxRegion {
  let { cx, cy, rx, ry } = region;
  rx = Math.max(MIN_REGION_RX, Math.min(rx, 0.5));
  ry = Math.max(MIN_REGION_RY, Math.min(ry, 0.5));
  cx = clamp01(Math.max(rx, Math.min(1 - rx, cx)));
  cy = clamp01(Math.max(ry, Math.min(1 - ry, cy)));
  return { ...region, cx, cy, rx, ry };
}

export function resizeRegionByHandle(
  snapshot: BoxRegion,
  handle: ResizeHandle,
  pointer: { x: number; y: number },
): BoxRegion {
  const angle = snapshot.angle ?? 0;
  const local = worldToLocal(pointer, snapshot.cx, snapshot.cy, angle);

  let left = -snapshot.rx;
  let right = snapshot.rx;
  let top = -snapshot.ry;
  let bottom = snapshot.ry;

  const lx = local.x;
  const ly = local.y;

  switch (handle) {
    case "l":
      left = Math.min(lx, right - MIN_REGION_RX * 2);
      break;
    case "r":
      right = Math.max(lx, left + MIN_REGION_RX * 2);
      break;
    case "t":
      top = Math.min(ly, bottom - MIN_REGION_RY * 2);
      break;
    case "b":
      bottom = Math.max(ly, top + MIN_REGION_RY * 2);
      break;
    case "tl":
      left = Math.min(lx, right - MIN_REGION_RX * 2);
      top = Math.min(ly, bottom - MIN_REGION_RY * 2);
      break;
    case "tr":
      right = Math.max(lx, left + MIN_REGION_RX * 2);
      top = Math.min(ly, bottom - MIN_REGION_RY * 2);
      break;
    case "bl":
      left = Math.min(lx, right - MIN_REGION_RX * 2);
      bottom = Math.max(ly, top + MIN_REGION_RY * 2);
      break;
    case "br":
      right = Math.max(lx, left + MIN_REGION_RX * 2);
      bottom = Math.max(ly, top + MIN_REGION_RY * 2);
      break;
    default:
      break;
  }

  const newRx = Math.max((right - left) / 2, MIN_REGION_RX);
  const newRy = Math.max((bottom - top) / 2, MIN_REGION_RY);
  const offsetX = (left + right) / 2;
  const offsetY = (top + bottom) / 2;
  const worldCenter = localToWorld({ x: offsetX, y: offsetY }, snapshot.cx, snapshot.cy, angle);

  return clampBox({
    ...snapshot,
    cx: worldCenter.x,
    cy: worldCenter.y,
    rx: newRx,
    ry: newRy,
  });
}

export function rotateRegionByPointer(snapshot: BoxRegion, pointer: { x: number; y: number }): BoxRegion {
  const dx = pointer.x - snapshot.cx;
  const dy = pointer.y - snapshot.cy;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return { ...snapshot, angle };
}

export function asBoxRegion(region: Region): BoxRegion | null {
  if (!regionHasBox(region)) return null;
  return region as BoxRegion;
}
