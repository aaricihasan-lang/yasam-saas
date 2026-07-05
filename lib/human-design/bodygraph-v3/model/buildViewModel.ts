// Premium BodyGraph V3 — TEK motor dikişi (V2'den bağımsız kopya).
//
// Paylaşılan SAF selector'ları (deriveActivation, gateColor — bodygraph/, V2 DEĞİL) ve engine
// sabitlerini (CENTERS/CHANNELS/GATE_CENTER) kullanır. Motor/topoloji semantiği DEĞİŞMEZ.

import {
  CENTERS,
  CHANNELS,
  GATE_CENTER,
  type CenterName,
} from "@/lib/human-design/engine/channels";
import { deriveActivation, gateColor } from "@/lib/human-design/bodygraph/deriveActivation";
import type { HdChartResult } from "@/lib/human-design/engine/contract";
import type { BodyGraphViewModelV3 } from "./types";

export function buildViewModelV3(result: HdChartResult): BodyGraphViewModelV3 {
  const { gateMap, activeGates, definedChannels, definedCenters } = deriveActivation(
    result.activations,
  );
  const centerSet = new Set<CenterName>(definedCenters);
  const channelSet = new Set(definedChannels.map((c) => c.id));

  const gatesByCenter = {} as Record<CenterName, number[]>;
  for (const center of CENTERS) gatesByCenter[center] = [];
  for (const [gateKey, center] of Object.entries(GATE_CENTER)) {
    gatesByCenter[center].push(Number(gateKey));
  }
  for (const center of CENTERS) gatesByCenter[center].sort((a, b) => a - b);

  return {
    centers: CENTERS.map((name) => ({
      name,
      defined: centerSet.has(name),
      gates: gatesByCenter[name],
    })),
    channels: CHANNELS.map((c) => ({
      id: c.id,
      defined: channelSet.has(c.id),
      centerA: c.centerA,
      centerB: c.centerB,
      halfA: { gate: c.gateA, color: gateColor(c.gateA, gateMap) },
      halfB: { gate: c.gateB, color: gateColor(c.gateB, gateMap) },
    })),
    gates: Object.keys(GATE_CENTER)
      .map((gateKey) => {
        const gate = Number(gateKey);
        return {
          gate,
          center: GATE_CENTER[gate],
          active: !!gateMap[gate],
          color: gateColor(gate, gateMap),
        };
      })
      .sort((a, b) => a.gate - b.gate),
    meta: {
      definedCenters: definedCenters.length,
      definedChannels: definedChannels.length,
      activeGates: activeGates.length,
    },
  };
}
