/**
 * ASTROLOJİ AŞAMA 6.1 harness'i — KP teknik tutarlılık (Rahu/Ketu yöntem denetimi, Dasha rozeti, KP sınırları).
 *
 * 6.1A: Roxy düğüm significator'larının uç başına hangi kuralla üretildiği golden'lardan BAĞIMSIZ olarak sınanır.
 *   Kurallar YALNIZ bu test dosyasında hesaplanır (üretimde hesap motoru YOK; üretim yalnız yöntemi ETİKETLER).
 *   – sade 4 düzey: L1 yıldız lordunun evi · L2 kendi evi · L3 yıldız lordunun sahip olduğu evler · L4 sahip olduğu evler
 *   – ajan ekli: düğümün sade düzeyleri ∪ ajanların sade düzeyleri (ajan = burç lordu + aynı burçtaki + 7. burçtaki grahalar)
 *   – burç lordu kümesi: düğümün listesi = bulunduğu burcun lordunun düzleştirilmiş significator kümesi
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase61.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { KP_NODE_SIG_METHODS, KP_NODE_SIG_SOURCE, SIGN_LORDS, isKpNode } from "@/lib/astrology/model/kp";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import type { SignId } from "@/lib/astrology/model/western";
import { KpChartPanel, KpHoraryPanel, KpRulingPanel } from "@/app/admin/astroloji/_components/KpPanels";
import { VedicDashaPanel, todayShift } from "@/app/admin/astroloji/_components/VedicPanels";
import { TechniqueTechnical } from "@/app/admin/astroloji/_components/TimingPanels";
import ProviderInterpretationPanel, { KP_STRENGTH_TR } from "@/app/admin/astroloji/_components/ProviderInterpretationPanel";
import { TECHNIQUE_META, techniqueLabel } from "@/app/admin/astroloji/_lib/techniques";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const KC = load("kp-chart");
const KDM = load("kp-dasha-major");
const RP = load("kp-ruling-planets");
const HO = load("kp-horary");

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

// ─── Bağımsız KP düğüm kuralı modeli (YALNIZ test) ────────────────────────────
const ID: Record<string, VedicGrahaId> = { Sun: "sun", Moon: "moon", Mars: "mars", Mercury: "mercury", Jupiter: "jupiter", Venus: "venus", Saturn: "saturn", Rahu: "rahu", Ketu: "ketu" };
const SIGN: Record<string, SignId> = {
  Aries: "aries", Taurus: "taurus", Gemini: "gemini", Cancer: "cancer", Leo: "leo", Virgo: "virgo",
  Libra: "libra", Scorpio: "scorpio", Sagittarius: "sagittarius", Capricorn: "capricorn", Aquarius: "aquarius", Pisces: "pisces",
};
const ORDER: SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
type Body = { id: VedicGrahaId; sign: SignId; house: number; star: VedicGrahaId };
type Model = { bodies: Map<VedicGrahaId, Body>; owner: (h: number) => VedicGrahaId };
type Levels = Record<1 | 2 | 3 | 4, number[]>;

/** Golden yanıttan YALNIZ ham konum alanları (burç, ev, yıldız lordu) + cusp burçları alınır; significator alanları KULLANILMAZ. */
function modelFrom(bodiesRaw: { planet: string; sign: string; house: number; starLord: string }[], cuspSigns: string[]): Model {
  const bodies = new Map<VedicGrahaId, Body>();
  for (const b of bodiesRaw) bodies.set(ID[b.planet], { id: ID[b.planet], sign: SIGN[b.sign], house: b.house, star: ID[b.starLord] });
  return { bodies, owner: (h) => SIGN_LORDS[SIGN[cuspSigns[h - 1]]] };
}
const owned = (m: Model, g: VedicGrahaId) => (isKpNode(g) ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => m.owner(h) === g));
function plain(m: Model, g: VedicGrahaId): Levels {
  const b = m.bodies.get(g)!;
  const star = m.bodies.get(b.star)!;
  return { 1: [star.house], 2: [b.house], 3: owned(m, b.star), 4: owned(m, g) };
}
type AgentRule = { seventh: boolean; marsFourth?: boolean };
function agentsOf(m: Model, node: VedicGrahaId, rule: AgentRule): VedicGrahaId[] {
  const n = m.bodies.get(node)!;
  const i = ORDER.indexOf(n.sign);
  const out = new Set<VedicGrahaId>([SIGN_LORDS[n.sign]]);
  for (const b of m.bodies.values()) {
    if (isKpNode(b.id)) continue;
    const d = (ORDER.indexOf(b.sign) - i + 12) % 12;
    if (d === 0) out.add(b.id);
    if (rule.seventh && d === 6) out.add(b.id);
    if (rule.marsFourth && b.id === "mars" && (i - ORDER.indexOf(b.sign) + 12) % 12 === 3) out.add(b.id);
  }
  return [...out];
}
function agent(m: Model, node: VedicGrahaId, rule: AgentRule = { seventh: true }): Levels {
  const all = [node, ...agentsOf(m, node, rule)];
  const lv = (l: 1 | 2 | 3 | 4) => [...new Set(all.flatMap((g) => plain(m, g)[l]))];
  return { 1: lv(1), 2: lv(2), 3: lv(3), 4: lv(4) };
}
const setEq = (a: number[], b: number[]) => [...new Set(a)].sort((x, y) => x - y).join() === [...new Set(b)].sort((x, y) => x - y).join();
const levelsEq = (a: Levels, b: Levels) => ([1, 2, 3, 4] as const).every((l) => setEq(a[l], b[l]));
const flat = (l: Levels) => [...new Set([1, 2, 3, 4].flatMap((k) => l[k as 1 | 2 | 3 | 4]))];
const fromRoxyArr = (arr: { level: number; houses: number[] }[]): Levels => ({ 1: [], 2: [], 3: [], 4: [], ...Object.fromEntries(arr.map((x) => [x.level, x.houses])) }) as Levels;

