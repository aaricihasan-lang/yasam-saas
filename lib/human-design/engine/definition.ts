// FAZ 3A — Human Design Engine. Definition (tanım) hesabı.
//
// Tanımlı merkezleri, tanımlı channel'lar üzerinden bağlı bileşenlere ayırır ve
// HD Definition türünü verir. SAF, deterministik. Type/Authority YOK.

import { CHANNELS, type CenterName, type Channel, GATE_CENTER } from "./channels";

export type DefinitionKind =
  | "none"
  | "single"
  | "split-small"
  | "split-large"
  | "triple-split"
  | "quad-split";

export type DefinitionResult = {
  kind: DefinitionKind;
  componentCount: number;
  /** Bağlı bileşenler (her biri merkez listesi). */
  components: CenterName[][];
  definedCenters: CenterName[];
};

// ─── Bağlı bileşen (union-find benzeri BFS) ───────────────────────────────────

/**
 * Verilen merkez kümesini, verilen channel kenarları üzerinden bağlı bileşenlere
 * ayırır. Yalnız `centers` içindeki merkezler düğüm sayılır.
 */
function connectedComponents(
  centers: ReadonlyArray<CenterName>,
  channels: ReadonlyArray<Channel>,
): CenterName[][] {
  const centerSet = new Set(centers);
  const adj = new Map<CenterName, Set<CenterName>>();
  for (const c of centers) adj.set(c, new Set());
  for (const ch of channels) {
    if (centerSet.has(ch.centerA) && centerSet.has(ch.centerB)) {
      adj.get(ch.centerA)!.add(ch.centerB);
      adj.get(ch.centerB)!.add(ch.centerA);
    }
  }

  const seen = new Set<CenterName>();
  const components: CenterName[][] = [];
  for (const start of centers) {
    if (seen.has(start)) continue;
    const comp: CenterName[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const node = stack.pop()!;
      comp.push(node);
      for (const nb of adj.get(node)!) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

/** Verilen aktif gate setiyle iki merkez bağlı mı? (tam-aktif channel'lar üzerinden). */
function centersConnected(
  activeGates: ReadonlySet<number>,
  from: CenterName,
  to: CenterName,
): boolean {
  const adj = new Map<CenterName, Set<CenterName>>();
  for (const ch of CHANNELS) {
    if (activeGates.has(ch.gateA) && activeGates.has(ch.gateB)) {
      if (!adj.has(ch.centerA)) adj.set(ch.centerA, new Set());
      if (!adj.has(ch.centerB)) adj.set(ch.centerB, new Set());
      adj.get(ch.centerA)!.add(ch.centerB);
      adj.get(ch.centerB)!.add(ch.centerA);
    }
  }
  if (from === to) return true;
  const seen = new Set<CenterName>([from]);
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;
    for (const nb of adj.get(node) ?? []) {
      if (nb === to) return true;
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return false;
}

/**
 * 2 bileşenli (split) durumda küçük/geniş ayrımı:
 * Tek bir gate'in aktive edilmesi iki bileşeni birleştiriyorsa "small",
 * aksi halde (en az 2 gate gerekiyorsa) "large".
 */
function isSmallSplit(
  activeGates: ReadonlyArray<number>,
  comp1: CenterName,
  comp2: CenterName,
): boolean {
  const base = new Set(activeGates);
  for (let g = 1; g <= 64; g++) {
    if (base.has(g) || !GATE_CENTER[g]) continue;
    const trial = new Set(base);
    trial.add(g);
    if (centersConnected(trial, comp1, comp2)) return true;
  }
  return false;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Definition'ı hesaplar.
 *
 * @param definedCenters  Tanımlı merkezler.
 * @param definedChannels Tanımlı channel'lar (bileşen kenarları).
 * @param activeGates     Tüm aktif gate'ler (split-small/large köprü testi için).
 */
export function computeDefinition(
  definedCenters: ReadonlyArray<CenterName>,
  definedChannels: ReadonlyArray<Channel>,
  activeGates: ReadonlyArray<number>,
): DefinitionResult {
  const components = connectedComponents(definedCenters, definedChannels);
  const componentCount = components.length;

  let kind: DefinitionKind;
  if (componentCount === 0) {
    kind = "none";
  } else if (componentCount === 1) {
    kind = "single";
  } else if (componentCount === 2) {
    kind = isSmallSplit(activeGates, components[0][0], components[1][0])
      ? "split-small"
      : "split-large";
  } else if (componentCount === 3) {
    kind = "triple-split";
  } else {
    kind = "quad-split";
  }

  return {
    kind,
    componentCount,
    components,
    definedCenters: [...definedCenters],
  };
}
