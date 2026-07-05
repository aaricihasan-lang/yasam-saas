// Premium BodyGraph V3 — V3-0 render smoke.
//
// 7 golden chart için:
//   1) <PremiumBodyGraphV3> renderToStaticMarkup ile HATASIZ render
//   2) V3-0'da henüz merkez/gate YOK → polygon === 0 && circle === 0
//      (polygon=9 / circle=N invariant'ı V3-3/V3-4'te merkez/gate eklenince aktifleşir)
//   3) a11y desc'te doğru meta (N tanımlı merkez / M kanal / K kapı)
// Çalıştırma:  npx tsx scripts/hd-validation/bodygraph-v3/render_smoke_v3.mjs

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeHumanDesignChart } from "../../../lib/human-design/engine";
import { deriveActivation } from "../../../lib/human-design/bodygraph/deriveActivation";
import { PremiumBodyGraphV3 } from "../../../app/human-design/harita/components/premium-v3/PremiumBodyGraphV3";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, "..", "golden-dataset", "cases");
const IDS = ["HD-GOLD-0001", "HD-GOLD-0002", "HD-GOLD-0003", "HD-GOLD-0004", "HD-GOLD-0005", "HD-GOLD-0006", "HD-GOLD-0007"];

const errors = [];
console.log("Premium BodyGraph V3 — V3-0 render smoke (7 golden)\n");

for (const id of IDS) {
  const gold = JSON.parse(readFileSync(join(CASES, `${id}.json`), "utf-8"));
  const input = { date: gold.input.date, time: gold.input.time, timezone: gold.input.timezone };
  const result = computeHumanDesignChart(input);
  const d = deriveActivation(result.activations);
  const uniqGates = [...new Set(result.activations.map((a) => a.gate))];

  const checks = [];
  let html = "";
  try {
    html = renderToStaticMarkup(createElement(PremiumBodyGraphV3, { result }));
  } catch (e) {
    checks.push("render-threw:" + e.message);
  }
  const polys = (html.match(/<polygon/g) || []).length;
  const circles = (html.match(/<circle/g) || []).length;
  if (polys !== 0) checks.push(`polygons ${polys}!=0`);
  if (circles !== 0) checks.push(`circles ${circles}!=0`);
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
console.log(`\nCHECK: ${IDS.length}/${IDS.length} golden — PremiumBodyGraphV3 V3-0 render OK (iskele: polygon=0, circle=0, meta doğru).`);
