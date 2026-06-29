// FAZ 3A — Human Design Engine. Chart graf birleştirici.
//
// Doğrulanmış aktivasyonlardan deterministik HD grafiği üretir:
//   activeGates → definedChannels → definedCenters → definition
// Type/Authority YOK (FAZ 3B).

import {
  getActiveGates,
  getDefinedChannels,
  getDefinedCenters,
  type CenterName,
  type Channel,
} from "./channels";
import { computeDefinition, type DefinitionResult } from "./definition";

export type ChartGraph = {
  activeGates: number[];
  definedChannels: Channel[];
  definedCenters: CenterName[];
  definition: DefinitionResult;
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

  return { activeGates, definedChannels, definedCenters, definition };
}
