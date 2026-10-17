/**
 * Birleşik BodyGraph geometrisi doğrulaması (SAF): topoloji + çakışma ölçümleri.
 *   G1 her kapı kendi merkezinde (çokgen içinde / kenarına ≤ 3px)
 *   G2 her kanal güzergâhı kendi iki kapısını bağlar; 36 kanal
 *   G3 hiçbir kanal kendi iki merkezi DIŞINDAKİ bir merkezin içinden geçmez
 *   G4 hiçbir kanal başka bir kapının rozetine (r=7.5) değmez
 *   G5 kritik kanallar (7-31, 1-8, 13-33, 10-20, 21-45) başka hiçbir kanalla kesişmez
 *   G6 kapı rozetleri birbirine binmez (merkezler arası ≥ 15px)
 * Çalıştır: npx tsx scripts/hd-relations/composite-geometry.ts [--report]
 */
import { COMPOSITE_CENTERS, COMPOSITE_GATES, COMPOSITE_ROUTES, GATE_CENTER, CHANNELS, type Pt } from "../../lib/human-design/relations/compositeLayout";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ FAIL: ${n} ${d !== undefined ? JSON.stringify(d).slice(0, 600) : ""}`); } };

function inPoly(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
  }
  return c;
}
function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distPoly(p: Pt, poly: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, distSeg(p, poly[i], poly[(i + 1) % poly.length]));
  return m;
}
function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
const segs = (p: Pt[]) => p.slice(1).map((q, i) => [p[i], q] as [Pt, Pt]);

// G1
const g1 = Object.entries(COMPOSITE_GATES).filter(([g, p]) => {
  const poly = COMPOSITE_CENTERS[GATE_CENTER[Number(g)]].points;
  return !(inPoly(p, poly) || distPoly(p, poly) <= 3);
}).map(([g]) => g);
ok("G1 64 kapı, her biri kendi merkezinde", Object.keys(COMPOSITE_GATES).length === 64 && g1.length === 0, g1);

// G2
ok("G2 36 kanal; güzergâh uçları kendi kapıları", COMPOSITE_ROUTES.length === 36 && COMPOSITE_ROUTES.every((r) => {
  const ch = CHANNELS.find((c) => c.id === r.id)!;
  const a = COMPOSITE_GATES[Math.min(ch.gateA, ch.gateB)], b = COMPOSITE_GATES[Math.max(ch.gateA, ch.gateB)];
  return r.points[0] === a && r.points[r.points.length - 1] === b && r.halfA[0] === a && r.halfB[r.halfB.length - 1] === b;
}));

// G3: her güzergâh üzerinde örnekleme
const g3: string[] = [];
for (const r of COMPOSITE_ROUTES) {
  const own = new Set([GATE_CENTER[r.gateA], GATE_CENTER[r.gateB]]);
  for (const [a, b] of segs(r.points)) {
    for (let t = 0; t <= 1; t += 0.02) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const [name, c] of Object.entries(COMPOSITE_CENTERS)) {
        if (own.has(name as never)) continue;
        if (inPoly(p, c.points) || distPoly(p, c.points) < 3) { g3.push(`${r.id}→${name}`); break; }
      }
    }
  }
}
ok("G3 hiçbir kanal başka merkezin içinden geçmez (3px pay)", g3.length === 0, [...new Set(g3)]);

// G4
const g4: string[] = [];
for (const r of COMPOSITE_ROUTES) {
  for (const [g, p] of Object.entries(COMPOSITE_GATES)) {
    const gn = Number(g);
    if (gn === r.gateA || gn === r.gateB) continue;
    const d = Math.min(...segs(r.points).map(([a, b]) => distSeg(p, a, b)));
    if (d < 8.5) g4.push(`${r.id}~${g}(${d.toFixed(1)})`);
  }
}
ok("G4 hiçbir kanal başka kapı rozetine değmez (≥ 8.5px)", g4.length === 0, g4);

// G5
const crit = ["7-31", "1-8", "13-33", "10-20", "21-45"];
const g5: string[] = [];
for (const id of crit) {
  const r = COMPOSITE_ROUTES.find((x) => x.id === id)!;
  for (const o of COMPOSITE_ROUTES) {
    if (o.id === id) continue;
    if (segs(r.points).some(([a, b]) => segs(o.points).some(([c, d]) => segIntersect(a, b, c, d)))) g5.push(`${id}×${o.id}`);
  }
}
ok("G5 7-31 / 1-8 / 13-33 / 10-20 / 21-45 hiçbir kanalla kesişmez", g5.length === 0, g5);

// G6
const gates = Object.entries(COMPOSITE_GATES);
const g6: string[] = [];
for (let i = 0; i < gates.length; i++) for (let j = i + 1; j < gates.length; j++) {
  const d = Math.hypot(gates[i][1].x - gates[j][1].x, gates[i][1].y - gates[j][1].y);
  if (d < 15) g6.push(`${gates[i][0]}-${gates[j][0]}(${d.toFixed(1)})`);
}
ok("G6 kapı rozetleri birbirine binmez (≥ 15px)", g6.length === 0, g6);

if (process.argv.includes("--report")) {
  const all: string[] = [];
  for (let i = 0; i < COMPOSITE_ROUTES.length; i++) for (let j = i + 1; j < COMPOSITE_ROUTES.length; j++) {
    const a = COMPOSITE_ROUTES[i], b = COMPOSITE_ROUTES[j];
    if (segs(a.points).some(([p, q]) => segs(b.points).some(([r, s]) => segIntersect(p, q, r, s)))) all.push(`${a.id}×${b.id}`);
  }
  console.log(`Bilgi: kesişen kanal çiftleri (${all.length}): ${all.join(" ")}`);
}
console.log(`\nBİRLEŞİK BODYGRAPH GEOMETRİSİ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
