import type { BodyMark } from "../types";
import { clamp01, MIN_MARK_RX, MIN_MARK_RY } from "./markGeometry";

/**
 * Rotation-aware resize + rotate — Refleksoloji `regionTransform` eşleniği (alan-bağımsız).
 * BodyMark box geometrisi (cx/cy/rx/ry/angle) üzerinde çalışır.
 */

export type ResizeHandle = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Dünya (normalize) noktasını işaret merkezine göre yerel eksene çevir */
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

function clampBox(mark: BodyMark): BodyMark {
  let { cx, cy, rx, ry } = mark;
  rx = Math.max(MIN_MARK_RX, Math.min(rx, 0.5));
  ry = Math.max(MIN_MARK_RY, Math.min(ry, 0.5));
  cx = clamp01(Math.max(rx, Math.min(1 - rx, cx)));
  cy = clamp01(Math.max(ry, Math.min(1 - ry, cy)));
  return { ...mark, cx, cy, rx, ry };
}

export function resizeMarkByHandle(
  snapshot: BodyMark,
  handle: ResizeHandle,
  pointer: { x: number; y: number },
): BodyMark {
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
      left = Math.min(lx, right - MIN_MARK_RX * 2);
      break;
    case "r":
      right = Math.max(lx, left + MIN_MARK_RX * 2);
      break;
    case "t":
      top = Math.min(ly, bottom - MIN_MARK_RY * 2);
      break;
    case "b":
      bottom = Math.max(ly, top + MIN_MARK_RY * 2);
      break;
    case "tl":
      left = Math.min(lx, right - MIN_MARK_RX * 2);
      top = Math.min(ly, bottom - MIN_MARK_RY * 2);
      break;
    case "tr":
      right = Math.max(lx, left + MIN_MARK_RX * 2);
      top = Math.min(ly, bottom - MIN_MARK_RY * 2);
      break;
    case "bl":
      left = Math.min(lx, right - MIN_MARK_RX * 2);
      bottom = Math.max(ly, top + MIN_MARK_RY * 2);
      break;
    case "br":
      right = Math.max(lx, left + MIN_MARK_RX * 2);
      bottom = Math.max(ly, top + MIN_MARK_RY * 2);
      break;
    default:
      break;
  }

  const newRx = Math.max((right - left) / 2, MIN_MARK_RX);
  const newRy = Math.max((bottom - top) / 2, MIN_MARK_RY);
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

export function rotateMarkByPointer(snapshot: BodyMark, pointer: { x: number; y: number }): BodyMark {
  const dx = pointer.x - snapshot.cx;
  const dy = pointer.y - snapshot.cy;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return { ...snapshot, angle };
}

/** İşareti verilen normalize deltaya göre taşı (sınır içinde kalır). */
export function moveMarkByDelta(snapshot: BodyMark, dx: number, dy: number): BodyMark {
  return clampBox({ ...snapshot, cx: snapshot.cx + dx, cy: snapshot.cy + dy });
}
