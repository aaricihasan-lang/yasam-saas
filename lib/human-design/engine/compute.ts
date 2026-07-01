// FAZ 5 / ADIM 1 — Human Design Engine. ÜRETİM GİRİŞ NOKTASI.
//
// computeHumanDesignChart: doğrulanmış engine fonksiyonlarını TEK güvenli üretim
// akışında birleştirir. Yeni algoritma YOK — yalnız kompozisyon.
//
//   input → localDateTimeToUtc → solveDesignTimeUtc → buildChartActivations
//         → buildChartGraph → annotateValidationStatus → HdChartResult
//
// GÜVENLİK: AE provider İÇERİDE sabitlenir; mock provider bu yola giremez.

import { AstronomyEnginePlanetLongitudeProvider } from "./ae-provider";
import { localDateTimeToUtc } from "./time";
import { solveDesignTimeUtc } from "./design-solver";
import { buildChartActivations } from "./chart-activations";
import { buildChartGraph } from "./chart-graph";
import { CENTERS, type CenterName } from "./channels";
import { annotateValidationStatus } from "./validation-status";
import type { HdBirthInput } from "./types";
import type { HdChartResult } from "./contract";

const DISCLAIMER =
  "Deterministik HD hesabı (gate/line → channels → centers → definition → type → " +
  "authority → profile → cross-gates), 7 gerçek golden case ile doğrulanmıştır. " +
  "Cross tema adı gates-only (referans tablosu yok). Doğrulanmamış kapsamlar " +
  "validation.reasons'da, per-chart uyarılar warnings'te işaretlidir.";

/**
 * Üretim giriş noktası: ham doğum girdisinden tam deterministik HD chart'ı üretir.
 * AE provider (astronomy-engine) içeride sabittir; mock KULLANILAMAZ.
 * Saf/deterministik: aynı input → aynı çıktı.
 */
export function computeHumanDesignChart(input: HdBirthInput): HdChartResult {
  const provider = new AstronomyEnginePlanetLongitudeProvider();

  const birthUtc = localDateTimeToUtc(input);
  const { designUtc, daysBeforeBirth } = solveDesignTimeUtc({ birthUtc, provider });
  const chart = buildChartActivations({ birthUtc, designUtc, provider });
  const graph = buildChartGraph(chart.activations);

  const definedSet = new Set<CenterName>(graph.definedCenters);
  const openCenters = CENTERS.filter((c) => !definedSet.has(c));

  const warnings: string[] = [];
  for (const a of chart.activations) {
    if (a.boundaryFlag) {
      warnings.push(
        `Sınır: ${a.side}.${a.body} (gate ${a.gate} line ${a.line}) gate/line sınırına ` +
          `çok yakın; doğum saati belirsizliği sonucu etkileyebilir.`,
      );
    }
  }

  const validation = annotateValidationStatus({
    type: graph.type,
    authority: graph.authority,
    definitionKind: graph.definition.kind,
    crossAngle: graph.incarnationCross.angle,
  });

  return {
    schemaVersion: "1.0",
    meta: {
      engine: "astronomy-engine 2.1.19",
      nodeType: provider.metadata?.nodeType ?? "true",
      calibrationStatus: "validated",
      disclaimer: DISCLAIMER,
    },
    input,
    timing: {
      birthUtcIso: birthUtc.toISOString(),
      designUtcIso: designUtc.toISOString(),
      daysBeforeBirth,
    },
    activations: chart.activations,
    type: graph.type,
    authority: graph.authority,
    profile: graph.profile,
    definition: {
      kind: graph.definition.kind,
      componentCount: graph.definition.componentCount,
      definedCenters: graph.definition.definedCenters,
    },
    centers: { defined: graph.definedCenters, open: openCenters },
    channels: graph.definedChannels.map((c) => ({
      id: c.id,
      name: c.name,
      gates: [c.gateA, c.gateB] as [number, number],
      centers: [c.centerA, c.centerB] as [CenterName, CenterName],
    })),
    incarnationCross: graph.incarnationCross,
    validation,
    warnings,
  };
}
