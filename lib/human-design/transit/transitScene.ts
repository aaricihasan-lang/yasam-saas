// Human Design transit → mevcut premium BodyGraph sahnesinin GİRDİ durumu (SAF). Sahne kodu, geometri ve renkler
// DEĞİŞMEZ; yalnız transit verisi mevcut CbgState biçimine çevrilir (Connection paleti: A mavi = natal, B turuncu = transit).
//   • Kanal yalnız iki kapısı da aktifse "defined"; tek kapı → "half" (kesikli; tamamlanmış görünmez).
//   • Tanımlı merkezler yalnız tanımlı kanallardan.

import { CHANNELS, getDefinedCenters, type Channel } from "../engine/channels";
import type { CbgChannel, CbgState } from "../relations/connectionBodygraphScene";
import type { Holder } from "../relations/compositeModel";
import type { GeneralTransit } from "./generalTransit";

/** Transit tonu (Connection paletindeki B = turuncu). Natal (kişisel transit) = A = mavi. */
export const TRANSIT_HOLDER: Holder = "B";
export const NATAL_HOLDER: Holder = "A";

function stateFromHolders(holderOf: (gate: number) => Holder | null): CbgState {
  const gates: Record<number, Holder | null> = {};
  for (let g = 1; g <= 64; g++) gates[g] = holderOf(g);
  const channels: Record<string, CbgChannel> = {};
  const defined: Channel[] = [];
  for (const ch of CHANNELS) {
    const lo = Math.min(ch.gateA, ch.gateB);
    const hi = Math.max(ch.gateA, ch.gateB);
    const hA = gates[lo];
    const hB = gates[hi];
    if (hA && hB) {
      channels[ch.id] = { id: ch.id, state: "defined", holderA: hA, holderB: hB };
      defined.push(ch);
    } else if (hA || hB) channels[ch.id] = { id: ch.id, state: "half", holderA: hA, holderB: hB };
    else channels[ch.id] = { id: ch.id, state: "none" };
  }
  return { gates, channels, definedCenters: new Set<string>(getDefinedCenters(defined)), full: true, palette: "connection", halfStyle: "dashed" };
}

/** Genel transit: yalnız transit kapıları (turuncu). */
export function transitSceneState(t: GeneralTransit): CbgState {
  const active = new Set(t.activeGates);
  return stateFromHolders((g) => (active.has(g) ? TRANSIT_HOLDER : null));
}

/** Kişisel transit: natal kapılar mavi, transit kapıları turuncu, ikisinde de olan kapı iki renkli. */
export function overlaySceneState(natalGates: Iterable<number>, transitGates: Iterable<number>): CbgState {
  const n = new Set(natalGates);
  const t = new Set(transitGates);
  return stateFromHolders((g) => (n.has(g) && t.has(g) ? "both" : n.has(g) ? NATAL_HOLDER : t.has(g) ? TRANSIT_HOLDER : null));
}
