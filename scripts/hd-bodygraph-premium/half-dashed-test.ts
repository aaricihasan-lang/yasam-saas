/**
 * Premium BodyGraph — YARIM KANAL çizimi. SAF.
 *   • 0. AKTİF bireysel görünüm (owner kararı 2026-10-18, Roxy resmî mantığı; rendererConfig "solid"): yarım kanalın
 *     renkli yarısı DÜZ; iki taraflı kapının şeridi tanımlı kanaldakiyle aynı (5 / 5); kesikli dolgu hiç yok.
 *   • A–B: PASİF geri dönüş "dashed" (PR #431 eşdeğeri; halfStyle "dashed" zorlanarak) — kural aynen korunur.
 *   • C: Connection (mavi-turuncu) DEĞİŞMEDİ: kesikli yarım kanal + dinamikler.
 * Kesikli kural (A–C):
 *   • Yalnız tek kapısı aktif (tanımlanmamış) kanalın renkli yarısı kesikli; tanımlı kanal kesintisiz.
 *   • 1-8, 7-31, 13-33, 21-45: tek kapı / iki kapı / çift aktivasyon (bireysel siyah-kırmızı).
 *   • Entegrasyon ağı (10 · 20 · 34 · 57): kol kesikli yalnız o kapının ağ kanallarının hiçbiri tanımlı değilse;
 *     ortak gövde asla kesikli değil (yalnız tanımlıda boyanır).
 *   • Connection (mavi-turuncu): aynı kural; tanımlı kanallar ve dinamik listesi değişmez.
 *   • Kesikli dolgu hiçbir zaman tanımlı ya da boş bir kanala ait değildir (yanlış aktif / tanımlı izlenimi yok).
 *   • SVG (ekran = Word aynı öğe tanımları): yarım → dasharray "7 5" (çift aktivasyon şeridi "3.5 8.5"); tanımlı şerit "5 5".
 * Çalıştırma: npx tsx scripts/hd-bodygraph-premium/half-dashed-test.ts
 */
import { CHANNELS, getDefinedCenters, getDefinedChannels } from "../../lib/human-design/engine/channels";
import { premiumStateFromChart } from "../../lib/human-design/bodygraph/premiumChartState";
import { buildConnectionBodygraphScene, cbgElements, cbgStateFromModel, connectionBodygraphSvg, type CbgPrim, type CbgState } from "../../lib/human-design/relations/connectionBodygraphScene";
import { CBG_NET_ARMS } from "../../lib/human-design/relations/connectionBodygraphGeometry";
import { buildCompositeModel } from "../../lib/human-design/relations/compositeModel";
import { expectedConnection, type HdConnectionResult } from "../../lib/human-design/relations/connection";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 400)}`}`); } };

type Fill = Extract<CbgPrim, { k: "fill" }>;
type Side = "personality" | "design";
const P = "personality" as const, D = "design" as const;
function chartOf(acts: Array<[number, Side]>) {
  const gates = [...new Set(acts.map(([g]) => g))];
  const ch = getDefinedChannels(gates);
  return {
    activations: acts.map(([gate, side], i) => ({ body: `B${i}`, side, gate, line: 1 })),
    channels: ch.map((c) => ({ id: c.id, name: c.name, gates: [c.gateA, c.gateB], centers: [c.centerA, c.centerB] })),
    centers: { defined: getDefinedCenters(ch), open: [] },
  } as never;
}
const fillsOf = (prims: CbgPrim[], id: string) => prims.filter((p): p is Fill => p.k === "fill" && p.chs.includes(id));
const armPts = new Map(CBG_NET_ARMS.map(([k, s]) => [k as string, s]));
const isArm = (f: Fill, arm: string) => { const a = armPts.get(arm)!.split(" "); const p = f.points.split(" "); return p[0] === a[0] && p[p.length - 1] === a[a.length - 1]; };
/** Genel güvence: kesikli dolgular yalnız yarım (ya da tanımlısı olmayan ağ kolu) kanallara aittir. */
function noFalseDash(st: CbgState, prims: CbgPrim[]) {
  const fills = prims.filter((p): p is Fill => p.k === "fill");
  const bad = fills.filter((f) => f.halfOnly && f.chs.some((id) => st.channels[id].state === "defined"));
  const badSolid = fills.filter((f) => !f.halfOnly && f.chs.length > 0 && f.chs.every((id) => st.channels[id].state === "half"));
  const onNone = fills.filter((f) => f.chs.every((id) => st.channels[id].state === "none"));
  return { bad: bad.map((f) => f.chs), badSolid: badSolid.map((f) => f.chs), onNone: onNone.map((f) => f.chs) };
}

