// Premium BodyGraph V2 — V2-1 geometri self-test.
//
// Kesin kontroller:
//   - merkez = 9 (geçerli points + centroid viewBox içinde)
//   - gate anchor = 64 (1..64 eksiksiz, doğru merkez = GATE_CENTER, viewBox içinde)
//   - channel path = 36 (iki uç anchor'a çözünür, endpoint == anchor)
//   - straight = 17, curved = 19
//   - kanal id'leri engine CHANNELS ile BİREBİR eşleşir (eksik/fazla YOK)
//   - eksik gate / fazla gate / yanlış merkez → FAIL
// Çalıştırma: npx tsx scripts/hd-validation/bodygraph-v2/geometry_selftest_v2.mjs

import { CENTERS, CHANNELS, GATE_CENTER } from "../../../lib/human-design/engine/channels";
import { VIEWBOX_V2 } from "../../../lib/human-design/bodygraph-v2/geometry/viewbox";
import { CENTER_GEOMETRY } from "../../../lib/human-design/bodygraph-v2/geometry/centers";
import { GATE_ANCHORS_V2 } from "../../../lib/human-design/bodygraph-v2/geometry/gates";
import {
  CHANNEL_PATHS_V2,
  normalizeChannelId,
} from "../../../lib/human-design/bodygraph-v2/geometry/channels";

const W = VIEWBOX_V2.width;
const H = VIEWBOX_V2.height;
const errors = [];
const inBox = (p) => p && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

console.log("Premium BodyGraph V2 — V2-1 geometri self-test\n");

// ── 1) Merkezler ──────────────────────────────────────────────────────────────
const centerKeys = Object.keys(CENTER_GEOMETRY);
if (centerKeys.length !== 9) errors.push(`merkez sayısı ${centerKeys.length}!=9`);
for (const name of CENTERS) {
  const c = CENTER_GEOMETRY[name];
  if (!c) { errors.push(`merkez eksik: ${name}`); continue; }
  if (!Array.isArray(c.points) || c.points.length < 3) errors.push(`${name}: geçersiz points`);
  if (c.points.some((p) => !inBox(p))) errors.push(`${name}: köşe viewBox dışında`);
  if (!inBox(c.centroid)) errors.push(`${name}: centroid viewBox dışında`);
}
console.log(`  1) merkez: ${centerKeys.length}/9`);

// ── 2) Gate anchor'lar ────────────────────────────────────────────────────────
const anchorGates = Object.keys(GATE_ANCHORS_V2).map(Number);
if (anchorGates.length !== 64) errors.push(`gate anchor sayısı ${anchorGates.length}!=64`);
for (let g = 1; g <= 64; g++) {
  const a = GATE_ANCHORS_V2[g];
  if (!a) { errors.push(`gate ${g} anchor eksik`); continue; }
  if (a.center !== GATE_CENTER[g]) errors.push(`gate ${g}: merkez ${a.center} != GATE_CENTER ${GATE_CENTER[g]}`);
  if (!inBox(a)) errors.push(`gate ${g}: anchor viewBox dışında (${a.x},${a.y})`);
}
// fazla/eksik gate (1..64 dışı anahtar)
for (const g of anchorGates) if (g < 1 || g > 64) errors.push(`geçersiz gate anahtarı: ${g}`);
console.log(`  2) gate anchor: ${anchorGates.length}/64`);

// ── 3) Kanal path'ler ─────────────────────────────────────────────────────────
if (CHANNEL_PATHS_V2.length !== 36) errors.push(`channel path sayısı ${CHANNEL_PATHS_V2.length}!=36`);
let straight = 0, curved = 0;
for (const ch of CHANNEL_PATHS_V2) {
  const a = GATE_ANCHORS_V2[ch.gateA];
  const b = GATE_ANCHORS_V2[ch.gateB];
  if (!a || !b) { errors.push(`kanal ${ch.id}: uç anchor çözülemedi`); continue; }
  if (a.x !== ch.a.x || a.y !== ch.a.y || b.x !== ch.b.x || b.y !== ch.b.y) errors.push(`kanal ${ch.id}: endpoint anchor ile uyuşmuyor`);
  if (ch.kind === "straight") straight++; else if (ch.kind === "curved") curved++; else errors.push(`kanal ${ch.id}: geçersiz kind`);
}
if (straight !== 17) errors.push(`straight ${straight}!=17`);
if (curved !== 19) errors.push(`curved ${curved}!=19`);
console.log(`  3) channel path: ${CHANNEL_PATHS_V2.length}/36 (straight ${straight}, curved ${curved})`);

// ── 4) Engine CHANNELS ile BİREBİR eşleşme ────────────────────────────────────
const engineIds = new Set(CHANNELS.map((c) => normalizeChannelId(c.gateA, c.gateB)));
const v2Ids = new Set(CHANNEL_PATHS_V2.map((c) => c.id));
for (const id of engineIds) if (!v2Ids.has(id)) errors.push(`engine kanalı V2'de yok: ${id}`);
for (const id of v2Ids) if (!engineIds.has(id)) errors.push(`V2 kanalı engine'de yok: ${id}`);
console.log(`  4) engine eşleşme: engine ${engineIds.size} / v2 ${v2Ids.size}`);

if (errors.length > 0) {
  console.error("\nCHECK BAŞARISIZ:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nCHECK: 9 merkez + 64 gate anchor (doğru merkez) + 36 kanal (17 düz / 19 kavisli) + engine birebir — GEOMETRİ OK.");
