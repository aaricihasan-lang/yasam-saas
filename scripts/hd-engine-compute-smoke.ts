// FAZ 5 / ADIM 1 — Human Design Engine. Üretim giriş noktası smoke harness.
//
// computeHumanDesignChart'ı 7 gerçek golden case'e karşı doğrular:
//   type, authority, profile, definition, channels, cross-gates
//   + validation.overall="validated", cross status="gates-only", 0 warning.
// Çalıştırma:  npx tsx scripts/hd-engine-compute-smoke.ts

import { readFileSync } from "node:fs";
import { computeHumanDesignChart } from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

type Expected = {
  type: string;
  authority: string;
  profile: string;
  definition: string;
  channels: string[];
  cross: [number, number, number, number];
};

const EXPECTED: Record<string, Expected> = {
  "HD-GOLD-0001": { type: "Generator", authority: "Sacral", profile: "2/4", definition: "split-small", channels: ["1-8", "9-52", "26-44", "28-38"], cross: [30, 29, 14, 8] },
  "HD-GOLD-0002": { type: "Generator", authority: "Sacral", profile: "2/4", definition: "split-large", channels: ["3-60", "4-63", "23-43", "27-50"], cross: [56, 60, 3, 50] },
  "HD-GOLD-0003": { type: "Manifestor", authority: "Emotional", profile: "3/5", definition: "split-small", channels: ["21-45", "39-55"], cross: [45, 26, 22, 47] },
  "HD-GOLD-0004": { type: "Generator", authority: "Emotional", profile: "1/4", definition: "split-small", channels: ["6-59", "25-51", "30-41"], cross: [36, 6, 11, 12] },
  "HD-GOLD-0005": { type: "Manifestor", authority: "Splenic", profile: "5/1", definition: "single", channels: ["7-31", "18-58", "20-57"], cross: [3, 50, 41, 31] },
  "HD-GOLD-0006": { type: "Manifesting Generator", authority: "Emotional", profile: "1/3", definition: "single", channels: ["6-59", "17-62", "21-45", "35-36"], cross: [12, 11, 36, 6] },
  "HD-GOLD-0007": { type: "Manifestor", authority: "Emotional", profile: "6/2", definition: "triple-split", channels: ["12-22", "26-44", "47-64"], cross: [47, 22, 12, 11] },
};

function sortStr(a: string[]): string {
  return [...a].sort().join(",");
}
function arrEq(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function main(): void {
  console.log("FAZ 5 / ADIM 1 — computeHumanDesignChart smoke (7 golden case)\n");

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

    const r = computeHumanDesignChart(input);
    const exp = EXPECTED[caseId];

    const channelIds = r.channels.map((c) => c.id);
    const checks: Array<[string, boolean]> = [
      ["schemaVersion", r.schemaVersion === "1.0"],
      ["activations=26", r.activations.length === 26],
      ["type", r.type === exp.type],
      ["authority", r.authority === exp.authority],
      ["profile", r.profile === exp.profile],
      ["definition", r.definition.kind === exp.definition],
      ["channels", sortStr(channelIds) === sortStr(exp.channels)],
      ["crossGates", arrEq(r.incarnationCross.gates, exp.cross)],
      ["cross gates-only", r.incarnationCross.status === "gates-only" && r.incarnationCross.name == null],
      ["validation=validated", r.validation.overall === "validated"],
      ["0 warnings", r.warnings.length === 0],
      ["centers 9", r.centers.defined.length + r.centers.open.length === 9],
    ];

    const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
    console.log(`── ${caseId}: ${r.type} / ${r.authority} / ${r.profile} / ${r.definition.kind} → ${failed.length ? "FAIL [" + failed.join(", ") + "]" : "OK"}`);
    for (const f of failed) errors.push(`${caseId}: ${f}`);
  }

  if (errors.length > 0) {
    console.error("\nCHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`\nCHECK: ${Object.keys(EXPECTED).length}/${Object.keys(EXPECTED).length} golden case computeHumanDesignChart sözleşmesi OK. (cross gates-only; validation=validated)`);
}

main();
