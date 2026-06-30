// FAZ 3A/3B/3C — Human Design Engine. Chart graf birleştirici.
//
// Doğrulanmış aktivasyonlardan deterministik HD grafiği üretir:
//   activeGates → definedChannels → definedCenters → definition (3A)
//   → type + authority (3B) → profile + incarnation cross (3C)

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
import {
  computeProfile,
  computeIncarnationCross,
  type IncarnationCross,
} from "./profile-cross";
import type { ChartActivation } from "./chart-activations";

export type ChartGraph = {
  activeGates: number[];
  definedChannels: Channel[];
  definedCenters: CenterName[];
  definition: DefinitionResult;
  // FAZ 3B
  type: HdType;
  authority: HdAuthority;
  motorToThroat: boolean;
  // FAZ 3C
  profile: string; // "2/4"
  incarnationCross: IncarnationCross;
};

/**
 * Aktivasyon listesinden chart grafiğini kurar. Saf/deterministik.
 * activeGates/channels/centers/definition/type/authority için yalnız .gate;
 * profile/incarnation cross için body/side/line gerekir → ChartActivation[].
 */
export function buildChartGraph(
  activations: ReadonlyArray<ChartActivation>,
): ChartGraph {
  const activeGates = getActiveGates(activations);
  const definedChannels = getDefinedChannels(activeGates);
  const definedCenters = getDefinedCenters(definedChannels);
  const definition = computeDefinition(definedCenters, definedChannels, activeGates);
  const ta = computeTypeAndAuthority(definedCenters, definition.components);
  const profile = computeProfile(activations);
  const incarnationCross = computeIncarnationCross(activations);

  return {
    activeGates,
    definedChannels,
    definedCenters,
    definition,
    type: ta.type,
    authority: ta.authority,
    motorToThroat: ta.motorToThroat,
    profile: profile.profile,
    incarnationCross,
  };
}
