// FAZ 9B — HdChartResult → human_design_charts scalar kolonları (SAF).
//
// Hesaplanmış sonucun HAM değerleri kolonlara yazılır (manuel kod sözlüğüne
// map YAPILMAZ — karar 3). Doğruluk kaynağı computed_result JSON'dur; bu scalar
// kolonlar yalnız liste/arama kolaylığı içindir. 9D'de source'a göre dallanılır.
// Engine/compute matematiğine DOKUNMAZ; yalnız okuma + yeniden şekillendirme.

import type { HdChartResult } from "../engine";

export type ChartScalarColumns = {
  type_code: string;
  authority_code: string;
  profile_code: string;
  definition_code: string;
  active_centers: string[];
  open_centers: string[];
  gates: number[];
  channels: string[];
  engine_version: string;
  contract_version: string;
};

export function deriveChartColumns(result: HdChartResult): ChartScalarColumns {
  const gateSet = new Set<number>();
  for (const a of result.activations) gateSet.add(a.gate);

  return {
    type_code: result.type,
    authority_code: result.authority,
    profile_code: result.profile,
    definition_code: result.definition.kind,
    active_centers: [...result.centers.defined],
    open_centers: [...result.centers.open],
    gates: [...gateSet].sort((a, b) => a - b),
    channels: result.channels.map((c) => c.id),
    engine_version: result.meta.engine,
    contract_version: result.schemaVersion,
  };
}
