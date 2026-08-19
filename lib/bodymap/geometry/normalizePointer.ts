import type { ContainRect } from "./containRect";
import { clamp01 } from "./markGeometry";

export type NormalizedPoint = { x: number; y: number };

/**
 * İstemci koordinatını görsel alanı içinde 0..1 normalize noktaya çevirir.
 * Refleksoloji `pointerToImageNormalized` eşleniği — alan-bağımsız.
 */
export function pointerToImageNormalized(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  imageRect: ContainRect,
  options?: { clamp?: boolean },
): NormalizedPoint | null {
  if (imageRect.width <= 0 || imageRect.height <= 0) return null;

  const localX = clientX - containerRect.left - imageRect.left;
  const localY = clientY - containerRect.top - imageRect.top;

  const nx = localX / imageRect.width;
  const ny = localY / imageRect.height;

  if (options?.clamp) {
    return { x: clamp01(nx), y: clamp01(ny) };
  }

  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  return { x: nx, y: ny };
}
