// FAZ 3A — Human Design Engine. Deterministik graf katmanı (channels/centers).
//
// Doğrulanmış gate/line aktivasyonlarından (FAZ 2D) aktif gate seti → tanımlı
// channel → tanımlı center türetir. SAF, deterministik; astronomi içermez.
//   Bu dosyada Type/Authority YOK (FAZ 3B).

// ─── Merkezler ────────────────────────────────────────────────────────────────

export type CenterName =
  | "Head"
  | "Ajna"
  | "Throat"
  | "G"
  | "Heart"
  | "Spleen"
  | "SolarPlexus"
  | "Sacral"
  | "Root";

export const CENTERS: ReadonlyArray<CenterName> = [
  "Head", "Ajna", "Throat", "G", "Heart",
  "Spleen", "SolarPlexus", "Sacral", "Root",
];

// Her merkezin gate'leri (standart HD bodygraph — toplam 64).
const CENTER_GATES: Record<CenterName, number[]> = {
  Head:        [64, 61, 63],
  Ajna:        [47, 24, 4, 17, 11, 43],
  Throat:      [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16],
  G:           [7, 1, 13, 10, 25, 15, 2, 46],
  Heart:       [21, 40, 26, 51],
  Spleen:      [48, 57, 44, 50, 32, 28, 18],
  SolarPlexus: [6, 37, 22, 36, 30, 55, 49],
  Sacral:      [5, 14, 29, 59, 9, 3, 42, 27, 34],
  Root:        [58, 38, 54, 53, 60, 52, 19, 39, 41],
};

/** gate → center (1..64). */
export const GATE_CENTER: Readonly<Record<number, CenterName>> = (() => {
  const map: Record<number, CenterName> = {};
  for (const center of CENTERS) {
    for (const gate of CENTER_GATES[center]) map[gate] = center;
  }
  return map;
})();

// ─── Channel tablosu (36) ─────────────────────────────────────────────────────

export type Channel = {
  /** Kanonik kimlik "minGate-maxGate", örn. "1-8". */
  id: string;
  name: string;
  gateA: number;
  gateB: number;
  centerA: CenterName;
  centerB: CenterName;
};

// 36 kanal — gate çiftleri + isimler. Merkezler GATE_CENTER'dan türetilir.
const RAW_CHANNELS: ReadonlyArray<{ a: number; b: number; name: string }> = [
  { a: 1,  b: 8,  name: "Inspiration" },
  { a: 2,  b: 14, name: "The Beat" },
  { a: 3,  b: 60, name: "Mutation" },
  { a: 4,  b: 63, name: "Logic" },
  { a: 5,  b: 15, name: "Rhythm" },
  { a: 6,  b: 59, name: "Mating" },
  { a: 7,  b: 31, name: "The Alpha" },
  { a: 9,  b: 52, name: "Concentration" },
  { a: 10, b: 20, name: "Awakening" },
  { a: 10, b: 34, name: "Exploration" },
  { a: 10, b: 57, name: "Perfected Form" },
  { a: 11, b: 56, name: "Curiosity" },
  { a: 12, b: 22, name: "Openness" },
  { a: 13, b: 33, name: "The Prodigal" },
  { a: 16, b: 48, name: "The Wavelength" },
  { a: 17, b: 62, name: "Acceptance" },
  { a: 18, b: 58, name: "Judgment" },
  { a: 19, b: 49, name: "Synthesis" },
  { a: 20, b: 34, name: "Charisma" },
  { a: 20, b: 57, name: "The Brainwave" },
  { a: 21, b: 45, name: "Money" },
  { a: 23, b: 43, name: "Structuring" },
  { a: 24, b: 61, name: "Awareness" },
  { a: 25, b: 51, name: "Initiation" },
  { a: 26, b: 44, name: "Surrender" },
  { a: 27, b: 50, name: "Preservation" },
  { a: 28, b: 38, name: "Struggle" },
  { a: 29, b: 46, name: "Discovery" },
  { a: 30, b: 41, name: "Recognition" },
  { a: 32, b: 54, name: "Transformation" },
  { a: 34, b: 57, name: "Power" },
  { a: 35, b: 36, name: "Transitoriness" },
  { a: 37, b: 40, name: "Community" },
  { a: 39, b: 55, name: "Emoting" },
  { a: 42, b: 53, name: "Maturation" },
  { a: 47, b: 64, name: "Abstraction" },
];

export const CHANNELS: ReadonlyArray<Channel> = RAW_CHANNELS.map((c) => {
  const lo = Math.min(c.a, c.b);
  const hi = Math.max(c.a, c.b);
  const centerA = GATE_CENTER[c.a];
  const centerB = GATE_CENTER[c.b];
  if (!centerA || !centerB) {
    throw new Error(`Channel ${c.a}-${c.b}: gate merkezi tanımsız.`);
  }
  return { id: `${lo}-${hi}`, name: c.name, gateA: c.a, gateB: c.b, centerA, centerB };
});

// ─── Türetim fonksiyonları ────────────────────────────────────────────────────

/** Aktivasyonlardan benzersiz aktif gate seti (artan sıralı). */
export function getActiveGates(
  activations: ReadonlyArray<{ gate: number }>,
): number[] {
  return [...new Set(activations.map((a) => a.gate))].sort((x, y) => x - y);
}

/** İki gate'i de aktif olan channel'lar = tanımlı channels. */
export function getDefinedChannels(activeGates: ReadonlyArray<number>): Channel[] {
  const set = new Set(activeGates);
  return CHANNELS.filter((c) => set.has(c.gateA) && set.has(c.gateB));
}

/** Tanımlı channel'lara dokunan merkezler = tanımlı centers (CENTERS sırasında). */
export function getDefinedCenters(
  definedChannels: ReadonlyArray<Channel>,
): CenterName[] {
  const set = new Set<CenterName>();
  for (const c of definedChannels) {
    set.add(c.centerA);
    set.add(c.centerB);
  }
  return CENTERS.filter((c) => set.has(c));
}
