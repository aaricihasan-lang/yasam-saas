export type ContainRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * object-contain ile yerleşen içerik kutusu (piksel, konteyner içi).
 * Refleksoloji `imageContainRect` ile aynı matematik — alan-bağımsız.
 */
export function computeObjectContainRect(
  containerW: number,
  containerH: number,
  contentW: number,
  contentH: number,
): ContainRect {
  if (containerW <= 0 || containerH <= 0 || contentW <= 0 || contentH <= 0) {
    return { left: 0, top: 0, width: Math.max(containerW, 0), height: Math.max(containerH, 0) };
  }

  const scale = Math.min(containerW / contentW, containerH / contentH);
  const width = contentW * scale;
  const height = contentH * scale;

  return {
    left: (containerW - width) / 2,
    top: (containerH - height) / 2,
    width,
    height,
  };
}
