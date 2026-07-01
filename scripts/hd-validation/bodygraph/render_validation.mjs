// FAZ 6 / ADIM 6b — BodyGraph render doğrulama.
//
// 7 golden chart için:
//   1) deriveActivation çıktısı == engine result (defined centers/channels/active gates)
//   2) cross gates-only + validation değişmedi
//   3) <BodyGraph> renderToStaticMarkup ile hatasız render + yapısal markerlar
//      (9 polygon merkez, aktif-gate çember sayısı, tanımlı kanal çizgileri)
// Çalıştırma:  npx tsx scripts/hd-validation/bodygraph/render_validation.mjs

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeHumanDesignChart } from "../../../lib/human-design/engine";
import { deriveActivation } from "../../../lib/human-design/bodygraph/deriveActivation";
import { BodyGraph } from "../../../app/human-design/harita/components/BodyGraph";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, "..", "golden-dataset", "cases");
const IDS = ["HD-GOLD-0001", "HD-GOLD-0002", "HD-GOLD-0003", "HD-GOLD-0004", "HD-GOLD-0005", "HD-GOLD-0006", "HD-GOLD-0007"];

const setEq = (a, b) => [...a].sort().join(",") === [...b].sort().join(",");
const errors = [];

console.log("FAZ 6 / ADIM 6b — BodyGraph render validation (7 golden)\n");

for (const id of IDS) {
  const gold = JSON.parse(readFileSync(join(CASES, `${id}.json`), "utf-8"));
  const input = { date: gold.input.date, time: gold.input.time, timezone: gold.input.timezone };
  const result = computeHumanDesignChart(input);
  const d = deriveActivation(result.activations);
  const uniqGates = [...new Set(result.activations.map((a) => a.gate))];

  const checks = [];
  // 1) türetim == engine result
  if (!setEq(d.definedCenters, result.centers.defined)) checks.push("definedCenters");
  if (!setEq(d.definedChannels.map((c) => c.id), result.channels.map((c) => c.id))) checks.push("definedChannels");
  if (!setEq(d.activeGates, uniqGates)) checks.push("activeGates");
  // 2) cross/status etkilenmedi
  if (result.incarnationCross.status !== "gates-only" || result.incarnationCross.name != null) checks.push("cross-gates-only");
  if (result.validation.overall !== "validated") checks.push("validation");

  // 3) render smoke
  let html = "";
  try {
    html = renderToStaticMarkup(createElement(BodyGraph, { result }));
  } catch (e) {
    checks.push("render-threw:" + e.message);
  }
  const polys = (html.match(/<polygon/g) || []).length;
  const circles = (html.match(/<circle/g) || []).length;
  if (polys !== 9) checks.push(`polygons ${polys}!=9`);
  if (circles !== uniqGates.length) checks.push(`gate-circles ${circles}!=${uniqGates.length}`);

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
console.log(`\nCHECK: ${IDS.length}/${IDS.length} golden — deriveActivation == engine + BodyGraph render OK (9 merkez, doğru kanal/gate).`);
