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
  // V2-6B: G/Heart/Spleen/SolarPlexus/Sacral/Root anchor'ları yeni (büyük) merkez bounds'una
  // göre yeniden konumlandı + padding artırıldı. Kanallar anchor'dan türer → otomatik takip.
  G: [
    { gate: 1, x: 226, y: 296 }, { gate: 13, x: 262, y: 318 }, { gate: 25, x: 280, y: 340 }, { gate: 46, x: 262, y: 362 },
    { gate: 2, x: 226, y: 384 }, { gate: 15, x: 190, y: 362 }, { gate: 10, x: 176, y: 340 }, { gate: 7, x: 190, y: 318 },
  ],
  Heart: [
    { gate: 21, x: 344, y: 323 }, { gate: 40, x: 348, y: 340 }, { gate: 26, x: 344, y: 357 }, { gate: 51, x: 322, y: 340 },
  ],
  Spleen: [
    { gate: 48, x: 66, y: 412 }, { gate: 57, x: 80, y: 422 }, { gate: 44, x: 94, y: 434 }, { gate: 50, x: 114, y: 449 },
    { gate: 32, x: 94, y: 464 }, { gate: 28, x: 80, y: 476 }, { gate: 18, x: 66, y: 486 },
  ],
  SolarPlexus: [
    { gate: 36, x: 394, y: 412 }, { gate: 22, x: 380, y: 422 }, { gate: 37, x: 366, y: 434 }, { gate: 6, x: 346, y: 449 },
    { gate: 49, x: 366, y: 464 }, { gate: 55, x: 380, y: 476 }, { gate: 30, x: 394, y: 486 },
  ],
  Sacral: [
    { gate: 5, x: 206, y: 435 }, { gate: 14, x: 230, y: 435 }, { gate: 29, x: 254, y: 435 },
    { gate: 34, x: 206, y: 458 }, { gate: 42, x: 230, y: 458 }, { gate: 59, x: 254, y: 458 },
    { gate: 27, x: 206, y: 481 }, { gate: 3, x: 230, y: 481 }, { gate: 9, x: 254, y: 481 },
  ],
  Root: [
    { gate: 53, x: 206, y: 528 }, { gate: 60, x: 230, y: 528 }, { gate: 52, x: 254, y: 528 },
    { gate: 54, x: 206, y: 553 }, { gate: 41, x: 230, y: 553 }, { gate: 19, x: 254, y: 553 },
    { gate: 58, x: 206, y: 578 }, { gate: 38, x: 230, y: 578 }, { gate: 39, x: 254, y: 578 },
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
