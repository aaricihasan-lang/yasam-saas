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
  // V2-6D: cesur ama çakışmasız ölçekleme + omurga sıkıştırma (9 merkez yeniden konum/boyut).
  // Topoloji sabit; yalnız koordinat. Tüm komşu boşlukları pozitif (bkz. plan §9). viewBox 460×600 SABİT.
  Head: {
    name: "Head",
    kind: "triangle-up",
    points: [{ x: 230, y: 28 }, { x: 180, y: 90 }, { x: 280, y: 90 }],
    centroid: { x: 230, y: 69 },
  },
  Ajna: {
    name: "Ajna",
    kind: "triangle-down",
    points: [{ x: 182, y: 96 }, { x: 278, y: 96 }, { x: 230, y: 148 }],
    centroid: { x: 230, y: 113 },
  },
  Throat: {
    name: "Throat",
    kind: "rect",
    points: [{ x: 186, y: 154 }, { x: 274, y: 154 }, { x: 274, y: 234 }, { x: 186, y: 234 }],
    centroid: { x: 230, y: 194 },
  },
  G: {
    name: "G",
    kind: "diamond",
    points: [{ x: 226, y: 244 }, { x: 306, y: 319 }, { x: 226, y: 394 }, { x: 146, y: 319 }],
    centroid: { x: 226, y: 319 },
  },
  Heart: {
    name: "Heart",
    kind: "triangle-left",
    points: [{ x: 316, y: 319 }, { x: 384, y: 290 }, { x: 384, y: 348 }],
    centroid: { x: 361, y: 319 },
  },
  Spleen: {
    name: "Spleen",
    kind: "triangle-right",
    points: [{ x: 28, y: 394 }, { x: 28, y: 494 }, { x: 128, y: 444 }],
    centroid: { x: 61, y: 444 },
  },
  SolarPlexus: {
    name: "SolarPlexus",
    kind: "triangle-left",
    points: [{ x: 432, y: 394 }, { x: 432, y: 494 }, { x: 332, y: 444 }],
    centroid: { x: 399, y: 444 },
  },
  Sacral: {
    name: "Sacral",
    kind: "rect",
    points: [{ x: 178, y: 400 }, { x: 282, y: 400 }, { x: 282, y: 488 }, { x: 178, y: 488 }],
    centroid: { x: 230, y: 444 },
  },
  Root: {
    name: "Root",
    kind: "rect",
    points: [{ x: 176, y: 494 }, { x: 284, y: 494 }, { x: 284, y: 586 }, { x: 176, y: 586 }],
    centroid: { x: 230, y: 540 },
  },
};
