// FAZ 6 / ADIM 6a — BodyGraph layout topoloji doğrulama.
//
// layout.ts'i engine/channels topolojisine karşı doğrular (render YOK):
//   - 9 merkez şekli var mı
//   - 64 kapı anchor'ı var mı + doğru merkezde mi (GATE_CENTER ile)
//   - kapılar 1..64, tekil; koordinatlar viewBox içinde ve tekil
//   - 36 kanalın hepsi anchor'lara çözülüyor mu
// Çalıştırma:  npx tsx scripts/hd-validation/bodygraph/layout_topology.mjs

import {
  VIEWBOX,
  CENTER_SHAPES,
  GATE_ANCHORS,
  CHANNEL_SEGMENTS,
  CENTERS,
  CHANNELS,
  GATE_CENTER,
} from "../../../lib/human-design/bodygraph/layout";

const errors = [];
const fail = (m) => errors.push(m);

// 1) 9 merkez şekli
console.log("== 1) Merkez şekilleri (9) ==");
for (const c of CENTERS) {
  const s = CENTER_SHAPES[c];
  if (!s) fail(`merkez şekli yok: ${c}`);
  else if (!Array.isArray(s.points) || s.points.length < 3) fail(`${c}: şekil <3 nokta`);
  else if (!Number.isFinite(s.centroid?.x) || !Number.isFinite(s.centroid?.y)) fail(`${c}: centroid geçersiz`);
}
console.log(`  ${CENTERS.length} merkez, şekil eksiği: ${errors.length}`);

// 2) 64 kapı anchor + doğru merkez
console.log("== 2) Kapı anchor'ları (64) + merkez tutarlılığı ==");
const anchorGates = Object.keys(GATE_ANCHORS).map(Number);
if (anchorGates.length !== 64) fail(`anchor sayısı ${anchorGates.length} != 64`);
for (let g = 1; g <= 64; g++) {
  const a = GATE_ANCHORS[g];
  if (!a) { fail(`gate ${g}: anchor yok`); continue; }
  if (a.center !== GATE_CENTER[g]) fail(`gate ${g}: layout center ${a.center} != GATE_CENTER ${GATE_CENTER[g]}`);
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) fail(`gate ${g}: koordinat geçersiz`);
  if (a.x < 0 || a.x > VIEWBOX.width || a.y < 0 || a.y > VIEWBOX.height) fail(`gate ${g}: viewBox dışında (${a.x},${a.y})`);
}
// tekil koordinat
const seen = new Map();
for (let g = 1; g <= 64; g++) {
  const a = GATE_ANCHORS[g];
  if (!a) continue;
  const key = `${a.x},${a.y}`;
  if (seen.has(key)) fail(`çakışan koordinat: gate ${g} ve ${seen.get(key)} @ ${key}`);
  seen.set(key, g);
}
console.log(`  anchor: ${anchorGates.length}/64`);

// 3) 36 kanal çözülüyor mu
console.log("== 3) Kanallar (36) çözünürlüğü ==");
if (CHANNEL_SEGMENTS.length !== CHANNELS.length) {
  fail(`kanal segmenti ${CHANNEL_SEGMENTS.length} != ${CHANNELS.length} (bazı anchor eksik)`);
}
for (const seg of CHANNEL_SEGMENTS) {
  if (!Number.isFinite(seg.a?.x) || !Number.isFinite(seg.b?.x)) fail(`kanal ${seg.id}: uç koordinat geçersiz`);
}
console.log(`  segment: ${CHANNEL_SEGMENTS.length}/${CHANNELS.length}`);

if (errors.length > 0) {
  console.error("\nCHECK BAŞARISIZ:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nCHECK: 9 merkez + 64 kapı (doğru merkez) + 36 kanal topolojisi OK. (render yok)");
