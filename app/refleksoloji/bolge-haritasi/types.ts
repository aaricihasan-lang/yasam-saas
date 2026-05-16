export type FootSide = "left" | "right";

export type FootView = "taban" | "yan";

export type RegionShapeType = "oval" | "rect" | "free_draw" | "thick_line";

/** Toolbar çizim tipi */
export type RegionDrawShape = "oval" | "rect" | "free_draw" | "thick_line";

export type RegionToolMode = "select" | "add" | "move";

export type RegionPoint = { x: number; y: number };

/** Normalize koordinatlar (0..1) — görsel alanına göre. Masaüstü RegionN ile uyumlu. */
export type Region = {
  id: string;
  organ: string;
  footSide: FootSide;
  view: FootView;
  shape: RegionShapeType;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  angle?: number;
  points?: RegionPoint[];
  /** Kalın çizgi — normalize 0..1 */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
  color?: string;
};

export const DEFAULT_THICK_LINE_WIDTH = 0.018;
