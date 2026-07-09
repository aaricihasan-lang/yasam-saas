// Premium BodyGraph V3 — V3-1 iskelet self-test.
//
// Kontroller:
//   - viewBox 480×800
//   - 9 spine node (tüm CENTERS), hepsi viewBox içinde
//   - 9 center zone (geçerli halfW/halfH, bounds viewBox içinde)
//   - merkez omurga sırası artan y (Head<Ajna<Throat<G<Sacral<Root)
//   - orbital band radii>0, üst yayları viewBox içinde
//   - yan slotlar (Spleen/SolarPlexus/Heart) viewBox içinde
//   - silüet knob'ları viewBox içinde
// Çalıştırma: npx tsx scripts/hd-validation/bodygraph-v3/geometry_selftest_v3.mjs

import { CENTERS, CHANNELS } from "../../../lib/human-design/engine/channels";
import { VIEWBOX_V3, BODY_PROPORTIONS } from "../../../lib/human-design/bodygraph-v3/skeleton/proportions";
import { buildSkeleton } from "../../../lib/human-design/bodygraph-v3/skeleton/skeleton";
import { deriveChannels } from "../../../lib/human-design/bodygraph-v3/derive/channels";
import { deriveCenters } from "../../../lib/human-design/bodygraph-v3/derive/centers";
import { deriveRoutes } from "../../../lib/human-design/bodygraph-v3/derive/routes";

const W = VIEWBOX_V3.width;
const H = VIEWBOX_V3.height;
const errors = [];
const inBox = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;

console.log("Premium BodyGraph V3 — V3-1 iskelet self-test\n");

const s = buildSkeleton();

// 1) viewBox
if (W !== 480 || H !== 800) errors.push(`viewBox ${W}x${H} != 480x800`);
console.log(`  1) viewBox: ${W}x${H}`);

// 2) spine node = 9, viewBox içinde
const nodeKeys = Object.keys(s.spineNodes);
if (nodeKeys.length !== 9) errors.push(`spine node ${nodeKeys.length}!=9`);
for (const c of CENTERS) {
  const n = s.spineNodes[c];
  if (!n) { errors.push(`spine node eksik: ${c}`); continue; }
  if (!inBox(n.x, n.y)) errors.push(`${c} node viewBox dışı (${n.x},${n.y})`);
}
console.log(`  2) spine node: ${nodeKeys.length}/9`);

// 3) center zone = 9, geçerli + bounds viewBox içinde
for (const c of CENTERS) {
  const z = s.centerZones[c];
  if (!z) { errors.push(`center zone eksik: ${c}`); continue; }
  if (z.halfW <= 0 || z.halfH <= 0) errors.push(`${c} zone geçersiz halfW/halfH`);
  if (!inBox(z.cx - z.halfW, z.cy - z.halfH) || !inBox(z.cx + z.halfW, z.cy + z.halfH))
    errors.push(`${c} zone bounds viewBox dışı`);
}
console.log(`  3) center zone: ${Object.keys(s.centerZones).length}/9`);

// 4) merkez omurga artan y sırası
const order = ["Head", "Ajna", "Throat", "G", "Sacral", "Root"];
for (let i = 1; i < order.length; i++) {
  if (BODY_PROPORTIONS.spineY[order[i]] <= BODY_PROPORTIONS.spineY[order[i - 1]])
    errors.push(`omurga sıra bozuk: ${order[i - 1]}>=${order[i]}`);
}
console.log(`  4) omurga ritmi: ${order.map((o) => BODY_PROPORTIONS.spineY[o]).join(" < ")}`);

// 5) orbital bantlar
if (!Array.isArray(s.orbitalBands.radii) || s.orbitalBands.radii.length < 1) errors.push("orbital radii boş");
for (const r of s.orbitalBands.radii) {
  if (r <= 0) errors.push(`orbital radius ${r}<=0`);
  const cx = s.orbitalBands.center.x, cy = s.orbitalBands.center.y;
  if (!inBox(cx - r, cy - r) || !inBox(cx + r, cy)) errors.push(`orbital yay r=${r} viewBox dışı`);
}
console.log(`  5) orbital bantlar: ${s.orbitalBands.radii.join(", ")} @ (${s.orbitalBands.center.x},${s.orbitalBands.center.y})`);

// 6) yan slotlar
for (const k of ["Spleen", "SolarPlexus", "Heart"]) {
  const p = s.sideSlots[k];
  if (!p || !inBox(p.x, p.y)) errors.push(`yan slot ${k} viewBox dışı`);
}
// 7) silüet knob'ları
const sil = s.silhouette;
for (const [name, y] of [["crownY", sil.crownY], ["shoulderY", sil.shoulder.y], ["waistY", sil.waist.y], ["hipY", sil.hip.y], ["taperY", sil.taperY]]) {
  if (y < 0 || y > H) errors.push(`silüet ${name}=${y} viewBox dışı`);
}
console.log(`  6-7) yan slot + silüet: OK-check`);

