// FAZ 6 / ADIM 6b — BodyGraph aktivasyon türetimi (SAF).
//
// activations[] → gate bazlı Personality/Design haritası + tanımlı channel/center.
// Topoloji için engine/channels'ın SAF fonksiyonlarını YENİDEN KULLANIR
// (getActiveGates/getDefinedChannels/getDefinedCenters) → render topolojisi = engine
// topolojisi. Yeni algoritma/hesaplama YOK. astronomy-engine bağımlılığı YOK.

import {
  getActiveGates,
  getDefinedChannels,
  getDefinedCenters,
  type Channel,
  type CenterName,
} from "../engine/channels";

export type GateSide = { personality: boolean; design: boolean };

export type ActivationDerived = {
  /** gate → hangi taraf(lar)ca aktive edildi. */
  gateMap: Record<number, GateSide>;
  activeGates: number[];
  definedChannels: Channel[];
  definedCenters: CenterName[];
};

export function deriveActivation(
  activations: ReadonlyArray<{ gate: number; side: "personality" | "design" }>,
): ActivationDerived {
  const gateMap: Record<number, GateSide> = {};
  for (const a of activations) {
    const cur = gateMap[a.gate] ?? { personality: false, design: false };
    if (a.side === "personality") cur.personality = true;
    else cur.design = true;
    gateMap[a.gate] = cur;
  }

  const activeGates = getActiveGates(activations);
  const definedChannels = getDefinedChannels(activeGates);
  const definedCenters = getDefinedCenters(definedChannels);

  return { gateMap, activeGates, definedChannels, definedCenters };
}

/** Bir kapının render rengi: "black" (P), "red" (D), "both", ya da null (pasif). */
export function gateColor(
  gate: number,
  gateMap: Record<number, GateSide>,
): "black" | "red" | "both" | null {
  const s = gateMap[gate];
  if (!s) return null;
  if (s.personality && s.design) return "both";
  return s.design ? "red" : "black";
}
