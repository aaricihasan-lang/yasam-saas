// FAZ 6/6a + FAZ 7A — Human Design BodyGraph statik yerleşimi (SAF veri).
//
// Yalnız SVG KOORDİNATLARI + şekiller. Hesaplama/algoritma YOK, render YOK.
// Topoloji (hangi kapı hangi merkezte, hangi kapılar kanal) engine/channels'tan
// gelir (tek doğruluk kaynağı; astronomy-engine bağımlılığı YOK → client-safe).
//
// FAZ 7A GEOMETRİ REVİZYONU: viewBox 340×600 (daha uzun/nefes alan); merkezler
// yeniden hizalandı, aralar açıldı, oranlar profesyonel HD görünümüne yaklaştı.
// TOPOLOJİ DEĞİŞMEDİ — her kapı yine kendi merkezinde (layout_topology doğrular).

import { CENTERS, CHANNELS, GATE_CENTER, type CenterName } from "../engine/channels";

export const VIEWBOX = { width: 340, height: 600 } as const;

export type Point = { x: number; y: number };

export type CenterShape = {
  name: CenterName;
  kind: "triangle-up" | "triangle-down" | "triangle-left" | "triangle-right" | "rect" | "diamond";
  points: Point[]; // SVG polygon köşeleri
  centroid: Point;
};

// ── 9 merkez şekli/konumu (x-ekseni ~170; dikey zincir + bottom triad) ─────────
export const CENTER_SHAPES: Record<CenterName, CenterShape> = {
  Head:        { name: "Head",        kind: "triangle-up",    points: [{ x: 170, y: 22 }, { x: 140, y: 66 }, { x: 200, y: 66 }],                      centroid: { x: 170, y: 55 } },
  Ajna:        { name: "Ajna",        kind: "triangle-down",  points: [{ x: 140, y: 78 }, { x: 200, y: 78 }, { x: 170, y: 128 }],                     centroid: { x: 170, y: 95 } },
  Throat:      { name: "Throat",      kind: "rect",           points: [{ x: 138, y: 160 }, { x: 202, y: 160 }, { x: 202, y: 232 }, { x: 138, y: 232 }], centroid: { x: 170, y: 196 } },
  G:           { name: "G",           kind: "diamond",        points: [{ x: 170, y: 262 }, { x: 222, y: 314 }, { x: 170, y: 366 }, { x: 118, y: 314 }],  centroid: { x: 170, y: 314 } },
  Heart:       { name: "Heart",       kind: "triangle-left",  points: [{ x: 266, y: 300 }, { x: 266, y: 344 }, { x: 228, y: 322 }],                   centroid: { x: 253, y: 322 } },
  Spleen:      { name: "Spleen",      kind: "triangle-right", points: [{ x: 48, y: 396 }, { x: 48, y: 476 }, { x: 112, y: 436 }],                     centroid: { x: 69, y: 436 } },
  SolarPlexus: { name: "SolarPlexus", kind: "triangle-left",  points: [{ x: 292, y: 396 }, { x: 292, y: 476 }, { x: 228, y: 436 }],                   centroid: { x: 271, y: 436 } },
  Sacral:      { name: "Sacral",      kind: "rect",           points: [{ x: 138, y: 396 }, { x: 202, y: 396 }, { x: 202, y: 468 }, { x: 138, y: 468 }], centroid: { x: 170, y: 432 } },
  Root:        { name: "Root",        kind: "rect",           points: [{ x: 138, y: 510 }, { x: 202, y: 510 }, { x: 202, y: 582 }, { x: 138, y: 582 }], centroid: { x: 170, y: 546 } },
};

// ── 64 kapı anchor koordinatı (merkeze göre gruplu; grup = merkez, testte doğrulanır) ──
const GATES_BY_CENTER: Record<CenterName, Array<{ gate: number; x: number; y: number }>> = {
  Head: [
    { gate: 64, x: 152, y: 60 }, { gate: 61, x: 170, y: 58 }, { gate: 63, x: 188, y: 60 },
  ],
  Ajna: [
    { gate: 47, x: 150, y: 86 }, { gate: 24, x: 170, y: 84 }, { gate: 4, x: 190, y: 86 },
    { gate: 17, x: 156, y: 110 }, { gate: 43, x: 170, y: 120 }, { gate: 11, x: 184, y: 110 },
  ],
  Throat: [
    { gate: 62, x: 150, y: 172 }, { gate: 23, x: 170, y: 170 }, { gate: 56, x: 190, y: 172 },
    { gate: 16, x: 146, y: 196 }, { gate: 20, x: 163, y: 196 }, { gate: 35, x: 180, y: 196 }, { gate: 12, x: 197, y: 196 },
    { gate: 31, x: 146, y: 222 }, { gate: 8, x: 163, y: 222 }, { gate: 33, x: 180, y: 222 }, { gate: 45, x: 197, y: 222 },
  ],
  G: [
    { gate: 1, x: 170, y: 278 }, { gate: 13, x: 192, y: 300 }, { gate: 25, x: 206, y: 314 }, { gate: 46, x: 192, y: 330 },
    { gate: 2, x: 170, y: 350 }, { gate: 15, x: 148, y: 330 }, { gate: 10, x: 134, y: 314 }, { gate: 7, x: 148, y: 300 },
  ],
  Heart: [
    { gate: 21, x: 248, y: 308 }, { gate: 40, x: 258, y: 320 }, { gate: 26, x: 248, y: 334 }, { gate: 51, x: 236, y: 322 },
  ],
  Spleen: [
    { gate: 48, x: 60, y: 402 }, { gate: 57, x: 72, y: 412 }, { gate: 44, x: 84, y: 422 }, { gate: 50, x: 96, y: 436 },
    { gate: 32, x: 84, y: 450 }, { gate: 28, x: 72, y: 462 }, { gate: 18, x: 60, y: 470 },
  ],
  SolarPlexus: [
    { gate: 36, x: 280, y: 402 }, { gate: 22, x: 268, y: 412 }, { gate: 37, x: 256, y: 422 }, { gate: 6, x: 244, y: 436 },
    { gate: 49, x: 256, y: 450 }, { gate: 55, x: 268, y: 462 }, { gate: 30, x: 280, y: 470 },
  ],
  Sacral: [
    { gate: 5, x: 152, y: 410 }, { gate: 14, x: 170, y: 410 }, { gate: 29, x: 188, y: 410 },
    { gate: 34, x: 152, y: 432 }, { gate: 42, x: 170, y: 432 }, { gate: 59, x: 188, y: 432 },
    { gate: 27, x: 152, y: 454 }, { gate: 3, x: 170, y: 454 }, { gate: 9, x: 188, y: 454 },
  ],
  Root: [
    { gate: 53, x: 152, y: 524 }, { gate: 60, x: 170, y: 524 }, { gate: 52, x: 188, y: 524 },
    { gate: 54, x: 152, y: 546 }, { gate: 41, x: 170, y: 546 }, { gate: 19, x: 188, y: 546 },
    { gate: 58, x: 152, y: 568 }, { gate: 38, x: 170, y: 568 }, { gate: 39, x: 188, y: 568 },
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
