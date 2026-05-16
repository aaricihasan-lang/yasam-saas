export type FootSide = "left" | "right";

export type FootView = "taban" | "yan";

export type RegionShapeType = "oval";

export type RegionToolMode = "select" | "add" | "move";

export type Region = {
  id: string;
  organ: string;
  footSide: FootSide;
  view: FootView;
  x: number;
  y: number;
  width: number;
  height: number;
  shapeType: RegionShapeType;
  color: string;
};
