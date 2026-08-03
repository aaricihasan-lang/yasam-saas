/**
 * HD Danışmanlık F0B · Harita Normalizasyon Harness
 * =================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. GERÇEK normalizeChart + canonicalKeys +
 * constants import edilir (kopya YOK). Herhangi bir FAIL → exit 1.
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/hd-consultation/normalize-chart-harness.mjs
 */
import {
  normalizeChartToCanonicalKeys,
  normalizeChartToKeySet,
} from "@/lib/human-design/consultation/normalizeChart";
import { UnknownChartValueError } from "@/lib/human-design/consultation/errors";
import { parseHdCanonicalKey } from "@/lib/human-design/knowledge-system/canonicalKeys";
import {
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_TYPES,
} from "@/lib/human-design/constants";

let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(desc);
    console.log(`  FAIL  ${desc}`);
  }
}
function expectThrow(desc, fn) {
  try {
    fn();
    check(`${desc} (UnknownChartValueError beklendi)`, false);
  } catch (e) {
    check(desc, e instanceof UnknownChartValueError);
  }
}

// ── Tip: 5 RAW + 5 manual ───────────────────────────────────────────────────
for (const t of HUMAN_DESIGN_TYPES) {
  check(`Tip manual ${t.code}`, normalizeChartToCanonicalKeys({ type_code: t.code })[0] === `tip_${t.code}`);
  // Engine RAW = constants label (Tip için birebir)
  check(`Tip RAW "${t.label}"`, normalizeChartToCanonicalKeys({ type_code: t.label })[0] === `tip_${t.code}`);
}
expectThrow("Tip bilinmeyen 'Manifestör-TR'", () => normalizeChartToCanonicalKeys({ type_code: "Manifestör" }));
expectThrow("Tip bilinmeyen 'xyz'", () => normalizeChartToCanonicalKeys({ type_code: "xyz" }));

// ── Otorite: 7 RAW + 7 manual (Ego/Self-Projected/Mental özel) ───────────────
const AUTH_RAW = [
  ["Emotional", "emotional"],
  ["Sacral", "sacral"],
  ["Splenic", "splenic"],
  ["Ego", "ego_heart"],
  ["Self-Projected", "self_projected"],
  ["Mental", "mental_environmental"],
  ["Lunar", "lunar"],
];
for (const a of HUMAN_DESIGN_AUTHORITIES) {
  check(`Otorite manual ${a.code}`, normalizeChartToCanonicalKeys({ authority_code: a.code })[0] === `otorite_${a.code}`);
}
for (const [raw, code] of AUTH_RAW) {
  check(`Otorite RAW "${raw}"→${code}`, normalizeChartToCanonicalKeys({ authority_code: raw })[0] === `otorite_${code}`);
}
// Özellikle lowercase-olmayan 3 eşleme
check("Ego→ego_heart", normalizeChartToCanonicalKeys({ authority_code: "Ego" })[0] === "otorite_ego_heart");
check("Self-Projected→self_projected", normalizeChartToCanonicalKeys({ authority_code: "Self-Projected" })[0] === "otorite_self_projected");
check("Mental→mental_environmental", normalizeChartToCanonicalKeys({ authority_code: "Mental" })[0] === "otorite_mental_environmental");
expectThrow("Otorite bilinmeyen 'ego'", () => normalizeChartToCanonicalKeys({ authority_code: "ego" })); // yanlış manuel biçim
expectThrow("Otorite bilinmeyen 'None'", () => normalizeChartToCanonicalKeys({ authority_code: "None" }));

// ── Kapı: 1..64 pozitif + reddedilenler ─────────────────────────────────────
for (let g = 1; g <= 64; g++) {
  check(`Kapı ${g}`, normalizeChartToCanonicalKeys({ gates: [g] })[0] === `kapi_${g}`);
}
for (const bad of [0, 65, -1, 1.5, "12", NaN]) {
  expectThrow(`Kapı reddi ${JSON.stringify(bad)}`, () => normalizeChartToCanonicalKeys({ gates: [bad] }));
}

// ── Kanal: 36 resmî pozitif + reddedilenler ─────────────────────────────────
for (const ch of HUMAN_DESIGN_CHANNELS) {
  const expected = `kanal_${ch.code.replace(/-/g, "_")}`;
  check(`Kanal ${ch.code}`, normalizeChartToCanonicalKeys({ channels: [ch.code] })[0] === expected);
}
const first = HUMAN_DESIGN_CHANNELS[0].code; // "1-8"
const [ga, gb] = first.split("-");
expectThrow(`Kanal ters yön ${gb}-${ga}`, () => normalizeChartToCanonicalKeys({ channels: [`${gb}-${ga}`] }));
expectThrow("Kanal gerçek değil 1-2", () => normalizeChartToCanonicalKeys({ channels: ["1-2"] }));
expectThrow(`Kanal baştaki sıfır 0${first}`, () => normalizeChartToCanonicalKeys({ channels: [`0${ga}-${gb}`] }));

// ── Round-trip: normalize çıktısı gerçek parser ile çözülebilmeli ───────────
const fullChart = {
  type_code: "Manifesting Generator",
  authority_code: "Emotional",
  gates: [34, 57, 10, 20],
  channels: ["10-20", "34-57"],
};
const keys = normalizeChartToCanonicalKeys(fullChart);
check("Round-trip: her key parse edilebilir", keys.every((k) => parseHdCanonicalKey(k) !== null));
check("Round-trip: 4 aile de mevcut", ["tip", "otorite", "kapi", "kanal"].every((kind) => keys.some((k) => parseHdCanonicalKey(k)?.kind === kind)));

// ── Dedup + deterministik sıra + kapsam ─────────────────────────────────────
const dup = normalizeChartToCanonicalKeys({ gates: [10, 10, 5, 5], channels: ["34-57", "34-57"] });
check("Dedup: tekrarsız", new Set(dup).size === dup.length);
const order1 = normalizeChartToCanonicalKeys({ gates: [20, 10], channels: ["34-57", "10-20"] });
const order2 = normalizeChartToCanonicalKeys({ gates: [10, 20], channels: ["10-20", "34-57"] });
check("Deterministik: girdi sırası çıktıyı değiştirmez", JSON.stringify(order1) === JSON.stringify(order2));
check("Kapsam: yalnız tip/otorite/kapi/kanal", keys.every((k) => ["tip", "otorite", "kapi", "kanal"].includes(parseHdCanonicalKey(k)?.kind)));

// ── NULL/boş alan = değer yok (atlanır, hata değil) ─────────────────────────
check("NULL type_code atlanır", normalizeChartToCanonicalKeys({ type_code: null, gates: [1] }).length === 1);
check("boş authority atlanır", normalizeChartToCanonicalKeys({ authority_code: "   ", gates: [1] }).length === 1);
check("Tümü boş → []", normalizeChartToCanonicalKeys({}).length === 0);
check("keySet üyelik", normalizeChartToKeySet(fullChart).has("kanal_34_57"));

console.log(`\nnormalize-chart-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
