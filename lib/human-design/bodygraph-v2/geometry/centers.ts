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
  // V2-6B: G/Heart/Spleen/SolarPlexus/Sacral/Root kontrollü büyütüldü (estetik ölçekleme).
  // Topoloji sabit; yalnız koordinat. Boşluklar pozitif (bkz. plan §1).
  G: {
    name: "G",
    kind: "diamond",
    points: [{ x: 226, y: 274 }, { x: 296, y: 340 }, { x: 226, y: 406 }, { x: 156, y: 340 }],
    centroid: { x: 226, y: 340 },
  },
  Heart: {
    name: "Heart",
    kind: "triangle-left",
    points: [{ x: 306, y: 340 }, { x: 358, y: 314 }, { x: 358, y: 366 }],
    centroid: { x: 341, y: 340 },
  },
  Spleen: {
    name: "Spleen",
    kind: "triangle-right",
    points: [{ x: 52, y: 400 }, { x: 52, y: 498 }, { x: 138, y: 449 }],
    centroid: { x: 81, y: 449 },
  },
  SolarPlexus: {
    name: "SolarPlexus",
    kind: "triangle-left",
    points: [{ x: 408, y: 400 }, { x: 408, y: 498 }, { x: 322, y: 449 }],
    centroid: { x: 379, y: 449 },
  },
  Sacral: {
    name: "Sacral",
    kind: "rect",
    points: [{ x: 185, y: 414 }, { x: 275, y: 414 }, { x: 275, y: 502 }, { x: 185, y: 502 }],
    centroid: { x: 230, y: 458 },
  },
  Root: {
    name: "Root",
    kind: "rect",
    points: [{ x: 182, y: 510 }, { x: 278, y: 510 }, { x: 278, y: 596 }, { x: 182, y: 596 }],
    centroid: { x: 230, y: 553 },
  },
};
