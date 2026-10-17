// İlişki (Connection) BİRLEŞİK BODYGRAPH yerleşimi — Yaşam Sistemi'ne özgü geometri (SAF veri).
//
// Topoloji TEK kaynaktan: engine/channels (64 kapı → 9 merkez, 36 kanal). Burada yalnız ÇİZİM koordinatları:
//   • Kapılar merkezin KENARINDA, kanalın çıktığı yöne bakar (numaralar okunaklı, iç içe değil).
//   • Kanal güzergâhları başka bir merkezin İÇİNDEN geçmez; G↔Boğaz (7-31 / 1-8 / 13-33), 10-20, 21-45 gibi
//     karışabilen kanallar ayrık rotalarla çizilir (bkz. scripts/hd-relations/composite-geometry harness).
//   • Rakip grafiklerin koordinatları/çizimleri KULLANILMAZ.

import { CENTERS, CHANNELS, GATE_CENTER, type CenterName } from "../engine/channels";

export const COMPOSITE_VIEW = { width: 400, height: 660 } as const;
export type Pt = { x: number; y: number };

export type CompositeCenterShape = { name: CenterName; points: Pt[]; label: Pt };

export const COMPOSITE_CENTERS: Record<CenterName, CompositeCenterShape> = {
  Head: { name: "Head", points: [{ x: 200, y: 20 }, { x: 240, y: 80 }, { x: 160, y: 80 }], label: { x: 200, y: 52 } },
  Ajna: { name: "Ajna", points: [{ x: 160, y: 100 }, { x: 240, y: 100 }, { x: 200, y: 160 }], label: { x: 200, y: 120 } },
  Throat: { name: "Throat", points: [{ x: 160, y: 190 }, { x: 240, y: 190 }, { x: 240, y: 270 }, { x: 160, y: 270 }], label: { x: 200, y: 233 } },
  G: { name: "G", points: [{ x: 200, y: 294 }, { x: 256, y: 350 }, { x: 200, y: 406 }, { x: 144, y: 350 }], label: { x: 200, y: 353 } },
  Heart: { name: "Heart", points: [{ x: 336, y: 316 }, { x: 336, y: 398 }, { x: 266, y: 357 }], label: { x: 306, y: 360 } },
  Spleen: { name: "Spleen", points: [{ x: 40, y: 450 }, { x: 112, y: 500 }, { x: 40, y: 550 }], label: { x: 60, y: 503 } },
  SolarPlexus: { name: "SolarPlexus", points: [{ x: 360, y: 450 }, { x: 360, y: 550 }, { x: 288, y: 500 }], label: { x: 340, y: 503 } },
  Sacral: { name: "Sacral", points: [{ x: 160, y: 450 }, { x: 240, y: 450 }, { x: 240, y: 530 }, { x: 160, y: 530 }], label: { x: 200, y: 493 } },
  Root: { name: "Root", points: [{ x: 160, y: 570 }, { x: 240, y: 570 }, { x: 240, y: 640 }, { x: 160, y: 640 }], label: { x: 200, y: 606 } },
};

