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
  // V2-7 Final Reference Match: hedef referansa göre yeniden oranlama — güçlü üst, dengeli
  // G (dev değil), destekleyici alt, slim/tall figür. Boyun boşluğu (~30px). viewBox 460×600 SABİT.
  Head: {
    name: "Head",
    kind: "triangle-up",
    points: [{ x: 230, y: 24 }, { x: 176, y: 90 }, { x: 284, y: 90 }],
    centroid: { x: 230, y: 68 },
  },
  Ajna: {
    name: "Ajna",
    kind: "triangle-down",
    points: [{ x: 180, y: 96 }, { x: 280, y: 96 }, { x: 230, y: 154 }],
    centroid: { x: 230, y: 115 },
  },
  Throat: {
    name: "Throat",
    kind: "rect",
    points: [{ x: 182, y: 184 }, { x: 278, y: 184 }, { x: 278, y: 270 }, { x: 182, y: 270 }],
    centroid: { x: 230, y: 227 },
  },
  G: {
    name: "G",
    kind: "diamond",
    points: [{ x: 226, y: 286 }, { x: 292, y: 351 }, { x: 226, y: 416 }, { x: 160, y: 351 }],
    centroid: { x: 226, y: 351 },
  },
  Heart: {
    name: "Heart",
    kind: "triangle-left",
    points: [{ x: 300, y: 351 }, { x: 348, y: 330 }, { x: 348, y: 372 }],
    centroid: { x: 332, y: 351 },
  },
  Spleen: {
    name: "Spleen",
    kind: "triangle-right",
    points: [{ x: 60, y: 366 }, { x: 60, y: 456 }, { x: 140, y: 411 }],
    centroid: { x: 87, y: 411 },
  },
  SolarPlexus: {
    name: "SolarPlexus",
    kind: "triangle-left",
    points: [{ x: 400, y: 366 }, { x: 400, y: 456 }, { x: 320, y: 411 }],
    centroid: { x: 373, y: 411 },
  },
  Sacral: {
    name: "Sacral",
    kind: "rect",
    points: [{ x: 184, y: 432 }, { x: 276, y: 432 }, { x: 276, y: 512 }, { x: 184, y: 512 }],
    centroid: { x: 230, y: 472 },
  },
  Root: {
    name: "Root",
    kind: "rect",
    points: [{ x: 186, y: 522 }, { x: 274, y: 522 }, { x: 274, y: 596 }, { x: 186, y: 596 }],
    centroid: { x: 230, y: 559 },
  },
};