// 8) kanallar (V3-3): 36, her path çözünür (boş değil), engine CHANNELS ile birebir
const chs = deriveChannels(s);
if (chs.length !== 36) errors.push(`channel ${chs.length}!=36`);
const engineIds = new Set(CHANNELS.map((c) => c.id));
const v3Ids = new Set(chs.map((c) => c.id));
for (const ch of chs) {
  if (!ch.d || ch.d.length < 6) errors.push(`kanal ${ch.id}: boş path`);
  if (ch.kind !== "spine" && ch.kind !== "orbital") errors.push(`kanal ${ch.id}: geçersiz kind`);
  if (!engineIds.has(ch.id)) errors.push(`V3 kanalı engine'de yok: ${ch.id}`);
}
for (const id of engineIds) if (!v3Ids.has(id)) errors.push(`engine kanalı V3'te yok: ${id}`);
const spineN = chs.filter((c) => c.kind === "spine").length;
console.log(`  8) kanal: ${chs.length}/36 (spine ${spineN}, orbital ${chs.length - spineN}), engine birebir`);

// 8b) routing refactor: paylasilan ray sistemi. Ray sayisi <=7, her kanal routeId'li,
//     AYNI merkez-cifti kanallari AYNI path'i paylasir (paylasilan rib/omurga segmenti).
const routes = deriveRoutes(s);
if (routes.length > 7) errors.push(`ray ${routes.length}>7 (paylasim beklenenden fazla)`);
for (const rt of routes) if (!rt.d || rt.d.length < 6) errors.push(`ray ${rt.id}: bos path`);
const idPair = new Map(CHANNELS.map((c) => [c.id, [c.centerA, c.centerB].sort().join("|")]));
const byPair = new Map();
for (const ch of chs) {
  if (!ch.routeId) errors.push(`kanal ${ch.id}: routeId yok`);
  const pk = idPair.get(ch.id);
  if (!byPair.has(pk)) byPair.set(pk, []);
  byPair.get(pk).push(ch);
}
let sharedGroups = 0;
for (const [pk, list] of byPair) {
  if (list.length > 1) sharedGroups++;
  const d0 = list[0].d;
  for (const ch of list) if (ch.d !== d0) errors.push(`paylasim bozuk: ${pk} kanallari ayni path degil (${ch.id})`);
}
const uniquePaths = new Set(chs.map((c) => c.d)).size;
console.log(`  8b) routing: ${routes.length} paylasilan ray, ${uniquePaths} benzersiz path (36 kanal), ${sharedGroups} cok-kanalli paylasim grubu — tumu routeId'li`);

// 9) merkez sekilleri (V3-4): 9 polygon, her nokta KENDI zone bbox'i icinde (zone disina tasmaz)
const shapes = deriveCenters(s);
if (shapes.length !== 9) errors.push(`merkez sekli ${shapes.length}!=9`);
const shapeNames = new Set(shapes.map((sh) => sh.name));
for (const c of CENTERS) if (!shapeNames.has(c)) errors.push(`merkez sekli eksik: ${c}`);
const EPS = 0.001;
for (const sh of shapes) {
  const z = s.centerZones[sh.name];
  if (!z) { errors.push(`merkez ${sh.name}: zone yok`); continue; }
  if (sh.points.length < 3) errors.push(`merkez ${sh.name}: <3 nokta (polygon degil)`);
  const minX = z.cx - z.halfW, maxX = z.cx + z.halfW, minY = z.cy - z.halfH, maxY = z.cy + z.halfH;
  for (const p of sh.points) {
    if (p.x < minX - EPS || p.x > maxX + EPS || p.y < minY - EPS || p.y > maxY + EPS)
      errors.push(`merkez ${sh.name}: nokta (${p.x},${p.y}) zone bbox disi [${minX}..${maxX} x ${minY}..${maxY}]`);
    if (!inBox(p.x, p.y)) errors.push(`merkez ${sh.name}: nokta viewBox disi (${p.x},${p.y})`);
  }
}
console.log(`  9) merkez sekli: ${shapes.length}/9, tum noktalar kendi zone bbox'inde (tasma yok)`);

if (errors.length > 0) {
  console.error("\nCHECK BAŞARISIZ:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("\nCHECK: viewBox 480×800 + 9 spine node + 9 center zone + artan omurga ritmi + orbital bantlar + yan slot + silüet + 9 merkez şekli (zone içinde) — İSKELET OK.");