/** 64 kapı — merkez kenarı/köşesi yakınında. */
export const COMPOSITE_GATES: Record<number, Pt> = {
  // Baş
  64: { x: 176, y: 72 }, 61: { x: 200, y: 72 }, 63: { x: 224, y: 72 },
  // Ajna
  47: { x: 176, y: 107 }, 24: { x: 200, y: 107 }, 4: { x: 224, y: 107 },
  17: { x: 184, y: 130 }, 43: { x: 200, y: 150 }, 11: { x: 216, y: 130 },
  // Boğaz
  62: { x: 176, y: 198 }, 23: { x: 200, y: 198 }, 56: { x: 224, y: 198 },
  16: { x: 168, y: 214 }, 20: { x: 168, y: 238 }, 35: { x: 232, y: 214 }, 12: { x: 232, y: 238 },
  31: { x: 172, y: 262 }, 8: { x: 191, y: 262 }, 33: { x: 210, y: 262 }, 45: { x: 230, y: 262 },
  // G
  1: { x: 200, y: 305 }, 7: { x: 181, y: 323 }, 13: { x: 219, y: 323 }, 10: { x: 156, y: 350 },
  25: { x: 244, y: 350 }, 15: { x: 181, y: 377 }, 46: { x: 219, y: 377 }, 2: { x: 200, y: 395 },
  // Kalp
  21: { x: 320, y: 333 }, 51: { x: 280, y: 357 }, 40: { x: 328, y: 357 }, 26: { x: 310, y: 380 },
  // Dalak
  48: { x: 52, y: 462 }, 57: { x: 68, y: 473 }, 44: { x: 88, y: 485 }, 50: { x: 104, y: 500 },
  32: { x: 88, y: 515 }, 28: { x: 68, y: 527 }, 18: { x: 52, y: 538 },
  // Solar Pleksus
  36: { x: 348, y: 462 }, 22: { x: 332, y: 473 }, 37: { x: 312, y: 485 }, 6: { x: 296, y: 500 },
  49: { x: 312, y: 515 }, 55: { x: 332, y: 527 }, 30: { x: 348, y: 538 },
  // Sakral
  5: { x: 178, y: 458 }, 14: { x: 200, y: 458 }, 29: { x: 222, y: 458 },
  34: { x: 168, y: 478 }, 27: { x: 168, y: 510 }, 59: { x: 232, y: 494 },
  42: { x: 180, y: 522 }, 3: { x: 200, y: 522 }, 9: { x: 220, y: 522 },
  // Kök
  53: { x: 180, y: 578 }, 60: { x: 200, y: 578 }, 52: { x: 220, y: 578 },
  54: { x: 168, y: 596 }, 38: { x: 168, y: 614 }, 58: { x: 168, y: 631 },
  19: { x: 232, y: 596 }, 39: { x: 232, y: 614 }, 41: { x: 232, y: 631 },
};

/**
 * Kanal ara noktaları (yalnız gerekenler). Anahtar resmî kanal kimliği "küçük-büyük".
 * Yön: düşük numaralı kapıdan yüksek numaralıya.
 */
const WAYPOINTS: Record<string, Pt[]> = {
  "10-20": [{ x: 147, y: 292 }],
  "20-34": [{ x: 134, y: 280 }, { x: 122, y: 350 }, { x: 134, y: 430 }],
  "10-34": [{ x: 146, y: 412 }],
  "20-57": [{ x: 150, y: 262 }],
  "12-22": [{ x: 352, y: 304 }],
  "35-36": [{ x: 374, y: 292 }],
  "26-44": [{ x: 200, y: 424 }],
};

export type CompositeChannelRoute = {
  id: string;
  gateA: number; // düşük numara
  gateB: number;
  points: Pt[]; // gateA → … → gateB
  /** Kanal ortası (yarım kanalların bittiği nokta; dinamik işaretinin yeri). */
  mid: Pt;
  /** gateA'dan ortaya kadar ve ortadan gateB'ye kadar polyline'lar. */
  halfA: Pt[];
  halfB: Pt[];
};

function polylineLength(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
}

/** Polyline'ı uzunluk ortasından ikiye böler. */
function splitAtMiddle(p: Pt[]): { mid: Pt; first: Pt[]; second: Pt[] } {
  const half = polylineLength(p) / 2;
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const seg = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc + seg >= half) {
      const t = seg === 0 ? 0 : (half - acc) / seg;
      const mid = { x: +(p[i - 1].x + (p[i].x - p[i - 1].x) * t).toFixed(2), y: +(p[i - 1].y + (p[i].y - p[i - 1].y) * t).toFixed(2) };
      return { mid, first: [...p.slice(0, i), mid], second: [mid, ...p.slice(i)] };
    }
    acc += seg;
  }
  return { mid: p[p.length - 1], first: p, second: [p[p.length - 1]] };
}

export const COMPOSITE_ROUTES: CompositeChannelRoute[] = CHANNELS.map((c) => {
  const lo = Math.min(c.gateA, c.gateB);
  const hi = Math.max(c.gateA, c.gateB);
  const pts = [COMPOSITE_GATES[lo], ...(WAYPOINTS[c.id] ?? []), COMPOSITE_GATES[hi]];
  const s = splitAtMiddle(pts);
  return { id: c.id, gateA: lo, gateB: hi, points: pts, mid: s.mid, halfA: s.first, halfB: s.second };
});

export { CENTERS, CHANNELS, GATE_CENTER };