/** PASİF geri dönüş görünümü: aynı durum, yarım kanal kesikli. */
const dashedState = (acts: Array<[number, Side]>): CbgState | null => {
  const st = premiumStateFromChart(chartOf(acts));
  return st ? { ...st, halfStyle: "dashed" } : null;
};

console.log("\n—— 0. AKTİF bireysel görünüm: yarım kanal DÜZ (Roxy mantığı)");
{
  const st = premiumStateFromChart(chartOf([[1, P], [7, P], [13, D], [21, D], [31, P], [31, D], [45, P], [45, D], [33, D], [20, P], [34, P], [34, D]]))!;
  ok("S0 varsayılan bireysel durum: halfStyle solid · typeScale large (rendererConfig)", st.halfStyle === "solid" && st.typeScale === "large", { h: st.halfStyle, t: st.typeScale });
  const pr = buildConnectionBodygraphScene(st);
  const fills = pr.filter((p): p is Fill => p.k === "fill");
  ok("S1 hiçbir dolgu kesikli değil (halfOnly yok)", fills.every((f) => !f.halfOnly));
  const halfIds = Object.values(st.channels).filter((c) => c.state === "half").map((c) => c.id);
  ok("S2 her yarım kanalın renkli yarısı çizilir ve düz (kenar / gövde / ışık dasharray yok)", halfIds.length > 0 && halfIds.every((id) => fillsOf(pr, id).length > 0 && fillsOf(pr, id).filter((f) => !f.stripe).every((f) => cbgElements(f, null).every((e) => e.attrs.strokeDasharray === undefined))), halfIds);
  const stripes = fills.filter((f) => f.stripe);
  ok("S3 iki taraflı kapı şeridi (yarım ve tanımlı kanalda) 5 / 5 — beyaz boşluk yok, siyah boru üzerinde kırmızı", stripes.length > 0 && stripes.every((f) => f.tone === "B" && cbgElements(f, null).every((e) => e.attrs.strokeDasharray === "5 5")) && stripes.every((f) => fills.some((b) => b.points === f.points && b.tone === "A" && !b.stripe)));
  ok("S4 renkli yarı yalnız aktif kapının yarısında; boş kanal boyanmaz", fills.every((f) => f.chs.some((id) => st.channels[id].state !== "none")));
  const svg = connectionBodygraphSvg(pr, { logoHref: null, fontFamily: "Geist" });
  ok("S5 SVG (ekran = Word): 7-5 ve 3.5-8.5 kesik deseni yok", !svg.includes('stroke-dasharray="7 5"') && !svg.includes('stroke-dasharray="3.5 8.5"'));
}

