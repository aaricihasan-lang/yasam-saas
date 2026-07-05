// Premium BodyGraph V2 — 64 gate anchor (saf veri).
//
// Her merkez için kanonik satır/slot düzeni; koordinatlar merkez geometrisinin
// sınırları içinde. Gruplar engine CENTER_GATES ile birebir (merkez üyeliği sabit);
// GATE_ANCHORS_V2 bu gruplardan merkez-etiketli türetilir → geometry_selftest_v2
// her gate'i GATE_CENTER ile doğrular (1..64 eksiksiz, doğru merkez).

import { CENTERS, type CenterName } from "@/lib/human-design/engine/channels";
import type { PointV2 } from "./viewbox";

export type GateAnchorV2 = { gate: number; center: CenterName; x: number; y: number };

// Merkez içi yerleşim (merkez bounds'una göre elle konumlanmış sabitler).
const GATES_BY_CENTER_V2: Record<CenterName, Array<{ gate: number } & PointV2>> = {
  Head: [
    { gate: 64, x: 212, y: 90 }, { gate: 61, x: 230, y: 88 }, { gate: 63, x: 248, y: 90 },
  ],
  Ajna: [
    { gate: 47, x: 200, y: 122 }, { gate: 24, x: 230, y: 120 }, { gate: 4, x: 260, y: 122 },
    { gate: 17, x: 211, y: 142 }, { gate: 43, x: 230, y: 148 }, { gate: 11, x: 249, y: 142 },
  ],
  Throat: [
    { gate: 62, x: 205, y: 200 }, { gate: 23, x: 230, y: 198 }, { gate: 56, x: 255, y: 200 },
    { gate: 16, x: 200, y: 224 }, { gate: 20, x: 220, y: 224 }, { gate: 35, x: 242, y: 224 }, { gate: 12, x: 262, y: 224 },
    { gate: 31, x: 200, y: 248 }, { gate: 8, x: 220, y: 246 }, { gate: 33, x: 242, y: 248 }, { gate: 45, x: 262, y: 248 },
  ],
  G: [
    { gate: 1, x: 228, y: 294 }, { gate: 13, x: 258, y: 316 }, { gate: 25, x: 270, y: 338 }, { gate: 46, x: 258, y: 362 },
    { gate: 2, x: 228, y: 382 }, { gate: 15, x: 198, y: 362 }, { gate: 10, x: 188, y: 338 }, { gate: 7, x: 198, y: 316 },
  ],
  Heart: [
    { gate: 21, x: 330, y: 326 }, { gate: 40, x: 334, y: 340 }, { gate: 26, x: 330, y: 354 }, { gate: 51, x: 314, y: 340 },
  ],
  Spleen: [
    { gate: 48, x: 72, y: 414 }, { gate: 57, x: 84, y: 422 }, { gate: 44, x: 96, y: 432 }, { gate: 50, x: 112, y: 447 },
    { gate: 32, x: 96, y: 462 }, { gate: 28, x: 84, y: 472 }, { gate: 18, x: 72, y: 480 },
  ],
  SolarPlexus: [
    { gate: 36, x: 388, y: 414 }, { gate: 22, x: 376, y: 422 }, { gate: 37, x: 364, y: 432 }, { gate: 6, x: 348, y: 447 },
    { gate: 49, x: 364, y: 462 }, { gate: 55, x: 376, y: 472 }, { gate: 30, x: 388, y: 480 },
  ],
  Sacral: [
    { gate: 5, x: 205, y: 420 }, { gate: 14, x: 230, y: 420 }, { gate: 29, x: 255, y: 420 },
    { gate: 34, x: 205, y: 445 }, { gate: 42, x: 230, y: 445 }, { gate: 59, x: 255, y: 445 },
    { gate: 27, x: 205, y: 470 }, { gate: 3, x: 230, y: 470 }, { gate: 9, x: 255, y: 470 },
  ],
  Root: [
    { gate: 53, x: 205, y: 516 }, { gate: 60, x: 230, y: 516 }, { gate: 52, x: 255, y: 516 },
    { gate: 54, x: 205, y: 539 }, { gate: 41, x: 230, y: 539 }, { gate: 19, x: 255, y: 539 },
    { gate: 58, x: 205, y: 562 }, { gate: 38, x: 230, y: 562 }, { gate: 39, x: 255, y: 562 },
  ],
};

/** gate → anchor (merkez etiketli). GATES_BY_CENTER_V2'den türetilir. */
export const GATE_ANCHORS_V2: Record<number, GateAnchorV2> = (() => {
  const out: Record<number, GateAnchorV2> = {};
  for (const center of CENTERS) {
    for (const g of GATES_BY_CENTER_V2[center]) {
      out[g.gate] = { gate: g.gate, center, x: g.x, y: g.y };
    }
  }
  return out;
})();
