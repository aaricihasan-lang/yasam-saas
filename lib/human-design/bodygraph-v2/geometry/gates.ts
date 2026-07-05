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
  // V2-6D: 9 merkezin de anchor'ları yeni (cesur) bounds'a göre yeniden konumlandı + padding.
  Head: [
    { gate: 64, x: 210, y: 78 }, { gate: 61, x: 230, y: 76 }, { gate: 63, x: 250, y: 78 },
  ],
  Ajna: [
    { gate: 47, x: 202, y: 108 }, { gate: 24, x: 230, y: 106 }, { gate: 4, x: 258, y: 108 },
    { gate: 17, x: 212, y: 127 }, { gate: 43, x: 230, y: 133 }, { gate: 11, x: 248, y: 127 },
  ],
  Throat: [
    { gate: 62, x: 206, y: 172 }, { gate: 23, x: 230, y: 170 }, { gate: 56, x: 254, y: 172 },
    { gate: 16, x: 200, y: 194 }, { gate: 20, x: 220, y: 194 }, { gate: 35, x: 240, y: 194 }, { gate: 12, x: 260, y: 194 },
    { gate: 31, x: 200, y: 216 }, { gate: 8, x: 220, y: 214 }, { gate: 33, x: 240, y: 216 }, { gate: 45, x: 260, y: 216 },
  ],
  // Kanallar anchor'dan türer → anchor taşınınca otomatik takip (kopma yok).
  G: [
    { gate: 1, x: 226, y: 268 }, { gate: 13, x: 270, y: 292 }, { gate: 25, x: 290, y: 319 }, { gate: 46, x: 270, y: 346 },
    { gate: 2, x: 226, y: 370 }, { gate: 15, x: 182, y: 346 }, { gate: 10, x: 162, y: 319 }, { gate: 7, x: 182, y: 292 },
  ],
  Heart: [
    { gate: 21, x: 360, y: 301 }, { gate: 40, x: 368, y: 319 }, { gate: 26, x: 360, y: 337 }, { gate: 51, x: 334, y: 319 },
  ],
  Spleen: [
    { gate: 48, x: 46, y: 406 }, { gate: 57, x: 62, y: 418 }, { gate: 44, x: 78, y: 430 }, { gate: 50, x: 102, y: 444 },
    { gate: 32, x: 78, y: 458 }, { gate: 28, x: 62, y: 470 }, { gate: 18, x: 46, y: 482 },
  ],
  SolarPlexus: [
    { gate: 36, x: 414, y: 406 }, { gate: 22, x: 398, y: 418 }, { gate: 37, x: 382, y: 430 }, { gate: 6, x: 358, y: 444 },
    { gate: 49, x: 382, y: 458 }, { gate: 55, x: 398, y: 470 }, { gate: 30, x: 414, y: 482 },
  ],
  Sacral: [
    { gate: 5, x: 202, y: 420 }, { gate: 14, x: 230, y: 420 }, { gate: 29, x: 258, y: 420 },
    { gate: 34, x: 202, y: 444 }, { gate: 42, x: 230, y: 444 }, { gate: 59, x: 258, y: 444 },
    { gate: 27, x: 202, y: 468 }, { gate: 3, x: 230, y: 468 }, { gate: 9, x: 258, y: 468 },
  ],
  Root: [
    { gate: 53, x: 202, y: 512 }, { gate: 60, x: 230, y: 512 }, { gate: 52, x: 258, y: 512 },
    { gate: 54, x: 202, y: 540 }, { gate: 41, x: 230, y: 540 }, { gate: 19, x: 258, y: 540 },
    { gate: 58, x: 202, y: 568 }, { gate: 38, x: 230, y: 568 }, { gate: 39, x: 258, y: 568 },
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