console.log("\n—— A. Bireysel PASİF geri dönüş (dashed): 1-8 · 7-31 · 13-33 · 21-45");
const CASES: Record<string, { acts: Array<[number, Side]>; expect: Record<string, { state: "half" | "defined"; dashed: number; solid: number; stripe?: "half" | "defined" }> }> = {
  "tek kapı": {
    acts: [[1, P], [7, P], [13, D], [21, D]],
    expect: { "1-8": { state: "half", dashed: 1, solid: 0 }, "7-31": { state: "half", dashed: 1, solid: 0 }, "13-33": { state: "half", dashed: 1, solid: 0 }, "21-45": { state: "half", dashed: 1, solid: 0 } },
  },
  "iki kapı": {
    acts: [[1, P], [8, D], [7, D], [31, P], [13, P], [33, P], [21, D], [45, D]],
    expect: { "1-8": { state: "defined", dashed: 0, solid: 2 }, "7-31": { state: "defined", dashed: 0, solid: 2 }, "13-33": { state: "defined", dashed: 0, solid: 2 }, "21-45": { state: "defined", dashed: 0, solid: 2 } },
  },
  "çift aktivasyon": {
    acts: [[1, P], [1, D], [31, P], [31, D], [7, D], [33, D], [45, P], [45, D], [21, P]],
    expect: {
      "1-8": { state: "half", dashed: 2, solid: 0, stripe: "half" },
      "7-31": { state: "defined", dashed: 0, solid: 3, stripe: "defined" },
      "13-33": { state: "half", dashed: 1, solid: 0 },
      "21-45": { state: "defined", dashed: 0, solid: 3, stripe: "defined" },
    },
  },
};
for (const [name, c] of Object.entries(CASES)) {
  const st = dashedState(c.acts);
  if (!st) { ok(`${name}: durum üretildi`, false); continue; }
  const prims = buildConnectionBodygraphScene(st);
  for (const [id, e] of Object.entries(c.expect)) {
    const f = fillsOf(prims, id);
    const dashed = f.filter((x) => x.halfOnly).length;
    const solid = f.filter((x) => !x.halfOnly).length;
    const stripe = f.find((x) => x.stripe);
    const stripeKind = stripe ? (stripe.halfOnly ? "half" : "defined") : undefined;
    ok(`${name} · ${id}: ${e.state === "half" ? "YARIM → kesikli" : "TANIMLI → kesintisiz"}${e.stripe ? " (çift aktivasyon şeridi korunur)" : ""}`, st.channels[id].state === e.state && dashed === e.dashed && solid === e.solid && stripeKind === e.stripe, { state: st.channels[id].state, dashed, solid, stripeKind });
  }
  const g = noFalseDash(st, prims);
  ok(`${name}: kesikli yalnız yarım kanallarda; tanımlı / boş kanal kesikli ya da boyalı değil`, g.bad.length === 0 && g.badSolid.length === 0 && g.onNone.length === 0, g);
  // SVG (ekran ve Word aynı öğe tanımı)
  const svg = connectionBodygraphSvg(prims, { logoHref: null, fontFamily: "Geist" });
  const halfFill = prims.find((p): p is Fill => p.k === "fill" && !!p.halfOnly && !p.stripe);
  if (halfFill) {
    const els = cbgElements(halfFill, null);
    ok(`${name}: yarım dolgunun kenar / gövde / ışık katmanları 7-5 kesikli (premium katmanlar korunur)`, els.length === 3 && els.every((e) => e.attrs.strokeDasharray === "7 5") && svg.includes('stroke-dasharray="7 5"'));
  }
  const defFill = prims.find((p): p is Fill => p.k === "fill" && !p.halfOnly && !p.stripe);
  if (defFill) ok(`${name}: tanımlı dolgu kesintisiz`, cbgElements(defFill, null).every((e) => e.attrs.strokeDasharray === undefined));
  const hs = prims.find((p): p is Fill => p.k === "fill" && !!p.halfOnly && !!p.stripe);
  if (hs) ok(`${name}: yarım + çift aktivasyon şeridi kesiklerin içinde (3.5 / 8.5)`, cbgElements(hs, null).every((e) => e.attrs.strokeDasharray === "3.5 8.5"));
  const ds = prims.find((p): p is Fill => p.k === "fill" && !p.halfOnly && !!p.stripe);
  if (ds) ok(`${name}: tanımlı kanalda çift aktivasyon şeridi aynen (5 / 5)`, cbgElements(ds, null).every((e) => e.attrs.strokeDasharray === "5 5"));
}

