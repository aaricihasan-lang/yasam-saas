export type FootSide = "left" | "right";

export type FootView = "taban" | "yan";

export type RegionShape = "oval" | "rect";

export type RegionToolMode = "select" | "add" | "move";

/** Normalize merkez tabanlı bölge (0..1). Masaüstü RegionN ile uyumlu. */
export type Region = {
  id: string;
  organ: string;
  footSide: FootSide;
  view: FootView;
  shape: RegionShape;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  color: string;
};
