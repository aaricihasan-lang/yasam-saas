// FAZ 5 / ADIM 2a — Route-level golden test (SAF compute katmanı).
//
// handleCompute'u 7 golden case'e karşı (HTTP-benzeri zarf) + negatif validation
// vakalarına karşı doğrular. Route/auth YOK — yalnız saf compute katmanı.
// Çalıştırma:  npx tsx scripts/hd-validation/api/route_golden.mjs
// (handleCompute .ts import ettiği için tsx ile çalıştırılır.)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleCompute } from "../../../lib/human-design/api/handleCompute";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, "..", "golden-dataset", "cases");

const EXPECTED = {
  "HD-GOLD-0001": { type: "Generator", authority: "Sacral", profile: "2/4", definition: "split-small", channels: ["1-8", "9-52", "26-44", "28-38"], cross: [30, 29, 14, 8] },
  "HD-GOLD-0002": { type: "Generator", authority: "Sacral", profile: "2/4", definition: "split-large", channels: ["3-60", "4-63", "23-43", "27-50"], cross: [56, 60, 3, 50] },
  "HD-GOLD-0003": { type: "Manifestor", authority: "Emotional", profile: "3/5", definition: "split-small", channels: ["21-45", "39-55"], cross: [45, 26, 22, 47] },
  "HD-GOLD-0004": { type: "Generator", authority: "Emotional", profile: "1/4", definition: "split-small", channels: ["6-59", "25-51", "30-41"], cross: [36, 6, 11, 12] },
  "HD-GOLD-0005": { type: "Manifestor", authority: "Splenic", profile: "5/1", definition: "single", channels: ["7-31", "18-58", "20-57"], cross: [3, 50, 41, 31] },
  "HD-GOLD-0006": { type: "Manifesting Generator", authority: "Emotional", profile: "1/3", definition: "single", channels: ["6-59", "17-62", "21-45", "35-36"], cross: [12, 11, 36, 6] },
  "HD-GOLD-0007": { type: "Manifestor", authority: "Emotional", profile: "6/2", definition: "triple-split", channels: ["12-22", "26-44", "47-64"], cross: [47, 22, 12, 11] },
};

const sortStr = (a) => [...a].sort().join(",");
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const errors = [];

// ── Pozitif: 7 golden case (location OMİT edilir → opsiyonel-location yolu da test) ──
console.log("FAZ 5 / ADIM 2a — route_golden (handleCompute)\n");
console.log("== Pozitif (7 golden) ==");
for (const id of Object.keys(EXPECTED)) {
  const gold = JSON.parse(readFileSync(join(CASES, `${id}.json`), "utf-8"));
  const raw = { date: gold.input.date, time: gold.input.time, timezone: gold.input.timezone };
  const res = handleCompute(raw);
  const exp = EXPECTED[id];

  const checks = [];
  if (res.status !== 200) checks.push(`status=${res.status}`);
  else {
    const d = res.body.data;
    if (!res.body.ok) checks.push("ok=false");
    if (d.schemaVersion !== "1.0") checks.push("schemaVersion");
    if (d.type !== exp.type) checks.push(`type=${d.type}`);
    if (d.authority !== exp.authority) checks.push(`authority=${d.authority}`);
    if (d.profile !== exp.profile) checks.push(`profile=${d.profile}`);
    if (d.definition.kind !== exp.definition) checks.push(`definition=${d.definition.kind}`);
    if (sortStr(d.channels.map((c) => c.id)) !== sortStr(exp.channels)) checks.push("channels");
    if (!arrEq(d.incarnationCross.gates, exp.cross)) checks.push("cross");
    if (d.incarnationCross.status !== "gates-only" || d.incarnationCross.name != null) checks.push("cross-gates-only");
    if (d.validation.overall !== "validated") checks.push("validation");
    if (d.activations.length !== 26) checks.push("activations");
  }
  console.log(`  ${id}: ${checks.length ? "FAIL [" + checks.join(", ") + "]" : "OK"}`);
  for (const c of checks) errors.push(`${id}: ${c}`);
}

// ── Negatif: validation ──
console.log("\n== Negatif (validation) ==");
const NEG = [
  { name: "null body", raw: null, code: "INVALID_BODY" },
  { name: "string body", raw: "x", code: "INVALID_BODY" },
  { name: "eksik date", raw: { time: "12:00", timezone: "Europe/Istanbul" }, code: "INVALID_DATE" },
  { name: "bozuk date", raw: { date: "1990-13-40", time: "12:00", timezone: "Europe/Istanbul" }, code: "INVALID_DATE" },
  { name: "Şubat 30", raw: { date: "1990-02-30", time: "12:00", timezone: "Europe/Istanbul" }, code: "INVALID_DATE" },
  { name: "yıl aralık dışı", raw: { date: "1700-01-01", time: "12:00", timezone: "Europe/Istanbul" }, code: "INVALID_DATE" },
  { name: "bozuk time", raw: { date: "1990-05-15", time: "25:99", timezone: "Europe/Istanbul" }, code: "INVALID_TIME" },
  { name: "bozuk tz", raw: { date: "1990-05-15", time: "12:00", timezone: "Mars/Olympus" }, code: "INVALID_TIMEZONE" },
  { name: "bozuk lat", raw: { date: "1990-05-15", time: "12:00", timezone: "Europe/Istanbul", location: { lat: 200, lon: 0 } }, code: "INVALID_LOCATION" },
  { name: "bozuk lon", raw: { date: "1990-05-15", time: "12:00", timezone: "Europe/Istanbul", location: { lat: 0, lon: 999 } }, code: "INVALID_LOCATION" },
];
for (const t of NEG) {
  const res = handleCompute(t.raw);
  const ok = res.status === 400 && res.body.ok === false && res.body.code === t.code;
  console.log(`  ${t.name}: ${ok ? "OK" : "FAIL (status=" + res.status + " code=" + (res.body && res.body.code) + " beklenen 400/" + t.code + ")"}`);
  if (!ok) errors.push(`neg ${t.name}: got ${res.status}/${res.body && res.body.code}`);
}

// ── Determinizm ──
console.log("\n== Determinizm ==");
{
  const raw = { date: "1987-02-14", time: "21:00", timezone: "Europe/Istanbul" };
  const a = JSON.stringify(handleCompute(raw));
  const b = JSON.stringify(handleCompute(raw));
  const ok = a === b;
  console.log(`  aynı input → aynı çıktı: ${ok ? "OK" : "FAIL"}`);
  if (!ok) errors.push("determinizm FAIL");
}

if (errors.length > 0) {
  console.error("\nCHECK BAŞARISIZ:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`\nCHECK: ${Object.keys(EXPECTED).length}/${Object.keys(EXPECTED).length} pozitif + ${NEG.length} negatif + determinizm OK.`);
