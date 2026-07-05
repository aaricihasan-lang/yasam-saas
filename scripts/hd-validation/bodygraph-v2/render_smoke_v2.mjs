// Premium BodyGraph V2 — render smoke (V2-2: invariant aktif).
//
// 7 golden chart için:
//   1) <PremiumBodyGraph> renderToStaticMarkup ile HATASIZ render
//   2) polygon === 9 (merkez) && circle === aktif gate sayısı (badge)
//   3) a11y desc'te doğru meta (N tanımlı merkez / M kanal / K kapı)
// Çalıştırma:  npx tsx scripts/hd-validation/bodygraph-v2/render_smoke_v2.mjs

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeHumanDesignChart } from "../../../lib/human-design/engine";
import { deriveActivation } from "../../../lib/human-design/bodygraph/deriveActivation";
import { PremiumBodyGraph } from "../../../app/human-design/harita/components/premium/PremiumBodyGraph";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, "..", "golden-dataset", "cases");
const IDS = ["HD-GOLD-0001", "HD-GOLD-0002", "HD-GOLD-0003", "HD-GOLD-0004", "HD-GOLD-0005", "HD-GOLD-0006", "HD-GOLD-0007"];

const errors = [];
console.log("Premium BodyGraph V2 — V2-0 render smoke (7 golden)\n");

for (const id of IDS) {
  const gold = JSON.parse(readFileSync(join(CASES, `${id}.json`), "utf-8"));
  const input = { date: gold.input.date, time: gold.input.time, timezone: gold.input.timezone };
  const result = computeHumanDesignChart(input);
  const d = deriveActivation(result.activations);
  const uniqGates = [...new Set(result.activations.map((a) => a.gate))];

  const checks = [];
  let html = "";
  try {
    html = renderToStaticMarkup(createElement(PremiumBodyGraph, { result }));
  } catch (e) {
    checks.push("render-threw:" + e.message);
  }
  const polys = (html.match(/<polygon/g) || []).length;
  const circles = (html.match(/<circle/g) || []).length;
  if (polys !== 9) checks.push(`polygons ${polys}!=9`);
  if (circles !== uniqGates.length) checks.push(`gate-circles ${circles}!=${uniqGates.length}`);
  // a11y meta doğru mu (VM == engine türetimi)
  if (!html.includes(`${d.definedCenters.length} tanımlı merkez`)) checks.push("desc-centers");
  if (!html.includes(`${d.definedChannels.length} tanımlı kanal`)) checks.push("desc-channels");
  if (!html.includes(`${uniqGates.length} aktif kapı`)) checks.push("desc-gates");

  console.log(
    `  ${id}: centers ${d.definedCenters.length}, channels ${d.definedChannels.length}, gates ${uniqGates.length}, ` +
      `polygons ${polys}, circles ${circles} → ${checks.length ? "FAIL [" + checks.join(", ") + "]" : "OK"}`,
  );
  for (const c of checks) errors.push(`${id}: ${c}`);
}

if (errors.length > 0) {
  console.error("\nCHECK BAŞARISIZ:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`\nCHECK: ${IDS.length}/${IDS.length} golden — PremiumBodyGraph V2 render OK (polygon=9, circle=N, meta doğru).`);