const natalBodies = [...KC.response.planets, { planet: "Rahu", ...KC.response.nodes.rahu }, { planet: "Ketu", ...KC.response.nodes.ketu }];
const NATAL = modelFrom(natalBodies, KC.response.cusps.map((c: J) => c.sign));
const HORARY = modelFrom(HO.response.planets, HO.response.cusps.map((c: J) => c.sign));
const dashaNode = (n: string): Levels => {
  const s = KDM.response.mahadashas.find((x: J) => x.planet === n).significators.signifies;
  return { 1: s.L1, 2: s.L2, 3: s.L3, 4: s.L4 };
};
const horaryPW = (n: string) => HO.response.significators.planetWise.find((x: J) => x.planet === n);

// ─── Projeksiyonlar (arayüz testi için; üretim adaptörü) ──────────────────────
const AT = "2026-10-07T09:00";
const project = (id: string, opts: Record<string, unknown>, raw: J) => {
  const def = getTechnique(id)!;
  const o = def.parseOptions(opts, new Date("2026-10-08T12:00:00Z"))!;
  const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, o)[0];
  const p = def.project(u, raw, o) as J;
  assert.ok(p.ok, `${id}: ${JSON.stringify(p.errors)}`);
  return p.technical;
};
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
/** Satır başına (graha adı → yöntem etiketi) eşlemesi: data-kp-node-method özniteliği satırın içinde. */
const nodeTagsIn = (h: string, rowAttr = "<tr") =>
  h
    .split(rowAttr)
    .map((row) => row.match(/data-kp-node-method="([a-z_]+)"/)?.[1] ?? null)
    .filter((x): x is string => x !== null);

