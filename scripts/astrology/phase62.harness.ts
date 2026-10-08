/**
 * ASTROLOJİ AŞAMA 6.2 harness'i — KP Rahu/Ketu son doğrulaması (3 ayırt edici sentetik golden).
 *
 * Bağımsız model (YALNIZ test): scripts/astrology/golden/phase62-design.ts — astronomy-engine + yaklaşık KP-Newcomb +
 * ortalama düğüm + Placidus. Roxy significator alanları modele GİRDİ OLARAK verilmez; yalnız sonuçla karşılaştırılır.
 *   G1 kp62-dasha-x1 · G2 kp62-dasha-x2 · G3 kp62-ruling-x1 (+ 6.1 natal ruling).
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase62.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { KP_NODE_SIG_METHODS, KP_NODE_SIG_SOURCE, SIGN_LORDS } from "@/lib/astrology/model/kp";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { KpRulingPanel } from "@/app/admin/astroloji/_components/KpPanels";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { KP62_RULING_AT, SYNTH_X1, SYNTH_X2, designChecks } from "./golden/phase62-golden-calls";
import { agentLevels, agents, chartAt, model, signOf, starOf, type Chart, type Hyp, type Levels } from "./golden/phase62-design";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const G1 = load("kp62-dasha-x1");
const G2 = load("kp62-dasha-x2");
const G3 = load("kp62-ruling-x1");
const RP6 = load("kp-ruling-planets");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const ID: Record<string, VedicGrahaId> = { Sun: "sun", Moon: "moon", Mars: "mars", Mercury: "mercury", Jupiter: "jupiter", Venus: "venus", Saturn: "saturn", Rahu: "rahu", Ketu: "ketu" };
const NAME = Object.fromEntries(Object.entries(ID).map(([k, v]) => [v, k])) as Record<VedicGrahaId, string>;
const at = (b: { utc: string; latitude: number; longitude: number }) => chartAt(Date.parse(b.utc), b.latitude, b.longitude);
const X1 = at(SYNTH_X1);
const X2 = at(SYNTH_X2);
const XA = at(SYNTH_A);
const sorted = (l: Levels): Levels => ({ 1: [...l[1]].sort((a, b) => a - b), 2: [...l[2]].sort((a, b) => a - b), 3: [...l[3]].sort((a, b) => a - b), 4: [...l[4]].sort((a, b) => a - b) });
const roxyLv = (g: J, n: string): Levels => {
  const s = g.response.mahadashas.find((x: J) => x.planet === n).significators.signifies;
  return sorted({ 1: s.L1, 2: s.L2, 3: s.L3, 4: s.L4 });
};
const eqL = (a: Levels, b: Levels) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
/** Roxy'nin uyguladığı (6.2 ile doğrulanan) ajan kuralı: burç lordu + aynı burç + 7. burç; özel bakış yok; orb yok. */
const ROXY_RULE: Hyp = { conj: "sign", opp: "sign", jup: false, sat: false };
const setEq = (a: number[], b: number[]) => [...new Set(a)].sort((x, y) => x - y).join() === [...new Set(b)].sort((x, y) => x - y).join();
const flat = (l: Levels) => [...new Set([1, 2, 3, 4].flatMap((k) => l[k as 1 | 2 | 3 | 4]))];
/** Ruling ucunun düğüm listesi (6.2 bulgusu): düğüm → kavuşan/7. burç ajanları (boylam sırası) → burç lordu; her birinde bulunduğu ev, sonra sahip olduğu evler. */
function agentHousesOrdered(c: Chart, node: "rahu" | "ketu"): number[] {
  const m = model(c);
  const lord = SIGN_LORDS[SIGN_IDS[signOf(c.lon[node])]];
  const others = agents(c, node, ROXY_RULE).filter((g) => g !== lord).sort((a, b) => c.lon[a] - c.lon[b]);
  const out: number[] = [];
  for (const g of [node, ...others, lord]) for (const h of [m.house(g), ...m.owned(g)]) if (!out.includes(h)) out.push(h);
  return out;
}
const unitOf = (id: string, birth: J, opts: Record<string, unknown>) => {
  const def = getTechnique(id)!;
  const o = def.parseOptions(opts, new Date("2026-10-09T12:00:00Z"))!;
  return { def, o, u: def.units({ birth, birthUtc: birth.utc, partner: null }, o)[0] };
};

