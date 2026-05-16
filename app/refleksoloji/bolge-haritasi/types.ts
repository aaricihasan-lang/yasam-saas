export type FootSide = "left" | "right";

export type FootView = "taban" | "yan";

export type RegionShapeType = "oval" | "rect" | "free_draw";

/** Toolbar çizim tipi (oval / kare / manuel) */
export type RegionDrawShape = "oval" | "rect" | "free_draw";

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
  color?: string;
};
