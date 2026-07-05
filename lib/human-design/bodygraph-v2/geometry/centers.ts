// Premium BodyGraph V2 — merkez geometrisi (saf veri).
//
// 9 merkez şekil + konum + boyut. Kompakt yerleşim (viewBox 460×600, x-ekseni ~230).
// Eski layout.ts'ten BAĞIMSIZ; referans premium mockup'a yakın kompakt kompozisyon.
// TOPOLOJİ engine'den (CenterName); burada yalnız KOORDİNAT.

import type { CenterName } from "@/lib/human-design/engine/channels";
import type { PointV2 } from "./viewbox";

export type CenterKind =
  | "triangle-up"
  | "triangle-down"
  | "triangle-left"
  | "triangle-right"
  | "rect"
  | "diamond";

export type CenterGeometry = {
  name: CenterName;
  kind: CenterKind;
  points: PointV2[]; // SVG polygon köşeleri
  centroid: PointV2;
};

export const CENTER_GEOMETRY: Record<CenterName, CenterGeometry> = {
  Head: {
    name: "Head",
    kind: "triangle-up",
    points: [{ x: 230, y: 46 }, { x: 185, y: 100 }, { x: 275, y: 100 }],
    centroid: { x: 230, y: 82 },
  },
  Ajna: {
    name: "Ajna",
    kind: "triangle-down",
    points: [{ x: 185, y: 112 }, { x: 275, y: 112 }, { x: 230, y: 166 }],
    centroid: { x: 230, y: 130 },
  },
  Throat: {
    name: "Throat",
    kind: "rect",
    points: [{ x: 188, y: 182 }, { x: 272, y: 182 }, { x: 272, y: 264 }, { x: 188, y: 264 }],
    centroid: { x: 230, y: 223 },
  },
  G: {
    name: "G",
    kind: "diamond",
    points: [{ x: 228, y: 276 }, { x: 288, y: 338 }, { x: 228, y: 400 }, { x: 168, y: 338 }],
    centroid: { x: 228, y: 338 },
  },
  Heart: {
    name: "Heart",
    kind: "triangle-left",
    points: [{ x: 300, y: 340 }, { x: 342, y: 320 }, { x: 342, y: 360 }],
    centroid: { x: 328, y: 340 },
  },
  Spleen: {
    name: "Spleen",
    kind: "triangle-right",
    points: [{ x: 60, y: 404 }, { x: 60, y: 490 }, { x: 128, y: 447 }],
    centroid: { x: 83, y: 447 },
  },
  SolarPlexus: {
    name: "SolarPlexus",
    kind: "triangle-left",
    points: [{ x: 400, y: 404 }, { x: 400, y: 490 }, { x: 332, y: 447 }],
    centroid: { x: 377, y: 447 },
  },
  Sacral: {
    name: "Sacral",
    kind: "rect",
    points: [{ x: 188, y: 404 }, { x: 272, y: 404 }, { x: 272, y: 486 }, { x: 188, y: 486 }],
    centroid: { x: 230, y: 445 },
  },
  Root: {
    name: "Root",
    kind: "rect",
    points: [{ x: 188, y: 500 }, { x: 272, y: 500 }, { x: 272, y: 578 }, { x: 188, y: 578 }],
    centroid: { x: 230, y: 539 },
  },
};
