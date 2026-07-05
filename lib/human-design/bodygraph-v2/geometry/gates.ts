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
  // V2-7: 64 anchor yeni (dengeli) bounds'a dağıtıldı. Kanallar anchor'dan türer → otomatik takip.
  Head: [
    { gate: 64, x: 210, y: 80 }, { gate: 61, x: 230, y: 78 }, { gate: 63, x: 250, y: 80 },
  ],
  Ajna: [
    { gate: 47, x: 202, y: 110 }, { gate: 24, x: 230, y: 108 }, { gate: 4, x: 258, y: 110 },
    { gate: 17, x: 212, y: 132 }, { gate: 43, x: 230, y: 138 }, { gate: 11, x: 248, y: 132 },
  ],
  Throat: [
    { gate: 62, x: 205, y: 202 }, { gate: 23, x: 230, y: 200 }, { gate: 56, x: 255, y: 202 },
    { gate: 16, x: 200, y: 226 }, { gate: 20, x: 220, y: 226 }, { gate: 35, x: 240, y: 226 }, { gate: 12, x: 260, y: 226 },
    { gate: 31, x: 200, y: 250 }, { gate: 8, x: 220, y: 248 }, { gate: 33, x: 240, y: 250 }, { gate: 45, x: 260, y: 250 },
  ],
  G: [
    { gate: 1, x: 226, y: 304 }, { gate: 13, x: 262, y: 328 }, { gate: 25, x: 284, y: 351 }, { gate: 46, x: 262, y: 374 },
    { gate: 2, x: 226, y: 398 }, { gate: 15, x: 190, y: 374 }, { gate: 10, x: 168, y: 351 }, { gate: 7, x: 190, y: 328 },
  ],
  Heart: [
    { gate: 21, x: 336, y: 335 }, { gate: 40, x: 340, y: 351 }, { gate: 26, x: 336, y: 367 }, { gate: 51, x: 316, y: 351 },
  ],
  Spleen: [
    { gate: 48, x: 74, y: 378 }, { gate: 57, x: 88, y: 388 }, { gate: 44, x: 102, y: 400 }, { gate: 50, x: 122, y: 411 },
    { gate: 32, x: 102, y: 422 }, { gate: 28, x: 88, y: 434 }, { gate: 18, x: 74, y: 444 },
  ],
  SolarPlexus: [
    { gate: 36, x: 386, y: 378 }, { gate: 22, x: 372, y: 388 }, { gate: 37, x: 358, y: 400 }, { gate: 6, x: 338, y: 411 },
    { gate: 49, x: 358, y: 422 }, { gate: 55, x: 372, y: 434 }, { gate: 30, x: 386, y: 444 },
  ],
  Sacral: [
    { gate: 5, x: 204, y: 452 }, { gate: 14, x: 230, y: 452 }, { gate: 29, x: 256, y: 452 },
    { gate: 34, x: 204, y: 472 }, { gate: 42, x: 230, y: 472 }, { gate: 59, x: 256, y: 472 },
    { gate: 27, x: 204, y: 492 }, { gate: 3, x: 230, y: 492 }, { gate: 9, x: 256, y: 492 },
  ],
  Root: [
    { gate: 53, x: 204, y: 538 }, { gate: 60, x: 230, y: 538 }, { gate: 52, x: 256, y: 538 },
    { gate: 54, x: 204, y: 559 }, { gate: 41, x: 230, y: 559 }, { gate: 19, x: 256, y: 559 },
    { gate: 58, x: 204, y: 580 }, { gate: 38, x: 230, y: 580 }, { gate: 39, x: 256, y: 580 },
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
