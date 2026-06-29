// FAZ 3A — Human Design Engine. Graf katmanı smoke harness.
//
// 3 gerçek golden case için zinciri çalıştırır:
//   localDateTimeToUtc → AE provider → solveDesignTimeUtc → buildChartActivations
//   → buildChartGraph
// definedChannels ve definition'ı görsellerdeki referans değerlerle kıyaslar.
// Type/Authority KONTROL EDİLMEZ (FAZ 3B).
// Çalıştırma:  npx tsx scripts/hd-engine-graph-smoke.ts

import { readFileSync } from "node:fs";
import {
  localDateTimeToUtc,
  solveDesignTimeUtc,
  buildChartActivations,
  buildChartGraph,
  AstronomyEnginePlanetLongitudeProvider,
} from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

type Expected = { channels: string[]; definition: string };

const EXPECTED: Record<string, Expected> = {
  "HD-GOLD-0001": { channels: ["1-8", "9-52", "26-44", "28-38"], definition: "split-small" },
  "HD-GOLD-0002": { channels: ["3-60", "4-63", "23-43", "27-50"], definition: "split-large" },
  "HD-GOLD-0003": { channels: ["21-45", "39-55"], definition: "split-small" },
};

function norm(ids: string[]): string {
  return [...ids].sort().join(",");
}

function main(): void {
  console.log("FAZ 3A — graph smoke (channels/centers/definition). Type/Authority YOK.\n");

  const provider = new AstronomyEnginePlanetLongitudeProvider();
  const errors: string[] = [];

  for (const caseId of Object.keys(EXPECTED)) {
    const path = `scripts/hd-validation/golden-dataset/cases/${caseId}.json`;
    const gold = JSON.parse(readFileSync(path, "utf-8"));
    const input: HdBirthInput = {
      date: gold.input.date,
      time: gold.input.time,
      timezone: gold.input.timezone,
      location: { lat: gold.input.location.lat, lon: gold.input.location.lon },
    };

    const birthUtc = localDateTimeToUtc(input);
    const { designUtc } = solveDesignTimeUtc({ birthUtc, provider });
    const chart = buildChartActivations({ birthUtc, designUtc, provider });
    const graph = buildChartGraph(chart.activations);

    const channelIds = graph.definedChannels.map((c) => c.id);
    const exp = EXPECTED[caseId];

    const channelsOk = norm(channelIds) === norm(exp.channels);
    const defOk = graph.definition.kind === exp.definition;

    console.log(`── ${caseId} ──`);
    console.log(`  activeGates (${graph.activeGates.length}): ${graph.activeGates.join(", ")}`);
    console.log(`  definedChannels: ${channelIds.sort().join(", ")}`);
    console.log(`  definedCenters: ${graph.definedCenters.join(", ")}`);
    console.log(`  definition: ${graph.definition.kind} (componentCount=${graph.definition.componentCount})`);
    console.log(`  → channels ${channelsOk ? "OK" : "FAIL (beklenen " + norm(exp.channels) + ")"}, definition ${defOk ? "OK" : "FAIL (beklenen " + exp.definition + ")"}\n`);

    if (!channelsOk) errors.push(`${caseId}: channels ${norm(channelIds)} != ${norm(exp.channels)}`);
    if (!defOk) errors.push(`${caseId}: definition ${graph.definition.kind} != ${exp.definition}`);
  }

  if (errors.length > 0) {
    console.error("CHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("CHECK: 3/3 golden case channels + definition OK. (Type/Authority hesaplanmadı.)");
}

main();
