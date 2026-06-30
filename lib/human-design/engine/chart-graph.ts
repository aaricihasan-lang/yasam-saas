// FAZ 3A/3B — Human Design Engine. Chart graf birleştirici.
//
// Doğrulanmış aktivasyonlardan deterministik HD grafiği üretir:
//   activeGates → definedChannels → definedCenters → definition (FAZ 3A)
//   → type + authority (FAZ 3B)

import {
  getActiveGates,
  getDefinedChannels,
  getDefinedCenters,
  type CenterName,
  type Channel,
} from "./channels";
import { computeDefinition, type DefinitionResult } from "./definition";
import {
  computeTypeAndAuthority,
  type HdAuthority,
  type HdType,
} from "./type-authority";

export type ChartGraph = {
  activeGates: number[];
  definedChannels: Channel[];
  definedCenters: CenterName[];
  definition: DefinitionResult;
  // FAZ 3B
  type: HdType;
  authority: HdAuthority;
  motorToThroat: boolean;
};

/**
 * Aktivasyon listesinden (yalnız .gate gerekir) chart grafiğini kurar.
 * Saf/deterministik.
 */
export function buildChartGraph(
  activations: ReadonlyArray<{ gate: number }>,
): ChartGraph {
  const activeGates = getActiveGates(activations);
  const definedChannels = getDefinedChannels(activeGates);
  const definedCenters = getDefinedCenters(definedChannels);
  const definition = computeDefinition(definedCenters, definedChannels, activeGates);
  const ta = computeTypeAndAuthority(definedCenters, definition.components);

  return {
    activeGates,
    definedChannels,
    definedCenters,
    definition,
    type: ta.type,
    authority: ta.authority,
    motorToThroat: ta.motorToThroat,
  };
}
