// FAZ 6 / ADIM 6a — Human Design BodyGraph statik yerleşimi (SAF veri).
//
// Yalnız SVG KOORDİNATLARI + şekiller. Hesaplama/algoritma YOK, render YOK.
// Topoloji (hangi kapı hangi merkezte, hangi kapılar kanal) engine/channels'tan
// gelir (tek doğruluk kaynağı; astronomy-engine bağımlılığı YOK → client-safe).
// Bu dosya bunların üstüne ELLE koordinat ekler.

import { CENTERS, CHANNELS, GATE_CENTER, type CenterName } from "../engine/channels";

export const VIEWBOX = { width: 300, height: 460 } as const;

export type Point = { x: number; y: number };

export type CenterShape = {
  name: CenterName;
  kind: "triangle-up" | "triangle-down" | "triangle-left" | "triangle-right" | "rect" | "diamond";
  points: Point[]; // SVG polygon köşeleri
  centroid: Point;
};

// ── 9 merkez şekli/konumu ─────────────────────────────────────────────────────
export const CENTER_SHAPES: Record<CenterName, CenterShape> = {
  Head:        { name: "Head",        kind: "triangle-up",    points: [{ x: 150, y: 8 }, { x: 118, y: 52 }, { x: 182, y: 52 }],                    centroid: { x: 150, y: 37 } },
  Ajna:        { name: "Ajna",        kind: "triangle-down",  points: [{ x: 118, y: 62 }, { x: 182, y: 62 }, { x: 150, y: 108 }],                  centroid: { x: 150, y: 77 } },
  Throat:      { name: "Throat",      kind: "rect",           points: [{ x: 112, y: 118 }, { x: 188, y: 118 }, { x: 188, y: 176 }, { x: 112, y: 176 }], centroid: { x: 150, y: 147 } },
  G:           { name: "G",           kind: "diamond",        points: [{ x: 150, y: 182 }, { x: 196, y: 226 }, { x: 150, y: 270 }, { x: 104, y: 226 }],  centroid: { x: 150, y: 226 } },
  Heart:       { name: "Heart",       kind: "triangle-left",  points: [{ x: 236, y: 222 }, { x: 236, y: 262 }, { x: 200, y: 242 }],                centroid: { x: 224, y: 242 } },
  Spleen:      { name: "Spleen",      kind: "triangle-right", points: [{ x: 28, y: 268 }, { x: 28, y: 342 }, { x: 86, y: 305 }],                   centroid: { x: 47, y: 305 } },
  SolarPlexus: { name: "SolarPlexus", kind: "triangle-left",  points: [{ x: 272, y: 268 }, { x: 272, y: 342 }, { x: 214, y: 305 }],                centroid: { x: 253, y: 305 } },
  Sacral:      { name: "Sacral",      kind: "rect",           points: [{ x: 112, y: 300 }, { x: 188, y: 300 }, { x: 188, y: 360 }, { x: 112, y: 360 }], centroid: { x: 150, y: 330 } },
  Root:        { name: "Root",        kind: "rect",           points: [{ x: 112, y: 388 }, { x: 188, y: 388 }, { x: 188, y: 448 }, { x: 112, y: 448 }], centroid: { x: 150, y: 418 } },
};