async function main() {
  await t("6.2 golden: 3 fixture = ürün birimi gövdeleri (kp.dasha X1/X2, kp.ruling X1 @ 2026-10-12 10:05Z); adaptörler temiz; tasarım koşulları tutuyor; kp62 fixture sayısı = 3", () => {
    assert.ok(Object.values(designChecks()).every(Boolean));
    for (const [g, birth, id, opts] of [[G1, SYNTH_X1, "kp.dasha", {}], [G2, SYNTH_X2, "kp.dasha", {}], [G3, SYNTH_X1, "kp.ruling", { atUtc: KP62_RULING_AT }]] as const) {
      const { def, o, u } = unitOf(id, birth, opts);
      assert.equal(u.endpoint, g.endpoint);
      assert.deepEqual(JSON.parse(JSON.stringify(u.body)), g.body);
      const p = def.project(u, g.response, o) as J;
      assert.ok(p.ok, JSON.stringify(p.errors));
      assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
    }
    assert.equal(readdirSync(DIR).filter((f) => f.startsWith("kp62-")).length, 3);
  });

  await t("6.2 bağımsız model ≡ Roxy: X1 + X2'de 9 grahanın Placidus evi ve yıldız lordu; görünür 7 grahanın 4 düzeyi (sade kural) birebir", () => {
    for (const [g, c] of [[G1, X1], [G2, X2]] as const) {
      const m = model(c);
      for (const p of g.response.mahadashas) {
        const id = ID[p.planet];
        assert.equal(p.significators.house, m.house(id), `${p.planet} ev`);
        assert.equal(ID[p.significators.starLord], starOf(c.lon[id]), `${p.planet} yıldız`);
        if (id !== "rahu" && id !== "ketu") assert.ok(eqL(roxyLv(g, p.planet), m.plain(id)), `${p.planet} sade`);
      }
    }
  });

  await t("6.2 Soru 1+2+4 — dasha düğüm kuralı: ajan = burç lordu + AYNI burç + 7. burç (burç bazlı); X1 Rahu/Ketu + X2 Rahu/Ketu 16/16 düzey birebir", () => {
    assert.deepEqual(agents(X1, "rahu", ROXY_RULE).sort(), ["mars", "mercury", "sun"]);
    assert.deepEqual(agents(X1, "ketu", ROXY_RULE).sort(), ["mercury", "sun", "venus"]);
    assert.deepEqual(agents(X2, "rahu", ROXY_RULE).sort(), ["mercury", "sun"]);
    assert.deepEqual(agents(X2, "ketu", ROXY_RULE).sort(), ["jupiter", "sun"]);
    for (const [g, c] of [[G1, X1], [G2, X2]] as const) for (const n of ["rahu", "ketu"] as const) assert.ok(eqL(roxyLv(g, NAME[n]), agentLevels(c, n, ROXY_RULE)), `${n}`);
  });

  await t("6.2 Soru 1 — özel bakışlar sayılmaz: Jüpiter 9. (X1 → Rahu) ve Satürn 3. (X2 → Ketu) dahil edilirse Roxy ile ÇELİŞİR (6.1: Mars 4.)", () => {
    assert.ok(agents(X1, "rahu", { ...ROXY_RULE, jup: true }).includes("jupiter"));
    assert.ok(!eqL(roxyLv(G1, "Rahu"), agentLevels(X1, "rahu", { ...ROXY_RULE, jup: true })));
    assert.ok(agents(X2, "ketu", { ...ROXY_RULE, sat: true }).includes("saturn"));
    assert.ok(!eqL(roxyLv(G2, "Ketu"), agentLevels(X2, "ketu", { ...ROXY_RULE, sat: true })));
  });

  await t("6.2 Soru 4 — kavuşma/karşıt BURÇ bazlı: X1 Merkür (Ketu burcunda 19.5° uzak) ajan; X2 Mars (komşu burçta Rahu'ya 2.8°) ajan DEĞİL; orb ve 'burç ∪ orb' karma hipotezleri çürür", () => {
    const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    assert.ok(signOf(X1.lon.mercury) === signOf(X1.lon.ketu) && sep(X1.lon.mercury, X1.lon.ketu) > 19);
    assert.ok(signOf(X2.lon.mars) !== signOf(X2.lon.rahu) && sep(X2.lon.mars, X2.lon.rahu) < 3);
    // orb: X1 Ketu (Merkür düşer) ve X1 Rahu (karşıt orb'da yalnız Güneş) çelişir.
    assert.ok(!eqL(roxyLv(G1, "Ketu"), agentLevels(X1, "ketu", { ...ROXY_RULE, conj: "orb" })));
    assert.ok(!eqL(roxyLv(G1, "Rahu"), agentLevels(X1, "rahu", { ...ROXY_RULE, opp: "orb" })));
    // Karma (burç ∪ orb): X2'de Mars Rahu'ya (kavuşma) ve Ketu'ya (karşıt) eklenirdi → çelişir.
    const hybrid = (c: Chart, n: "rahu" | "ketu"): Levels => {
      const m = model(c);
      const set = new Set([n, ...agents(c, n, ROXY_RULE), ...agents(c, n, { conj: "orb", opp: "orb", jup: false, sat: false })]);
      const lv = (l: 1 | 2 | 3 | 4) => [...new Set([...set].flatMap((x) => m.plain(x)[l]))];
      return { 1: lv(1), 2: lv(2), 3: lv(3), 4: lv(4) };
    };
    assert.ok(!eqL(roxyLv(G2, "Rahu"), hybrid(X2, "rahu")) && !eqL(roxyLv(G2, "Ketu"), hybrid(X2, "ketu")));
  });

  await t("6.2 Soru 2 — '7. burç bakışı' ≡ 'karşı düğümle (aynı burçta) kavuşma': Ketu daima Rahu'nun 7. burcunda → iki kural her doğumda AYNI ajan kümesini verir (1955–2015 her 97 günde bir, kanıt)", () => {
    for (let ms = Date.parse("1955-01-01T00:00:00Z"); ms < Date.parse("2015-12-31T00:00:00Z"); ms += 97 * 86400000) {
      const c = chartAt(ms, 41.0082, 28.9784);
      assert.equal((signOf(c.lon.ketu) - signOf(c.lon.rahu) + 12) % 12, 6);
      const vis = (["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as VedicGrahaId[]);
      const seventhFromRahu = vis.filter((g) => (signOf(c.lon[g]) - signOf(c.lon.rahu) + 12) % 12 === 6).join();
      const conjKetu = vis.filter((g) => signOf(c.lon[g]) === signOf(c.lon.ketu)).join();
      assert.equal(seventhFromRahu, conjKetu);
    }
  });

  await t("6.2 Soru 3 — ruling ucu: düğüm listesi = 'ajan evleri' (ajan ekli L2 ∪ L4), sıra: düğüm → kavuşan/7. burç ajanları → burç lordu; X1 Rahu + X1 Ketu + 6.1 natal Ketu 3/3 SIRA DAHİL birebir", () => {
    const got = (r: J, n: string) => r.response.significators.find((x: J) => x.planet === n).signifies;
    assert.deepEqual(G3.response.rulingPlanets.slice().sort(), ["Jupiter", "Ketu", "Moon", "Rahu", "Venus"]);
    assert.deepEqual([G3.response.moonStarLord, G3.response.lagnaStarLord], ["Rahu", "Ketu"]);
    assert.deepEqual(got(G3, "Rahu"), agentHousesOrdered(X1, "rahu"));
    assert.deepEqual(got(G3, "Ketu"), agentHousesOrdered(X1, "ketu"));
    assert.deepEqual(got(RP6, "Ketu"), agentHousesOrdered(XA, "ketu"));
    for (const [c, n, r] of [[X1, "rahu", G3], [X1, "ketu", G3], [XA, "ketu", RP6]] as const) {
      const ag = agentLevels(c, n, ROXY_RULE);
      assert.ok(setEq(got(r, NAME[n]), [...ag[2], ...ag[4]]));
    }
  });

  await t("6.2 Soru 3 — çürütülen hipotezler: 'burç lordu kümesi' (6.1 etiketi; X1 Rahu ≠ Mars, Ketu ≠ Venüs), sade 4 düzey ve tam ajan ekli 4 düzey; görünür ruling planet'ler TAM 4 düzey (L1→L4)", () => {
    const m = model(X1);
    const got = (n: string) => G3.response.significators.find((x: J) => x.planet === n).signifies as number[];
    assert.ok(!setEq(got("Rahu"), flat(m.plain("mars"))) && !setEq(got("Ketu"), flat(m.plain("venus"))));
    for (const n of ["rahu", "ketu"] as const) {
      assert.ok(!setEq(got(NAME[n]), flat(m.plain(n))));
      assert.ok(!setEq(got(NAME[n]), flat(agentLevels(X1, n, ROXY_RULE))));
    }
    for (const n of ["Jupiter", "Venus", "Moon"]) assert.deepEqual(got(n), flat(m.plain(ID[n])), n);
  });

  await t("6.2 etiketler: ruling → 'ajan evleri' (doğrulandı + belgelenmemiş sağlayıcı davranışı); arayüzde X1 ruling tablosunda Rahu VE Ketu satırı 'agent_houses'", () => {
    assert.equal(KP_NODE_SIG_SOURCE.ruling, "agent_houses");
    assert.equal(KP_NODE_SIG_SOURCE.dasha, "agent");
    const def = getTechnique("kp.ruling")!;
    const { o, u } = unitOf("kp.ruling", SYNTH_X1, { atUtc: KP62_RULING_AT });
    const tech = (def.project(u, G3.response, o) as J).technical;
    const h = renderToStaticMarkup(createElement(KpRulingPanel, { t: tech, kbLookup: null }));
    const sig = h.slice(h.indexOf('data-testid="astro-kp-ruling-sig"'));
    const rows = sig.slice(0, sig.indexOf("</table>")).split("<tr").slice(1);
    const tagged = rows.filter((r) => r.includes("data-kp-node-method")).map((r) => [r.match(/>(Rahu|Ketu)</)?.[1], r.match(/data-kp-node-method="([a-z_]+)"/)?.[1]]);
    assert.deepEqual(tagged.sort(), [["Ketu", "agent_houses"], ["Rahu", "agent_houses"]]);
    assert.ok(h.includes(KP_NODE_SIG_METHODS.agent_houses.label));
  });

  console.log(`\nastrology phase6.2 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase6.2 harness çöktü:", e);
  process.exit(1);
});