async function main() {
  // ═══ 6.1A — Rahu/Ketu yöntem denetimi (golden kanıtı) ══════════════════════
  await t("6.1A kp/chart: düğüm listeleri SADE 4 düzey kuralıyla birebir (ajan eki YOK) — bağımsız model", () => {
    for (const n of ["Rahu", "Ketu"]) {
      const roxy = fromRoxyArr(KC.response.significators.planetWise.find((x: J) => x.planet === n).signifies);
      assert.ok(levelsEq(roxy, plain(NATAL, ID[n])), `${n}: ${JSON.stringify(roxy)} ≠ sade ${JSON.stringify(plain(NATAL, ID[n]))}`);
      assert.ok(!levelsEq(roxy, agent(NATAL, ID[n])), `${n}: harita listesi ajan ekli kurala da uyuyorsa ayrım kanıtsız`);
    }
    // Görünür 7 graha için de sade kural birebir (modelin kendisi doğru kurulmuş mu).
    for (const p of KC.response.significators.planetWise.filter((x: J) => !["Rahu", "Ketu"].includes(x.planet))) assert.ok(levelsEq(fromRoxyArr(p.signifies), plain(NATAL, ID[p.planet])), p.planet);
  });

  await t("6.1A dasha ucu: düğüm düzeyleri = sade ∪ ajanlar (burç lordu + aynı burç + 7. burç) — natal Rahu (Satürn + Merkür) ve Ketu (Ay + Merkür) 8/8 düzey", () => {
    assert.deepEqual(agentsOf(NATAL, "rahu", { seventh: true }).sort(), ["mercury", "saturn"]);
    assert.deepEqual(agentsOf(NATAL, "ketu", { seventh: true }).sort(), ["mercury", "moon"]);
    for (const n of ["Rahu", "Ketu"]) assert.ok(levelsEq(dashaNode(n), agent(NATAL, ID[n])), `${n}: ${JSON.stringify(dashaNode(n))} ≠ ${JSON.stringify(agent(NATAL, ID[n]))}`);
    // Dasha ucu görünür grahalarda sade kuralı verir (ajan eki yalnız düğümde).
    for (const m of KDM.response.mahadashas.filter((x: J) => !["Rahu", "Ketu"].includes(x.planet))) assert.ok(levelsEq(dashaNode(m.planet), plain(NATAL, ID[m.planet])), m.planet);
  });

  await t("6.1A horary ucu: signifies = ajan ekli (Rahu: Satürn + Ay · Ketu: Güneş + Ay) 8/8 düzey; allHouses + ev tablosu = SADE; agentHouses = L2 ∪ L4 (ajan ekli) → AYNI yanıtta iki yöntem", () => {
    assert.deepEqual(agentsOf(HORARY, "rahu", { seventh: true }).sort(), ["moon", "saturn"]);
    assert.deepEqual(agentsOf(HORARY, "ketu", { seventh: true }).sort(), ["moon", "sun"]);
    for (const n of ["Rahu", "Ketu"]) {
      const pw = horaryPW(n);
      const ag = agent(HORARY, ID[n]);
      assert.ok(levelsEq(fromRoxyArr(pw.signifies), ag), `${n} signifies`);
      assert.ok(setEq(pw.allHouses, flat(plain(HORARY, ID[n]))), `${n} allHouses sade değil`);
      assert.ok(!setEq(pw.allHouses, flat(ag)), `${n}: allHouses ajan kümesine de eşitse ayrım kanıtsız`);
      assert.ok(setEq(pw.agentHouses, [...ag[2], ...ag[4]]), `${n} agentHouses`);
      // Ev tablosu (houseWise) düğümü yalnız sade düzeylerinde listeler.
      for (const h of HO.response.significators.houseWise)
        for (const s of h.significators) if (s.planets.includes(n)) assert.ok(plain(HORARY, ID[n])[s.level as 1 | 2 | 3 | 4].includes(h.house), `${n} ev ${h.house} L${s.level}`);
    }
  });

  await t("6.1A ruling ucu: Ketu listesi = burç lordu AY'ın kümesi; Ketu'nun sade / ajan ekli kümesine EŞİT DEĞİL; sıra Ay'ın düzey sırası değil (açıklanamadı → belirsiz)", () => {
    const ketu = RP.response.significators.find((x: J) => x.planet === "Ketu").signifies as number[];
    const lord = SIGN_LORDS[NATAL.bodies.get("ketu")!.sign];
    assert.equal(lord, "moon");
    assert.ok(setEq(ketu, flat(plain(NATAL, lord))), `ruling Ketu ${ketu} ≠ Ay kümesi`);
    assert.ok(!setEq(ketu, flat(plain(NATAL, "ketu"))) && !setEq(ketu, flat(agent(NATAL, "ketu"))));
    // Düzey sırasıyla düzleştirilmiş Ay listesi [9,6,12,10]; Roxy [9,12,6,10] → sıra kuralı bilinmiyor.
    assert.deepEqual(flat(plain(NATAL, "moon")), [9, 6, 12, 10]);
    assert.notDeepEqual(ketu, flat(plain(NATAL, "moon")));
    // Görünür ruling planet'lerde sıra = düzey sırası (L1→L4) — tutarsızlık yalnız düğümde.
    for (const s of RP.response.significators.filter((x: J) => x.planet !== "Ketu")) assert.deepEqual(s.signifies, flat(plain(NATAL, ID[s.planet])), s.planet);
  });

  await t("6.1A belirsizlik sınırları: Mars'ın 4. bakışı sayılmıyor (sayılırsa natal Ketu L4'e 2,7 eklenir ≠ Roxy); 7. burç dışlanırsa natal + horary Rahu tutmaz; '7. burç bakışı' ↔ 'karşı düğümle kavuşma' bu golden'larda AYIRT EDİLEMEZ", () => {
    assert.ok(!levelsEq(dashaNode("Ketu"), agent(NATAL, "ketu", { seventh: true, marsFourth: true })), "Mars 4. bakış dahil kural da tutuyorsa kapsam kanıtı yok");
    assert.ok(!levelsEq(dashaNode("Rahu"), agent(NATAL, "rahu", { seventh: false })));
    assert.ok(!levelsEq(fromRoxyArr(horaryPW("Rahu").signifies), agent(HORARY, "rahu", { seventh: false })));
    // 7. burçtaki ajan her iki golden'da da karşı düğümle AYNI burçta → iki hipotez aynı sonucu verir.
    for (const [m, node, other] of [[NATAL, "rahu", "ketu"], [HORARY, "rahu", "ketu"]] as const) {
      const seventh = [...m.bodies.values()].filter((b) => !isKpNode(b.id) && (ORDER.indexOf(b.sign) - ORDER.indexOf(m.bodies.get(node)!.sign) + 12) % 12 === 6);
      assert.ok(seventh.length > 0 && seventh.every((b) => b.sign === m.bodies.get(other)!.sign));
    }
  });

  await t("6.1A etiket kaynağı: uç → yöntem eşlemesi golden kanıtıyla aynı; her yöntemin durum metni (doğrulandı / kısmen belirsiz / belgelenmemiş) mevcut", () => {
    assert.deepEqual({ ...KP_NODE_SIG_SOURCE }, { chart: "plain", horaryLevels: "plain", horaryAgent: "agent", dasha: "agent", ruling: "sign_lord" });
    assert.match(KP_NODE_SIG_METHODS.plain.status, /doğrulandı/);
    assert.match(KP_NODE_SIG_METHODS.agent.status, /belirsiz/);
    assert.match(KP_NODE_SIG_METHODS.sign_lord.status, /Belgelenmemiş/);
    assert.ok(!/doğrulandı/i.test(KP_NODE_SIG_METHODS.sign_lord.status) && !/^Bağımsız olarak doğrulandı/.test(KP_NODE_SIG_METHODS.agent.status), "belirsiz yöntem kesin diye sunulmamalı");
  });

  // ═══ 6.1A — arayüz: her düğüm satırında doğru yöntem etiketi; listeler birleştirilmez ═════
  const chartT = project("kp.chart", {}, KC.response);
  const dashaT = project("kp.dasha", {}, KDM.response);
  const rulingT = project("kp.ruling", { atUtc: AT }, RP.response);
  const horaryT = project("kp.horary", { atUtc: AT, horaryNumber: 108 }, HO.response);

  await t("6.1A arayüz: KP haritası significator tablosunda Rahu + Ketu 'sade kural'; açıklama kutusu yalnız sade yöntemi anlatır", () => {
    const h = html(createElement(KpChartPanel, { t: chartT, kbLookup: null }));
    assert.deepEqual(nodeTagsIn(h), ["plain", "plain"]);
    assert.ok(h.includes('data-testid="astro-kp-node-method"') && h.includes(KP_NODE_SIG_METHODS.plain.label));
    assert.ok(!h.includes(KP_NODE_SIG_METHODS.agent.label) && !h.includes(KP_NODE_SIG_METHODS.sign_lord.label));
  });

  await t("6.1A arayüz: KP dasha tablosunda yalnız Rahu/Ketu satırları 'ajan ekli'; görünür grahalar etiketsiz; Vedik (Lahiri) dasha'da etiket YOK", () => {
    const h = html(createElement(VedicDashaPanel, { t: dashaT, kbLookup: null }));
    const rows = h.split("<tr").filter((r) => r.includes("data-dasha-lord="));
    const tagged = rows.filter((r) => r.includes("data-kp-node-method")).map((r) => r.match(/data-dasha-lord="([a-z]+)"/)![1]);
    assert.deepEqual(tagged.sort(), ["ketu", "rahu"]);
    assert.ok(rows.filter((r) => r.includes("data-kp-node-method")).every((r) => r.includes('data-kp-node-method="agent"')));
    assert.ok(h.includes(KP_NODE_SIG_METHODS.agent.label) && h.includes('data-testid="astro-kp-dasha-method"'));
    const lahiri = project("vedic.dasha", {}, load("vedic-dasha-major").response);
    const hv = html(createElement(VedicDashaPanel, { t: lahiri, kbLookup: null }));
    assert.ok(!hv.includes("data-kp-node-method") && !hv.includes("astro-kp-node-method") && !hv.includes("astro-kp-dasha-method"));
  });

  await t("6.1A arayüz: ruling significator tablosunda Ketu 'burç lordu kümesi (belgelenmemiş)'; Merkür/Mars/Güneş etiketsiz; eski belirsiz not kaldırıldı", () => {
    const h = html(createElement(KpRulingPanel, { t: rulingT, kbLookup: null }));
    const sig = h.slice(h.indexOf('data-testid="astro-kp-ruling-sig"'));
    assert.deepEqual(nodeTagsIn(sig.slice(0, sig.indexOf("</table>"))), ["sign_lord"]);
    assert.ok(h.includes(KP_NODE_SIG_METHODS.sign_lord.status));
    assert.ok(!h.includes("farklı bir kuralla verebilir"));
  });

  await t("6.1A arayüz: horary tablosu düğümlerde 'sade kural' + mavi '+' ajan ekleri; açıklama iki yöntemi AYRI adlandırır", () => {
    const h = html(createElement(KpHoraryPanel, { t: horaryT, kbLookup: null, placeLabel: "İstanbul" }));
    const sig = h.slice(h.indexOf('data-testid="astro-kp-sig-planet"'));
    assert.deepEqual(nodeTagsIn(sig.slice(0, sig.indexOf("</table>"))), ["plain", "plain"]);
    assert.ok(/\+[0-9,]+<\/span>/.test(sig), "ajan eki işareti yok");
    assert.ok(h.includes(KP_NODE_SIG_METHODS.plain.label) && h.includes(KP_NODE_SIG_METHODS.agent.label));
  });

  // ═══ 6.1B — Dasha "bugün" rozeti ═════════════════════════════════════════
  await t("6.1B rozet kayması: uçlarda içe hizalı (taşma yok), ortada ortalı", () => {
    assert.deepEqual([0, 3, 7.9, 8, 50, 92, 92.1, 99.9, 100].map(todayShift), ["0%", "0%", "0%", "-50%", "-50%", "-50%", "-100%", "-100%", "-100%"]);
  });

  await t("6.1B yerleşim: rozet GİZLENMEDİ; kendi satırında (çubuktan ve başlıktan önce, mutlak -top YOK); KP ve Vedik (Lahiri) dasha aynı bileşen", () => {
    for (const tech of [dashaT, project("vedic.dasha", {}, load("vedic-dasha-major").response)]) {
      const h = html(createElement(VedicDashaPanel, { t: tech, kbLookup: null }));
      const tl = h.slice(h.indexOf('data-testid="astro-vedic-dasha-timeline"'));
      assert.ok(tl.includes('data-testid="astro-dasha-today"') && tl.includes(">bugün<"), "rozet görünmeli");
      assert.ok(tl.indexOf('data-testid="astro-dasha-today-row"') < tl.indexOf("flex h-9"), "rozet satırı çubuktan önce");
      assert.ok(!/-top-4/.test(tl.slice(0, tl.indexOf("mt-1 flex justify-between"))), "eski mutlak konum kaldı");
      const span = tl.slice(tl.lastIndexOf("<span", tl.indexOf('data-testid="astro-dasha-today"')), tl.indexOf(">bugün<"));
      assert.match(span, /style="left:[0-9.]+%;transform:translateX\((0%|-50%|-100%)\)"/);
    }
  });

  await t("6.1B görsel düzeltme hesaba dokunmadı: dasha teknik çıktısı golden'dan aynı (9 dönem, tarih/süre/lord)", () => {
    const again = project("kp.dasha", {}, KDM.response);
    assert.deepEqual(again, dashaT);
    assert.equal(dashaT.periods.length, 9);
    assert.deepEqual(dashaT.periods.map((x: J) => x.lord), KDM.response.mahadashas.map((m: J) => ID[m.planet]));
  });

  // ═══ 6.1C — KP teknik sınırlarının sunumu ════════════════════════════════
  const asSaved = (technique: string, technical: unknown, options: Record<string, unknown> = {}) =>
    html(createElement(TechniqueTechnical, { technique, technical, timeUnknownMasked: false, warnings: [], names: ["A", "B"], options }));
  const transitT = project("kp.transit", { atUtc: AT }, load("kp-planets-at").response);

  await t("6.1C KP transit: seçici + sekme etiketi 'kısmi'; panel (çalışma alanı = kayıtlı analiz bileşeni) KISMİ uyarısı; natal cusp / Placidus ev sütunu / ev konumu YOK", () => {
    assert.match(techniqueLabel("kp.transit"), /kısmi/);
    assert.match(TECHNIQUE_META["kp.transit"].hint, /natal ev analizi yok/);
    const h = asSaved("kp.transit", transitT);
    assert.ok(h.includes("Kısmi destek:") && /natal cusp.*YOKTUR/.test(h) && h.includes("hesaplamaz"));
    assert.ok(!h.includes("Ev (Placidus)") && !/data-kp-item="c\d/.test(h) && !h.includes("astro-kp-sig-"), "transitte natal ev / cusp / significator görünmemeli");
    assert.ok(transitT.bodies.every((b: J) => b.house === undefined));
  });

  await t("6.1C olay zamanlaması: KP dasha bandı kısa ve açık ('olay tahmini değildir' + Roxy sunmaz + Yaşam Sistemi üretmez); kayıtlı analiz bileşeninde de var; tarih/olay eşleştiren bir alan YOK", () => {
    const h = asSaved("kp.dasha", dashaT);
    const band = h.slice(h.indexOf('data-testid="astro-kp-dasha-method"'), h.indexOf("</p>", h.indexOf('data-testid="astro-kp-dasha-method"')));
    assert.ok(/Olay tahmini değildir/.test(band) && /sunmaz/.test(band) && /üretmez/.test(band));
    assert.ok(band.replace(/<[^>]+>/g, "").length < 320, "uyarı kısa olmalı");
    assert.ok(!/olay tarihi|gerçekleşme (tarihi|zamanı)|olasılığı yüksek|kesinlikle gerçekleşir/i.test(h));
    assert.ok(!JSON.stringify(dashaT).match(/event|olay|predict/i), "teknik çıktıda olay alanı olmamalı");
  });

  await t("6.1C Roxy KP güç değerlendirmesi: başlık 'olay olasılığı değildir'; İngilizce etiket Türkçe 'bağ' etiketine çevrilir; yalnız yorum katmanında", () => {
    const def = getTechnique("kp.dasha")!;
    const o = def.parseOptions({}, new Date())!;
    const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, o)[0];
    const pr = def.project(u, KDM.response, o) as J;
    const h = html(createElement(ProviderInterpretationPanel, { interpretation: { visible: true, provider: "roxy", lang: "tr", content: pr.interpretation, notice: "n" } }));
    assert.ok(h.includes("olay olasılığı veya olumluluk DEĞİLDİR"));
    assert.ok(Object.values(KP_STRENGTH_TR).some((x) => h.includes(x)) && !/· (strong|very-strong|moderate|weak)</.test(h));
    assert.ok(!JSON.stringify(pr.technical).includes('"strength"'));
  });

  await t("6.1C Rahu/Ketu: belirsiz yöntemler arayüzde 'doğrulandı' diye sunulmuyor (ruling + ajan kapsamı durum metni görünür)", () => {
    const r = html(createElement(KpRulingPanel, { t: rulingT, kbLookup: null }));
    assert.ok(r.includes("Belgelenmemiş") && !/burç lordu kümesi[^<]*doğrulandı/i.test(r));
    const d = asSaved("kp.dasha", dashaT);
    // renderToStaticMarkup kesme işaretini &#x27; olarak kaçışlar.
    assert.ok(d.includes(KP_NODE_SIG_METHODS.agent.status.replace(/'/g, "&#x27;")) && d.includes("kısmen belirsiz"));
  });

  console.log(`\nastrology phase6.1 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase6.1 harness çöktü:", e);
  process.exit(1);
});
