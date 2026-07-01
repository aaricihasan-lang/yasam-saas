// FAZ 3C — Human Design Engine. Profile + Incarnation Cross smoke harness.
//
// 3 gerçek golden case için profile + cross gates'i doğrular.
// Cross TEMA ADI doğrulanmaz (referans tablo yok) — yalnız raporlanır.
// Çalıştırma:  npx tsx scripts/hd-engine-profile-cross-smoke.ts

import { readFileSync } from "node:fs";
import {
  localDateTimeToUtc,
  solveDesignTimeUtc,
  buildChartActivations,
  buildChartGraph,
  AstronomyEnginePlanetLongitudeProvider,
} from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

type Expected = {
  profile: string;
  crossGates: [number, number, number, number];
  angle: string;
  gmName: string; // yalnız bağlam — doğrulanmaz (tablo yok)
};

const EXPECTED: Record<string, Expected> = {
  "HD-GOLD-0001": { profile: "2/4", crossGates: [30, 29, 14, 8], angle: "Right Angle", gmName: "RAX Contagion 1" },
  "HD-GOLD-0002": { profile: "2/4", crossGates: [56, 60, 3, 50], angle: "Right Angle", gmName: "RAX Laws 2" },
  "HD-GOLD-0003": { profile: "3/5", crossGates: [45, 26, 22, 47], angle: "Right Angle", gmName: "RAX Rulership 2" },
  "HD-GOLD-0004": { profile: "1/4", crossGates: [36, 6, 11, 12], angle: "Right Angle", gmName: "RAX Eden 1" },
  "HD-GOLD-0005": { profile: "5/1", crossGates: [3, 50, 41, 31], angle: "Left Angle", gmName: "LAX Wishes 1" },
  "HD-GOLD-0006": { profile: "1/3", crossGates: [12, 11, 36, 6], angle: "Right Angle", gmName: "RAX Eden 2" },
  "HD-GOLD-0007": { profile: "6/2", crossGates: [47, 22, 12, 11], angle: "Left Angle", gmName: "LAX Informing 2" },
};

function arrEq(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function main(): void {
  console.log("FAZ 3C — profile + incarnation cross smoke (3 golden case)\n");
  console.log("NOT: cross TEMA ADI referans tablosu repoda YOK → ad doğrulanmıyor (status gates-only).\n");

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
    const cross = graph.incarnationCross;
    const profileOk = graph.profile === exp.profile;
    const gatesOk = arrEq(cross.gates, exp.crossGates);
    const angleOk = cross.angle === exp.angle; // bonus (deterministik)

    console.log(`── ${caseId} ── (görsel referans: ${exp.gmName})`);
    console.log(`  profile:    ${graph.profile}  ${profileOk ? "OK" : "FAIL (beklenen " + exp.profile + ")"}`);
    console.log(`  crossGates: ${cross.gates.join("/")}  ${gatesOk ? "OK" : "FAIL (beklenen " + exp.crossGates.join("/") + ")"}`);
    console.log(`  angle:      ${cross.angle}  ${angleOk ? "OK" : "FAIL (beklenen " + exp.angle + ")"}`);
    console.log(`  crossName:  ${cross.name ?? "(yok)"}  status=${cross.status} → tema adı doğrulanmadı\n`);

    if (!profileOk) errors.push(`${caseId}: profile ${graph.profile} != ${exp.profile}`);
    if (!gatesOk) errors.push(`${caseId}: crossGates ${cross.gates.join("/")} != ${exp.crossGates.join("/")}`);
    if (!angleOk) errors.push(`${caseId}: angle ${cross.angle} != ${exp.angle}`);
  }

  if (errors.length > 0) {
    console.error("CHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`CHECK: ${Object.keys(EXPECTED).length}/${Object.keys(EXPECTED).length} profile + cross gates + angle OK. (Cross tema adı: tablo yok → doğrulanmadı.)`);
}

main();