// ── 64 kapı anchor koordinatı (merkeze göre gruplu; sıra channels.ts ile aynı) ──
// Not: her kapının hangi merkezde olduğu ELLE burada değil, GATE_CENTER'da tanımlı;
// aşağıdaki gruplama testte GATE_CENTER'a karşı doğrulanır.
const GATES_BY_CENTER: Record<CenterName, Array<{ gate: number; x: number; y: number }>> = {
  Head: [
    { gate: 64, x: 130, y: 48 }, { gate: 61, x: 150, y: 48 }, { gate: 63, x: 170, y: 48 },
  ],
  Ajna: [
    { gate: 47, x: 130, y: 67 }, { gate: 24, x: 150, y: 67 }, { gate: 4, x: 170, y: 67 },
    { gate: 17, x: 132, y: 95 }, { gate: 43, x: 150, y: 95 }, { gate: 11, x: 168, y: 95 },
  ],
  Throat: [
    { gate: 62, x: 122, y: 125 }, { gate: 23, x: 150, y: 125 }, { gate: 56, x: 178, y: 125 },
    { gate: 16, x: 116, y: 147 }, { gate: 20, x: 139, y: 147 }, { gate: 35, x: 161, y: 147 }, { gate: 12, x: 184, y: 147 },
    { gate: 31, x: 118, y: 169 }, { gate: 8, x: 142, y: 169 }, { gate: 33, x: 166, y: 169 }, { gate: 45, x: 184, y: 169 },
  ],
  G: [
    { gate: 1, x: 150, y: 196 }, { gate: 13, x: 170, y: 212 }, { gate: 25, x: 180, y: 226 }, { gate: 46, x: 168, y: 242 },
    { gate: 2, x: 150, y: 256 }, { gate: 15, x: 132, y: 242 }, { gate: 10, x: 120, y: 226 }, { gate: 7, x: 132, y: 212 },
  ],
  Heart: [
    { gate: 21, x: 214, y: 228 }, { gate: 40, x: 228, y: 240 }, { gate: 26, x: 214, y: 254 }, { gate: 51, x: 204, y: 242 },
  ],
  Spleen: [
    { gate: 48, x: 40, y: 274 }, { gate: 57, x: 52, y: 283 }, { gate: 44, x: 64, y: 293 }, { gate: 50, x: 74, y: 305 },
    { gate: 32, x: 64, y: 317 }, { gate: 28, x: 52, y: 327 }, { gate: 18, x: 40, y: 336 },
  ],
  SolarPlexus: [
    { gate: 36, x: 262, y: 272 }, { gate: 22, x: 250, y: 281 }, { gate: 37, x: 238, y: 291 }, { gate: 6, x: 226, y: 305 },
    { gate: 49, x: 238, y: 319 }, { gate: 55, x: 250, y: 329 }, { gate: 30, x: 262, y: 338 },
  ],
  Sacral: [
    { gate: 5, x: 126, y: 308 }, { gate: 14, x: 150, y: 308 }, { gate: 29, x: 174, y: 308 },
    { gate: 34, x: 126, y: 330 }, { gate: 42, x: 150, y: 330 }, { gate: 59, x: 174, y: 330 },
    { gate: 27, x: 126, y: 352 }, { gate: 3, x: 150, y: 352 }, { gate: 9, x: 174, y: 352 },
  ],
  Root: [
    { gate: 53, x: 126, y: 396 }, { gate: 60, x: 150, y: 396 }, { gate: 52, x: 174, y: 396 },
    { gate: 54, x: 126, y: 418 }, { gate: 41, x: 150, y: 418 }, { gate: 19, x: 174, y: 418 },
    { gate: 58, x: 126, y: 440 }, { gate: 38, x: 150, y: 440 }, { gate: 39, x: 174, y: 440 },
  ],
};

export type GateAnchor = { gate: number; x: number; y: number; center: CenterName };

/** gate → anchor (merkezle etiketli). GATES_BY_CENTER'dan türetilir. */
export const GATE_ANCHORS: Record<number, GateAnchor> = (() => {
  const out: Record<number, GateAnchor> = {};
  for (const center of CENTERS) {
    for (const g of GATES_BY_CENTER[center]) {
      out[g.gate] = { gate: g.gate, x: g.x, y: g.y, center };
    }
  }
  return out;
})();

export type ChannelSegment = {
  id: string;
  gateA: number;
  gateB: number;
  a: Point;
  b: Point;
};

/** 36 kanal çizgi segmenti (anchor A → anchor B). CHANNELS'tan türetilir. */
export const CHANNEL_SEGMENTS: ChannelSegment[] = CHANNELS.flatMap((c) => {
  const a = GATE_ANCHORS[c.gateA];
  const b = GATE_ANCHORS[c.gateB];
  if (!a || !b) return []; // eksik anchor → testte yakalanır (uzunluk < 36)
  return [{ id: c.id, gateA: c.gateA, gateB: c.gateB, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }];
});

// Yeniden ihraç (test/kullanım kolaylığı — hepsi engine/channels'tan, AE'siz).
export { CENTERS, CHANNELS, GATE_CENTER };
