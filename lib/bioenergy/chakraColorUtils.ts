export function hexToRgba(hex: string, alpha: number): string | null {
  const h = hex.trim();
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(h)) return null;
  let r: number;
  let g: number;
  let b: number;
  if (h.length === 4) {
    r = parseInt(h[1] + h[1], 16);
    g = parseInt(h[2] + h[2], 16);
    b = parseInt(h[3] + h[3], 16);
  } else {
    r = parseInt(h.slice(1, 3), 16);
    g = parseInt(h.slice(3, 5), 16);
    b = parseInt(h.slice(5, 7), 16);
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function chakraColorDot(color: string | null | undefined): string {
  return hexToRgba(color ?? "", 1) ?? "rgb(192, 38, 211)";
}
