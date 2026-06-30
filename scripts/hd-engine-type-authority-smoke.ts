// FAZ 3B — Human Design Engine. Type + Authority smoke harness.
//
// 3 gerçek golden case için zinciri çalıştırır ve type + authority'yi
// görsellerdeki (Genetic Matrix) referans değerlerle kıyaslar.
// Çalıştırma:  npx tsx scripts/hd-engine-type-authority-smoke.ts

import { readFileSync } from "node:fs";
import {
  localDateTimeToUtc,
  solveDesignTimeUtc,
  buildChartActivations,
  buildChartGraph,
  AstronomyEnginePlanetLongitudeProvider,
} from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

// Genetic Matrix etiketleri → kanonik karşılık:
//   "Pure Generator" → Generator · "Emotional Manifestor" → Manifestor
//   "Solar Plexus" (Inner Authority) → Emotional
type Expected = { type: string; authority: string; gmLabel: string };

const EXPECTED: Record<string, Expected> = {
  "HD-GOLD-0001": { type: "Generator", authority: "Sacral",    gmLabel: "Pure Generator / Sacral" },
  "HD-GOLD-0002": { type: "Generator", authority: "Sacral",    gmLabel: "Pure Generator / Sacral" },
  "HD-GOLD-0003": { type: "Manifestor", authority: "Emotional", gmLabel: "Emotional Manifestor / Solar Plexus" },
};

function main(): void {
  console.log("FAZ 3B — type + authority smoke (3 golden case)\n");

  const provider = new AstronomyEnginePlanetLongitudeProvider();
  const errors: string[] = [];

  for (const caseId of Object.keys(EXPECTED)) {
    const gold = JSON.parse(
      readFileSync(`scripts/hd-validation/golden-dataset/cases/${caseId}.json`, "utf-8"),
    );
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

    const exp = EXPECTED[caseId];
    const typeOk = graph.type === exp.type;
    const authOk = graph.authority === exp.authority;

    console.log(`── ${caseId} ── (referans: ${exp.gmLabel})`);
    console.log(`  type:      ${graph.type}  ${typeOk ? "OK" : "FAIL (beklenen " + exp.type + ")"}`);
    console.log(`  authority: ${graph.authority}  ${authOk ? "OK" : "FAIL (beklenen " + exp.authority + ")"}`);
    console.log(`  motorToThroat: ${graph.motorToThroat}, definition: ${graph.definition.kind}\n`);

    if (!typeOk) errors.push(`${caseId}: type ${graph.type} != ${exp.type}`);
    if (!authOk) errors.push(`${caseId}: authority ${graph.authority} != ${exp.authority}`);
  }

  if (errors.length > 0) {
    console.error("CHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("CHECK: 3/3 golden case type + authority OK.");
}

main();