console.log("\n—— B. Entegrasyon ağı (ortak kollar / gövde) — PASİF geri dönüş (dashed)");
{
  const st = dashedState([[20, P]])!;
  const pr = buildConnectionBodygraphScene(st);
  const f = pr.filter((p): p is Fill => p.k === "fill");
  ok("B1 yalnız 20 aktif → kol20 kesikli; gövde boyanmaz", f.length === 1 && isArm(f[0], "kol20") && !!f[0].halfOnly);
}
{
  const st = dashedState([[20, P], [34, D]])!;
  const pr = buildConnectionBodygraphScene(st);
  const f = pr.filter((p): p is Fill => p.k === "fill");
  const gov = armPts.get("govde")!.split(" ");
  const trunk = f.filter((x) => x.points.split(" ")[0] === gov[0] || x.points.split(" ").at(-1) === gov.at(-1));
  ok("B2 20-34 tanımlı → kol20, gövde, kol34 kesintisiz", f.length === 4 && f.every((x) => !x.halfOnly) && trunk.length === 2 && f.some((x) => isArm(x, "kol20")) && f.some((x) => isArm(x, "kol34")));
}
{
  // 20-34 tanımlı + 10 aktif (10-20 / 10-34 YARIM DEĞİL: 10-20 tanımlı olur) → 10, 20, 34 hepsi tanımlı kanallarda
  const st = dashedState([[20, P], [34, D], [57, D]])!;
  const pr = buildConnectionBodygraphScene(st);
  const f = pr.filter((p): p is Fill => p.k === "fill");
  ok("B3 20-34 + 20-57 + 34-57 tanımlı → hiçbir kol kesikli değil", f.length > 0 && f.every((x) => !x.halfOnly), f.map((x) => [x.chs, x.halfOnly]));
}
{
  // 57 tek başına (ağ dışı başka kanalı yok) + 10 tek başına → iki kol kesikli, gövde yok
  const st = dashedState([[57, D], [10, P]])!;
  // 10-57 iki kapı aktif → TANIMLI (gövde dahil). Bu yüzden 57 ve 10 kolları kesintisiz olmalı.
  const pr = buildConnectionBodygraphScene(st);
  const f = pr.filter((p): p is Fill => p.k === "fill");
  ok("B4 10 + 57 aktif → 10-57 tanımlı: kol10, gövde, kol57 kesintisiz", st.channels["10-57"].state === "defined" && f.every((x) => !x.halfOnly) && f.length === 4);
}
{
  const st = dashedState([[34, P], [34, D]])!;
  const pr = buildConnectionBodygraphScene(st);
  const f = pr.filter((p): p is Fill => p.k === "fill");
  ok("B5 yalnız 34 (çift aktivasyon) → kol34 kesikli + kesik içi şerit", f.length === 2 && f.every((x) => isArm(x, "kol34") && x.halfOnly) && f.some((x) => x.stripe));
  const g = noFalseDash(st, pr);
  ok("B6 ağ: kesikli yalnız yarım kanallarda", g.bad.length === 0 && g.badSolid.length === 0 && g.onNone.length === 0, g);
}

console.log("\n—— C. Connection (mavi / turuncu) — aynı kural, dinamikler değişmez");
{
  const A = [10, 20, 57, 1, 8, 59, 37, 22, 41, 64, 4, 25, 18, 16, 13, 30, 36];
  const B = [34, 48, 7, 31, 6, 40, 55, 61, 24, 60, 2, 14, 20, 39, 51, 33, 10];
  const e = expectedConnection(A, B, [], []);
  const r = { schema: "hd-connection-1", totalChannels: e.channels.length, channels: e.channels.map((c) => { const [a, b] = c.id.split("-").map(Number); return { ...c, gateA: a, gateB: b, name: c.id, nameLocalized: null, circuit: "x", circuitLocalized: null, centers: ["", ""] as [string, string], dynamicLocalized: null }; }), centers: e.centers.map((c) => ({ ...c, name: c.code, nameLocalized: null })), combinedDefinition: e.combinedDefinition, combinedDefinitionLocalized: null, summary: { electromagnetic: 0, dominance: 0, compromise: 0, companionship: 0 } } as HdConnectionResult;
  const m = buildCompositeModel(A, B, r);
  if (!m.ok) throw new Error(m.reason);
  const st = cbgStateFromModel(m.model);
  const pr = buildConnectionBodygraphScene(st);
  const g = noFalseDash(st, pr);
  ok("C1 Connection: kesikli yalnız yarım kanallarda; tanımlı kanallar kesintisiz", g.bad.length === 0 && g.badSolid.length === 0 && g.onNone.length === 0, g);
  const halfIds = Object.values(st.channels).filter((c) => c.state === "half").map((c) => c.id);
  ok("C2 her yarım kanalın renkli yarısı kesikli", halfIds.length > 0 && halfIds.every((id) => fillsOf(pr, id).length > 0 && fillsOf(pr, id).every((f) => f.halfOnly || CHANNELS.some((ch) => ch.id !== id && f.chs.includes(ch.id) && st.channels[ch.id].state === "defined"))));
  ok("C3 Connection paleti mavi / turuncu; dört dinamik ve tanımlı liste kayıtlı sonuçla aynı", pr.every((p) => p.k !== "fill" || p.pal === "connection") && Object.values(st.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join() === r.channels.map((c) => c.id).sort().join() && new Set(r.channels.map((c) => c.dynamic)).size === 4);
}

console.log(`\nYARIM KANAL (aktif düz + pasif kesikli + Connection): ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
