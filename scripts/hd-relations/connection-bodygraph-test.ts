/**
 * Connection BodyGraph — mühürlü V9 geometrisi + sahne doğrulaması (SAF; ağ/DB yok).
 *   1) Donmuş geometri dosyası = V9 hesabının yeniden üretimi (bayt bayt).
 *   2) Topoloji motorla birebir: 9 merkez, 64 kapı (doğru merkezde), 36 kanal (doğru uçlar), boru başka kapı /
 *      merkez üzerinden geçmez.
 *   3) Aktif renklendirme kuralları: tanımlı = iki yarı + tek işaret; yarım = tek yarı; ağda kapı kendi kolunu,
 *      gövde yalnız gövdeden geçen tanımlı kanalla; ortak kapı = çizgili; yalnız-sonuç modunda yarım kanal yok.
 *   4) Etkileşim yüzeyi: 36 kanalın tam güzergâhı; işaretler kapı / birbirleriyle çakışmaz.
 *
 * Çalıştırma: npx tsx scripts/hd-relations/connection-bodygraph-test.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CHANNELS, GATE_CENTER } from "../../lib/human-design/engine/channels";
import { CBG_CENTERS, CBG_GATES, CBG_NET_ARMS, CBG_PIPES } from "../../lib/human-design/relations/connectionBodygraphGeometry";
import {
  buildConnectionBodygraphScene,
  CBG_CHANNEL_IDS,
  CBG_GATE_R,
  CBG_PIPE_FULL,
  cbgChannelRoute,
  cbgStateFromModel,
  cbgStateFromResult,
  connectionBodygraphSvg,
  type CbgPrim,
  type CbgState,
} from "../../lib/human-design/relations/connectionBodygraphScene";
import { buildCompositeModel } from "../../lib/human-design/relations/compositeModel";
import { expectedConnection, type HdConnectionResult } from "../../lib/human-design/relations/connection";

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 600));
  }
}
type P = { x: number; y: number };
const parse = (s: string): P[] => s.split(" ").map((q) => ({ x: Number(q.split(",")[0]), y: Number(q.split(",")[1]) }));
const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 1) Donmuş geometri = V9 hesabı ────────────────────────────────────────────────────────────────────────
{
  const dir = mkdtempSync(path.join(tmpdir(), "cbg-"));
  const out = path.join(dir, "g.ts");
  execFileSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/hd-relations/connection-bodygraph-export.ts", out], { stdio: "pipe" });
  const fresh = readFileSync(out, "utf8").replace(/\r\n/g, "\n");
  const frozen = readFileSync("lib/human-design/relations/connectionBodygraphGeometry.ts", "utf8").replace(/\r\n/g, "\n");
  ok(fresh === frozen, "1 donmuş geometri dosyası V9 hesabının birebir çıktısı");
  rmSync(dir, { recursive: true, force: true });
}

// ── 2) Topoloji ───────────────────────────────────────────────────────────────────────────────────────────
const GP = new Map(CBG_GATES.map(([g, x, y]) => [g, { x, y }]));
const CENTER = new Map(CBG_CENTERS.map((c) => [c.engine, parse(c.points)]));
function inPoly(p: P, poly: P[]) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
function distSeg(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy;
  const t = LL ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / LL)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const onEdge = (p: P, poly: P[], tol: number) => poly.some((q, i) => distSeg(p, q, poly[(i + 1) % poly.length]) <= tol);
ok(CBG_CENTERS.length === 9 && new Set(CBG_CENTERS.map((c) => c.engine)).size === 9, "2a 9 merkez");
ok(CBG_GATES.length === 64 && new Set(CBG_GATES.map(([g]) => g)).size === 64 && CBG_GATES.every(([g]) => g >= 1 && g <= 64), "2b 64 kapı (tekil)");
const wrongCenter = CBG_GATES.filter(([g, x, y]) => {
  const poly = CENTER.get(GATE_CENTER[g])!;
  const p = { x, y };
  const others = CBG_CENTERS.filter((c) => c.engine !== GATE_CENTER[g]).some((c) => inPoly(p, parse(c.points)));
  return !(inPoly(p, poly) || onEdge(p, poly, CBG_GATE_R)) || others;
}).map(([g]) => g);
ok(wrongCenter.length === 0, "2c her kapı motorun merkezinde (GATE_CENTER)", wrongCenter);
ok(CBG_CHANNEL_IDS.length === 36 && CHANNELS.length === 36 && CBG_PIPES.length === 30 && CBG_NET_ARMS.length === 5, "2d 36 kanal = 30 tek boru + 6 ağ kanalı (5 parça)");
const badEnds: string[] = [];
const overGate: string[] = [];
const overCenter: string[] = [];
const FULL = CBG_PIPE_FULL; // gerçek çizim kalınlığı (referanstaki belirgin boru)
for (const ch of CHANNELS) {
  const lo = Math.min(ch.gateA, ch.gateB), hi = Math.max(ch.gateA, ch.gateB);
  const r = cbgChannelRoute(ch.id);
  if (r.length < 2 || d(r[0], GP.get(lo)!) > 0.01 || d(r[r.length - 1], GP.get(hi)!) > 0.01) badEnds.push(ch.id);
  // örnekleme: borunun gövdesi (uç kapılar hariç) başka kapıya / kendi merkezleri dışındaki merkeze girmez
  let L = 0;
  for (let i = 1; i < r.length; i++) L += d(r[i], r[i - 1]);
  const own = [GATE_CENTER[lo], GATE_CENTER[hi]];
  const at = (s: number) => {
    let acc = 0;
    for (let i = 1; i < r.length; i++) {
      const seg = d(r[i], r[i - 1]);
      if (acc + seg >= s) { const t = seg ? (s - acc) / seg : 0; return { x: r[i - 1].x + (r[i].x - r[i - 1].x) * t, y: r[i - 1].y + (r[i].y - r[i - 1].y) * t }; }
      acc += seg;
    }
    return r[r.length - 1];
  };
  for (let s = CBG_GATE_R * 1.1; s < L - CBG_GATE_R * 1.1; s += 1) {
    const q = at(s);
    for (const [g, gp] of GP) if (g !== lo && g !== hi && d(q, gp) < CBG_GATE_R + FULL / 2 + 0.6) { overGate.push(`${ch.id}→${g}`); break; }
    for (const c of CBG_CENTERS) if (!own.includes(c.engine as never) && inPoly(q, parse(c.points))) { overCenter.push(`${ch.id}→${c.engine}`); break; }
  }
}
ok(badEnds.length === 0, "2e 36/36 kanal doğru kapıdan başlar, doğru kapıda biter", badEnds);
ok(overGate.length === 0 && overCenter.length === 0, "2f hiçbir boru başka kapının / merkezin üzerinden geçmez", { overGate: [...new Set(overGate)], overCenter: [...new Set(overCenter)] });

// ── 3) Aktif renklendirme ─────────────────────────────────────────────────────────────────────────────────
function resultFrom(A: number[], B: number[]): HdConnectionResult {
  const e = expectedConnection(A, B, [], []);
  return {
    schema: "hd-connection-1",
    totalChannels: e.channels.length,
    channels: e.channels.map((c) => {
      const [a, b] = c.id.split("-").map(Number);
      return { ...c, gateA: a, gateB: b, name: c.id, nameLocalized: null, circuit: "x", circuitLocalized: null, centers: ["", ""] as [string, string], dynamicLocalized: null };
    }),
    centers: e.centers.map((c) => ({ ...c, name: c.code, nameLocalized: null })),
    combinedDefinition: e.combinedDefinition,
    combinedDefinitionLocalized: null,
    summary: { electromagnetic: 0, dominance: 0, compromise: 0, companionship: 0 },
  };
}
function stateOf(A: number[], B: number[]): { st: CbgState; r: HdConnectionResult } {
  const r = resultFrom(A, B);
  const m = buildCompositeModel(A, B, r);
  if (!m.ok) throw new Error(m.reason);
  return { st: cbgStateFromModel(m.model), r };
}
type Fill = Extract<CbgPrim, { k: "fill" }>;
const fillsOf = (prims: CbgPrim[], ch: string) => prims.filter((p): p is Fill => p.k === "fill" && p.chs.includes(ch));
const armPts = new Map(CBG_NET_ARMS.map(([k, s]) => [k as string, s]));
const isArm = (f: Fill, arm: string) => {
  const a = parse(armPts.get(arm)!);
  const p = parse(f.points);
  return d(p[0], a[0]) < 0.02 && d(p[p.length - 1], a[a.length - 1]) < 0.02;
};
const startsAtGate = (f: Fill, g: number) => d(parse(f.points)[0], GP.get(g)!) < 0.02;
const endsAtGate = (f: Fill, g: number) => { const p = parse(f.points); return d(p[p.length - 1], GP.get(g)!) < 0.02; };

{
  // Elektromanyetik 25-51 (A 25, B 51) + yarım 63-4 (yalnız A 4) + hiçbiri 64-47
  const { st } = stateOf([25, 4], [51]);
  const pr = buildConnectionBodygraphScene(st);
  const f = fillsOf(pr, "25-51");
  ok(f.length === 2 && f.some((x) => startsAtGate(x, 25) && x.tone === "A") && f.some((x) => endsAtGate(x, 51) && x.tone === "B"), "3a tanımlı EM: 25 yarısı mavi (A), 51 yarısı turuncu (B)", f);
  const h = fillsOf(pr, "4-63");
  ok(h.length === 1 && startsAtGate(h[0], 4) && h[0].tone === "A", "3b yarım kanal: yalnız aktif kapının (4) yarısı boyalı", h);
  ok(fillsOf(pr, "47-64").length === 0, "3c aktif kapısı olmayan kanal boyanmaz");
  const markers = pr.filter((p) => p.k === "marker");
  ok(markers.length === 1 && (markers[0] as { ch: string }).ch === "25-51", "3d yalnız tanımlı kanalda bağlantı türü işareti (yarım kanalda yok)", markers);
  const gates = pr.filter((p): p is Extract<CbgPrim, { k: "gate" }> => p.k === "gate");
  ok(gates.filter((g) => g.holder).map((g) => `${g.gate}:${g.holder}`).sort().join() === ["25:A", "4:A", "51:B"].sort().join(), "3e kapı renkleri = kişi kapıları");
}
{
  // Ağ: yalnız 20 aktif (A) → kol20 boyalı, gövde boyanmaz
  const { st } = stateOf([20], []);
  const pr = buildConnectionBodygraphScene(st);
  const all = pr.filter((p): p is Fill => p.k === "fill");
  ok(all.length === 1 && isArm(all[0], "kol20"), "3f ağ: tek kapı (20) yalnız kendi kolunu boyar; gövde boyanmaz", all.map((x) => x.points.slice(0, 30)));
}
{
  // Ağ: 10-20 tanımlı (A 10, B 20) → kol10 mavi + kol20 turuncu; gövde boyanmaz
  const { st } = stateOf([10], [20]);
  const pr = buildConnectionBodygraphScene(st);
  const all = pr.filter((p): p is Fill => p.k === "fill");
  ok(all.length === 2 && all.some((x) => isArm(x, "kol10") && x.tone === "A") && all.some((x) => isArm(x, "kol20") && x.tone === "B"), "3g ağ: 10-20 tanımlı → yalnız kol10 + kol20 (gövde yok)");
  ok(pr.filter((p) => p.k === "marker").length === 1, "3g2 10-20 işareti tek");
}
{
  // Ağ: 20-34 tanımlı (A 20, B 34) → kol20 + gövde (üst A, alt B) + kol34; 57 / 10 kolları boyanmaz
  const { st } = stateOf([20], [34]);
  const pr = buildConnectionBodygraphScene(st);
  const all = pr.filter((p): p is Fill => p.k === "fill");
  const gov = parse(armPts.get("govde")!);
  const trunk = all.filter((x) => { const p = parse(x.points); return d(p[0], gov[0]) < 0.02 || d(p[p.length - 1], gov[gov.length - 1]) < 0.02; });
  ok(all.some((x) => isArm(x, "kol20") && x.tone === "A") && all.some((x) => isArm(x, "kol34") && x.tone === "B"), "3h ağ: 20-34 → kol20 mavi, kol34 turuncu");
  ok(trunk.length === 2 && trunk.some((x) => d(parse(x.points)[0], gov[0]) < 0.02 && x.tone === "A") && trunk.some((x) => x.tone === "B"), "3i gövde iki yarı: üst = 20 sahibi (A), alt = 34 sahibi (B)", trunk.length);
  ok(!all.some((x) => isArm(x, "kol10") || isArm(x, "kol57")), "3j boşta kalan kollar (10, 57) boyanmaz");
}
{
  // Ortak kapı (ikisinde de 1) + Arkadaşlık 1-8 (A 1,8 · B 1,8)
  const { st } = stateOf([1, 8], [1, 8]);
  const pr = buildConnectionBodygraphScene(st);
  const f = fillsOf(pr, "1-8");
  ok(f.length === 4 && f.filter((x) => x.stripe).length === 2 && f.filter((x) => x.stripe).every((x) => x.tone === "B") && f.filter((x) => !x.stripe).every((x) => x.tone === "A"), "3k ortak kapı yarıları: mavi boru + turuncu şerit", f.map((x) => [x.tone, x.stripe]));
  const gates = pr.filter((p): p is Extract<CbgPrim, { k: "gate" }> => p.k === "gate" && p.holder !== null);
  ok(gates.length === 2 && gates.every((g) => g.holder === "both"), "3l ortak kapılar iki renkli");
}
{
  // Yoğun örnek (dört dinamik, ağ kanallarının beşi) + yalnız-sonuç modu
  const A = [10, 20, 57, 1, 8, 59, 37, 22, 41, 64, 4, 25, 18, 16, 13, 30, 36];
  const B = [34, 48, 7, 31, 6, 40, 55, 61, 24, 60, 2, 14, 20, 39, 51, 33, 10];
  const { st, r } = stateOf(A, B);
  const pr = buildConnectionBodygraphScene(st);
  const dyn = new Set(r.channels.map((c) => c.dynamic));
  ok(dyn.size === 4, "3m örnek dört dinamiği de içerir", [...dyn]);
  const markers = pr.filter((p): p is Extract<CbgPrim, { k: "marker" }> => p.k === "marker");
  ok(markers.length === r.channels.length && new Set(markers.map((m) => m.ch)).size === r.channels.length, "3n her tanımlı kanalda tam bir işaret", [markers.length, r.channels.length]);
  // işaret merkezi = yolun sınırlayıcı kutusunun ortası
  const centers = markers.map((m) => { const n = m.d.match(/-?\d+(\.\d+)?/g)!.map(Number); const xs: number[] = [], ys: number[] = []; for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); } return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; });
  let minMM = Infinity, minMG = Infinity;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) minMM = Math.min(minMM, d(centers[i], centers[j]));
    for (const gp of GP.values()) minMG = Math.min(minMG, d(centers[i], gp));
  }
  ok(minMM >= 11 && minMG >= CBG_GATE_R + 4, "3o işaretler birbirine ve kapılara binmez", { minMM: +minMM.toFixed(1), minMG: +minMG.toFixed(1) });
  const halfFromModel = Object.values(st.channels).filter((c) => c.state === "half").length;
  const ro = cbgStateFromResult(r);
  const prR = buildConnectionBodygraphScene(ro);
  ok(halfFromModel > 0 && Object.values(ro.channels).every((c) => c.state !== "half") && prR.filter((p) => p.k === "marker").length === r.channels.length, "3p yalnız-sonuç modu: tanımlı kanallar aynı, yarım kanal çizilmez");
  const definedM = Object.values(st.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join();
  const definedR = Object.values(ro.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join();
  ok(definedM === definedR && definedM === r.channels.map((c) => c.id).sort().join(), "3q iki modda tanımlı kanallar = kayıtlı sonuç");
  const svg = connectionBodygraphSvg(pr, { logoHref: "data:image/png;base64,AAAA", fontFamily: "Geist" });
  ok(!/NaN|undefined/.test(svg) && (svg.match(/<polygon /g) ?? []).length === 9 && (svg.match(/ r="6\.2"/g) ?? []).length === 64, "3r SVG metni geçerli: 9 merkez, 64 kapı, NaN / undefined yok");
  const definedCenters = pr.filter((p) => p.k === "center" && p.defined).length;
  ok(definedCenters === r.centers.filter((c) => c.defined).length, "3s tanımlı merkez sayısı = kayıtlı sonuç");
}
{
  // Boş durum: 36 kanal borusu (30 boru × 2 + 5 ağ parçası × 2 = 70 çizgi), hiç dolgu / işaret yok
  const empty = buildConnectionBodygraphScene(stateOf([], []).st);
  const edges = empty.filter((p): p is Extract<CbgPrim, { k: "pipe" }> => p.k === "pipe" && p.part === "edge");
  ok(edges.length === 35 && empty.filter((p) => p.k === "pipe").length === 105 && !empty.some((p) => p.k === "fill" || p.k === "marker" || p.k === "tick"), "3t boş temel: 30 boru + 5 ağ parçası (kenar / gövde / ışık katmanı), dolgu / işaret yok");
  const v9Pts = [...CBG_PIPES.map(([, s]) => s), ...CBG_NET_ARMS.map(([, s]) => s)].sort().join("|");
  ok([...new Set(edges.map((e) => e.points))].sort().join("|") === v9Pts, "3u boru güzergâhları mühürlü V9 noktalarıyla birebir (yalnız sunum katmanı değişti)");
}

console.log(`\nconnection-bodygraph: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
