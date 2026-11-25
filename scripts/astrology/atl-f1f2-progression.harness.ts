/**
 * F1/F2 — Secondary progression ORTALAMA DÜĞÜM + KUTUP NATAL EVLERİ regresyon harness'i (14.11.2026, 1.000 vakalık doğrulama sonrası).
 *
 * Kanıt (yeni ücretli çağrı YOK; ağ YOK): fixtures/atl-f1f2/
 *   progression-real-18.json     — 18 GERÇEK /astrology/progressions yanıtı (adaptör -1 dönemi): 10 mean isteği (sağlayıcı gerçek düğüm
 *                                  döndürdü), 2 kutup (Tromsø 69,65°; sağlayıcı natal evleri sessizce tam burç), 6 true kontrol.
 *   progression-500-node-ref.json — 500 sentetik vakanın (1940–2026) ilerletilmiş anı + bağımsız referanslar (Swiss Ephemeris 2.10.03
 *                                  SE_MEAN_NODE / SE_TRUE_NODE — pyswisseph depo DIŞINDA; Simon vd. 1994 + Skyfield IAU 2000A).
 *
 *   A) Tanım: ürünün ortalama düğümü (Meeus 47.7 + Δψ) 500 ilerletilmiş anda Swiss SE_MEAN_NODE ile ≤ 5″ (önceden sabitlenmiş tolerans;
 *      ölçülen ≤ 0,28″ → koruma eşiği 0,5″), Simon 1994 ile ≤ 0,5″; ilerletilmiş an referansla birebir; Güney = Kuzey + 180°; geri hareket.
 *   B) Mean ≠ true: sağlayıcının mean yanıtları bağımsız TRUE ile ≤ 1″, MEAN ile > 1000″ (bulgu); -2 çıktısı MEAN, sağlayıcı değeri DEĞİL.
 *   C) 10 gerçek mean vakası adaptör -2'den: düğümler yerel mean, nodeComputation damgası, düğüm natal evi null, diğer 12 nokta aynen.
 *   D) True kontrol + bütün true düğümler: -2 çıktısı sağlayıcı değerleriyle BİREBİR (gerçek düğüm hesabı değişmedi).
 *   E) Kutup: 2 gerçek vaka → natal ev numaraları taşınmaz, natalHouseStatus damgası, ekran/rapor "Natal ev (Placidus)" GÖSTERMEZ.
 *   F) Sınır vakaları (sentetik enlem): 66,5 → ev korunur; 66,5001 / −66,6 → kutup; 64,8378 → korunur; eşik = natal kutup engeli.
 *   G) Eski kayıtlar: -1 mean / -1 kutup kaydı aynen kalır; okuma anında uyarı + doğru etiket; Word/PDF modeli aynı metin.
 *   H) Güvenlik: yankı uyuşmazlığı / aralık dışı an → sonuç VERİLMEZ; istek gövdesi ve uç nokta aynı; adaptör -2 (önbellek ayrımı).
 *   I) Uçtan uca (sahte DB, kayıtlı gerçek yanıt): hesapla → kaydet → arşivden aç → rapor; eski kayıt simülasyonu not + etiket.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atl-f1f2-progression.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
// I18N mod-g: Atlas bileşenleri metni katalogdan alır → çizim next-intl sağlayıcısıyla (TR katalog = önceki metin; beklentiler değişmedi).
import { renderToStaticMarkup } from "./intlRender";
import { getTechnique, type CalcUnit } from "@/lib/astrology/engine/techniques";
import { ROXY_PROGRESSION } from "@/lib/astrology/providers/roxy/timing";
import { targetDateBody } from "@/lib/astrology/providers/roxy/requests";
import { progressedInstant, progressedMeanNodes, progressionRequestFrame } from "@/lib/astrology/progressionNodes";
import { LEGACY_MEAN_NODE_WARNING, LEGACY_POLAR_NATAL_HOUSE_LABEL, LEGACY_POLAR_NATAL_HOUSE_WARNING, MEAN_NODE_LOCAL_NOTE, PROGRESSION_POLAR_LATITUDE } from "@/lib/astrology/progressionNodesText";
import { progressionHouseColumns } from "@/lib/astrology/progressionHouses";
import { POLAR_HOUSE_LATITUDE } from "@/lib/astrology/engine/service";
import { NATAL_POLAR_HOUSE_LATITUDE } from "@/lib/astrology/houses/natalLocal";
import { legacyMethodNotes } from "@/lib/astrology/legacyMethod";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { ProgressionPanel } from "@/app/admin/astroloji/_components/TimingPanels";
import { natalHouseOf } from "@/lib/astrology/transitDetail";
import { createFakeClient, createStore } from "@/scripts/astrology/fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import type { ProgressionTechnical } from "@/lib/astrology/model/westernTiming";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Real = { testId: string; grup: "mean" | "polar" | "true_kontrol"; yer: string; tz: string; dogumYerel: string; endpoint: string; body: J; response: J };
type Ref = { testId: string; body: J; instantUtc: string; swissMean: number; simonMean: number; swissTrue: number; providerNorthNode: number };
const FX = join(__dirname, "fixtures", "atl-f1f2");
const REAL = (JSON.parse(readFileSync(join(FX, "progression-real-18.json"), "utf8")) as { cases: Real[] }).cases;
const REF = (JSON.parse(readFileSync(join(FX, "progression-500-node-ref.json"), "utf8")) as { cases: Ref[] }).cases;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 14).join("\n     ")}`);
  }
}

const sec = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) * 3600;
const PNAME: Record<string, string> = { north_node: "North Node", south_node: "South Node" };
const def = getTechnique("western.progression")!;
const unitOf = (body: J) => ({ body }) as unknown as CalcUnit;
function project(c: { body: J; response: J }, bodyOverride: J = {}) {
  const body = { ...c.body, ...bodyOverride };
  return def.project(unitOf(body), structuredClone(c.response), { targetDate: body.targetDate, nodeType: body.nodeType }) as J;
}
/** Eski (-1) adaptörün kayıtlı katmanı: sağlayıcı değerleri aynen (düğüm dahil), ev numaraları aynen, damga yok. */
function legacyTechnical(c: Real): ProgressionTechnical {
  const p = project(c);
  const raw = c.response.planets as J[];
  const bodies = p.technical.bodies.map((b: J) => {
    const r = raw.find((x) => x.name === (PNAME[b.id] ?? "")) ?? null;
    const house = raw.find((x) => mapId(x.name) === b.id)?.house ?? null;
    return r ? { ...b, longitude: r.longitude, sign: b.sign, degreeInSign: r.longitude % 30, speed: r.speed, retrograde: r.isRetrograde, house } : { ...b, house };
  });
  const rest = { ...p.technical };
  delete rest.nodeComputation;
  delete rest.natalHouseStatus;
  return { ...rest, bodies } as ProgressionTechnical;
}
const mapId = (n: string) => ({ Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune", Pluto: "pluto", "North Node": "north_node", "South Node": "south_node", Chiron: "chiron", "Black Moon Lilith": "lilith" })[n] ?? n;
// K4 (15.11.2026): başlıktaki Latince/İngilizce ev sistemi adı büyük harf için <span lang="en"> ile sarılır; metin karşılaştırması işaretsiz.
const html = (t: ProgressionTechnical) => renderToStaticMarkup(createElement(ProgressionPanel, { t })).replace(/<span lang="en">([^<]*)<\/span>/g, "$1");
const reportOf = (technique: string, technical: J, legacyNotes: J[] = [], profile: J = null) =>
  reportTexts(buildAstroReport({ technique, technical, title: "TEST", analysisAt: "2026-11-14T00:00:00Z", params: {}, method: {}, profile, versions: {}, legacyNotes } as J)).join("\n");

(async () => {
  const means = REAL.filter((c) => c.grup === "mean");
  const polars = REAL.filter((c) => c.grup === "polar");
  const controls = REAL.filter((c) => c.grup === "true_kontrol");

  await t(`A) tanım: 500 ilerletilmiş anda ürün ortalama düğümü ↔ Swiss SE_MEAN_NODE ≤ 5″ (koruma 0,5″) ve ↔ Simon 1994 ≤ 0,5″; an birebir`, () => {
    assert.equal(REF.length, 500);
    let mxS = 0;
    let mxM = 0;
    for (const r of REF) {
      const f = progressionRequestFrame(r.body)!;
      const p = progressedInstant(f)!;
      assert.equal(new Date(p.ms).toISOString(), r.instantUtc, `${r.testId} ilerletilmiş an`);
      const m = progressedMeanNodes(f)!;
      mxS = Math.max(mxS, sec(m.north.longitude, r.swissMean));
      mxM = Math.max(mxM, sec(m.north.longitude, r.simonMean));
      assert.ok(sec(m.south.longitude, r.swissMean + 180) <= 5, `${r.testId} güney`);
      assert.ok(m.north.retrograde && m.south.retrograde && m.north.speed < -0.05 && m.north.speed > -0.056, `${r.testId} hız ${m.north.speed}`);
    }
    assert.ok(mxS <= 5, `Swiss tolerans ${mxS}`);
    // Koruma eşiği 0,5″ (KABUL toleransı 5″ değişmedi): Δψ astronomy-engine e_tilt'ten (IAU 2000B, kısaltılmış seri) — pro/** ürün
    // kodundan import edilemez (astro-pro Z19/A14). Ölçülen: 2000A'lı pro meanNodeLon'dan en çok 0,25″; Swiss'ten en çok ~0,28″.
    assert.ok(mxS <= 0.5, `Swiss koruma ${mxS}`);
    assert.ok(mxM <= 0.5, `Simon ${mxM}`);
    console.log(`     ölçülen: Swiss max ${mxS.toFixed(3)}″ · Simon max ${mxM.toFixed(3)}″`);
    const years = new Set(REF.map((r) => Number(r.body.date.slice(0, 4))));
    assert.ok(Math.min(...years) <= 1940 && Math.max(...years) >= 2026 && years.size >= 80, "1940–2026 kapsamı");
  });

  await t("B) mean ≠ true: sağlayıcının 10 mean yanıtı bağımsız TRUE ≤ 1″ / MEAN > 1000″ (bulgu); 490 true yanıt TRUE ≤ 1″", () => {
    const refById = new Map(REF.map((r) => [r.testId, r]));
    let nm = 0;
    for (const r of REF) {
      assert.ok(sec(r.providerNorthNode, r.swissTrue) <= 1, `${r.testId} sağlayıcı ≠ true`);
      if (r.body.nodeType === "mean") {
        nm += 1;
        assert.ok(sec(r.providerNorthNode, r.swissMean) > 1000, `${r.testId} sağlayıcı mean'e yakın?`);
      }
    }
    assert.equal(nm, 10);
    for (const c of means) {
      const p = project(c);
      assert.ok(p.ok, `${c.testId} ${JSON.stringify(p.errors)}`);
      const nn = p.technical.bodies.find((b: J) => b.id === "north_node");
      const r = refById.get(c.testId)!;
      assert.ok(sec(nn.longitude, r.swissMean) <= 0.5, `${c.testId} -2 ≠ mean`);
      assert.ok(sec(nn.longitude, r.providerNorthNode) > 1000, `${c.testId} -2 sağlayıcı değerini taşıyor`);
    }
  });

  await t("C) 10 gerçek mean vakası (-2): düğümler yerel mean, damga, düğüm natal evi null, diğer 12 nokta sağlayıcıyla birebir", () => {
    for (const c of means) {
      const p = project(c);
      const tt = p.technical as ProgressionTechnical;
      assert.equal(tt.nodeType, "mean");
      assert.equal(tt.nodeComputation?.source, "local_mean");
      assert.equal(tt.nodeComputation?.method, "meeus-47.7+dpsi");
      assert.ok(!tt.natalHouseStatus);
      for (const b of tt.bodies) {
        const r = (c.response.planets as J[]).find((x) => mapId(x.name) === b.id)!;
        if (b.id === "north_node" || b.id === "south_node") {
          assert.equal(b.house, null, `${c.testId} ${b.id} ev`);
          assert.equal(b.retrograde, true);
          assert.ok(Math.abs(b.degreeInSign - (b.longitude % 30)) < 1e-9);
        } else {
          assert.equal(b.longitude, r.longitude, `${c.testId} ${b.id}`);
          assert.equal(b.house, r.house, `${c.testId} ${b.id} ev`);
          assert.equal(b.speed, r.speed);
          assert.equal(b.retrograde, r.isRetrograde);
        }
      }
      const sn = tt.bodies.find((b) => b.id === "south_node")!;
      const nn = tt.bodies.find((b) => b.id === "north_node")!;
      assert.ok(Math.abs(((sn.longitude - nn.longitude + 360) % 360) - 180) < 1e-9);
      // Ekran: yöntem notu var; eski uyarı yok; düğüm natal evi "—" (çerçeve yok), diğer noktalar sağlayıcı natal Placidus.
      const h = html(tt);
      assert.ok(h.includes('data-testid="astro-progression-mean-node-note"') && !h.includes("astro-progression-legacy-mean"));
      assert.ok(h.includes("Natal ev (Placidus)"));
      const hc = progressionHouseColumns(tt);
      assert.equal(hc.natal?.of("north_node"), null);
      assert.equal(hc.natal?.of("sun"), (c.response.planets as J[])[0].house);
      const rep = reportOf("western.progression", tt);
      assert.ok(rep.includes(MEAN_NODE_LOCAL_NOTE) && !rep.includes(LEGACY_MEAN_NODE_WARNING));
      // Yorum: düğüm burcu değiştiyse sağlayıcının düğüm yorumu gösterilmez; değişmediyse aynen.
      const rn = (c.response.planets as J[]).find((x) => x.name === "North Node")!;
      const keep = p.interpretation.bodies.some((x: J) => x.id === "north_node");
      assert.equal(keep, nn.sign === p.technical.bodies.find((b: J) => b.id === "north_node").sign && Math.floor(rn.longitude / 30) === Math.floor(nn.longitude / 30));
    }
  });

  await t("C2) natal çerçeve (aynı düğüm türlü natal) varsa düğümlerin natal evi çerçevenin ev başlarından (mean boylamla)", () => {
    const c = means[0];
    const tt = project(c).technical as ProgressionTechnical;
    const houses = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, longitude: (i * 31 + 7) % 360, sign: "aries", degreeInSign: 0 })) as J;
    const withFrame = { ...tt, natalFrame: { houseSystem: "placidus", nodeType: "mean", bodies: [], houses, angles: { ascendant: houses[0], midheaven: houses[9] } } } as J;
    const hc = progressionHouseColumns(withFrame);
    const nn = tt.bodies.find((b) => b.id === "north_node")!;
    assert.equal(hc.natal?.source, "natal_frame");
    assert.equal(hc.natal?.of("north_node"), natalHouseOf(nn.longitude, houses));
  });

  await t("D) true kontrol (6) + bütün true düğümler: -2 çıktısı sağlayıcı değerleriyle BİREBİR (gerçek düğüm hesabı değişmedi)", () => {
    for (const c of [...controls]) {
      const p = project(c);
      assert.ok(p.ok, `${c.testId} ${JSON.stringify(p.errors)}`);
      assert.ok(!p.technical.nodeComputation && !p.technical.natalHouseStatus);
      for (const b of p.technical.bodies) {
        const r = (c.response.planets as J[]).find((x) => mapId(x.name) === b.id)!;
        assert.equal(b.longitude, r.longitude);
        assert.equal(b.house, r.house);
        assert.equal(b.speed, r.speed);
        assert.equal(b.retrograde, r.isRetrograde);
      }
      assert.equal(p.interpretation.bodies.length, (c.response.planets as J[]).filter((x) => x.interpretation).length);
      const h = html(p.technical);
      assert.ok(!h.includes("astro-progression-mean-node-note") && !h.includes("astro-progression-legacy-mean") && !h.includes("astro-progression-polar"));
    }
  });

  await t("E) kutup (Tromsø 69,65°, 2 gerçek vaka): natal ev taşınmaz, damga var, ekran/rapor 'Natal ev (Placidus)' göstermez, not var", () => {
    assert.equal(polars.length, 2);
    for (const c of polars) {
      assert.ok(Math.abs(c.body.latitude) > 66.5);
      const p = project(c);
      assert.ok(p.ok);
      const tt = p.technical as ProgressionTechnical;
      assert.ok(tt.bodies.every((b) => b.house === null));
      assert.deepEqual(tt.natalHouseStatus, { status: "polar_undefined", latitude: c.body.latitude });
      // Sağlayıcının değeri gerçekten tam burç (bulgu; natal ev başları olmadan saklı değerler ilerletilmiş konumla çelişmez — yalnız kayıt):
      assert.ok((c.response.planets as J[]).every((x) => typeof x.house === "number"));
      const hc = progressionHouseColumns(tt);
      assert.equal(hc.natal, null);
      assert.ok(hc.progressed);
      const h = html(tt);
      assert.ok(!h.includes("Natal ev (Placidus)"), "ekranda Placidus etiketi");
      assert.ok(h.includes('data-testid="astro-progression-polar-note"') && h.includes("69.6°"));
      assert.ok(h.includes("İlerletilmiş harita evi (tam burç)"));
      const rep = reportOf("western.progression", tt);
      assert.ok(!rep.includes("Natal ev (Placidus)") && rep.includes("kutup dairesi ötesinde") && rep.includes("İlerletilmiş harita evi (tam burç)"));
      // Gezegen konumları ve ilerletilmiş açılar DEĞİŞMEDİ.
      for (const b of tt.bodies) assert.equal(b.longitude, (c.response.planets as J[]).find((x) => mapId(x.name) === b.id)!.longitude);
      assert.equal(tt.angles?.ascendant.longitude, c.response.ascendant.longitude);
    }
  });

  await t("F) sınır vakaları (sentetik enlem, aynı gerçek yanıt): 66,5 korunur · 66,5001 / −66,6 / 89,9 kutup · 64,8378 / −60 korunur; eşik = natal engel", () => {
    assert.equal(PROGRESSION_POLAR_LATITUDE, POLAR_HOUSE_LATITUDE);
    assert.equal(PROGRESSION_POLAR_LATITUDE, NATAL_POLAR_HOUSE_LATITUDE);
    const c = controls[0];
    for (const [lat, polar] of [[66.5, false], [-66.5, false], [66.5001, true], [-66.6, true], [89.9, true], [64.8378, false], [-60, false]] as [number, boolean][]) {
      const p = project(c, { latitude: lat });
      assert.ok(p.ok);
      assert.equal(!!p.technical.natalHouseStatus, polar, `enlem ${lat}`);
      assert.equal(p.technical.bodies.every((b: J) => b.house === null), polar, `enlem ${lat} evler`);
    }
  });

  await t("G) eski kayıtlar: -1 mean / -1 kutup — değerler aynen; uyarı + doğru etiket (ekran, not, Word/PDF); -2'de not yok", () => {
    const lm = legacyTechnical(means[0]);
    assert.ok(sec(lm.bodies.find((b) => b.id === "north_node")!.longitude, means[0].response.planets.find((x: J) => x.name === "North Node").longitude) === 0);
    const h = html(lm);
    assert.ok(h.includes('data-testid="astro-progression-legacy-mean"') && !h.includes("astro-progression-mean-node-note"));
    const n1 = legacyMethodNotes({ technique: "western.progression", adapterVersion: "astro-roxy-progression-1", houseSystem: undefined, technical: lm, revisions: [] });
    assert.deepEqual(n1.map((n) => n.code), ["progression_mean_node"]);
    assert.equal(n1[0].text, LEGACY_MEAN_NODE_WARNING);
    assert.deepEqual(legacyMethodNotes({ technique: "western.progression", adapterVersion: "astro-roxy-progression-2", houseSystem: undefined, technical: project(means[0]).technical, revisions: [] }), []);
    assert.deepEqual(legacyMethodNotes({ technique: "western.progression", adapterVersion: "astro-roxy-progression-1", houseSystem: undefined, technical: legacyTechnical(controls[0]), revisions: [] }), []);
    assert.ok(reportOf("western.progression", lm, n1).split(LEGACY_MEAN_NODE_WARNING).length >= 2);
    // Kutup eski kayıt: okuma anında işaret (service.ts) → etiket "Placidus değil", saklı numaralar aynen.
    const lp = { ...legacyTechnical(polars[0]), natalHouseStatus: { status: "legacy_polar_provider", latitude: polars[0].body.latitude } } as ProgressionTechnical;
    const hc = progressionHouseColumns(lp);
    assert.equal(hc.natal?.label, LEGACY_POLAR_NATAL_HOUSE_LABEL);
    assert.equal(hc.natal?.of("sun"), polars[0].response.planets[0].house);
    const hp = html(lp);
    assert.ok(!hp.includes("Natal ev (Placidus)") && hp.includes(LEGACY_POLAR_NATAL_HOUSE_LABEL) && hp.includes('data-testid="astro-progression-legacy-polar"'));
    const np = legacyMethodNotes({ technique: "western.progression", adapterVersion: "astro-roxy-progression-1", houseSystem: undefined, technical: lp, revisions: [] });
    assert.deepEqual(np.map((n) => n.code), ["progression_polar_houses"]);
    const rp = reportOf("western.progression", lp, np);
    assert.ok(!rp.includes("Natal ev (Placidus)") && rp.includes(LEGACY_POLAR_NATAL_HOUSE_LABEL) && rp.includes(LEGACY_POLAR_NATAL_HOUSE_WARNING));
  });

  await t("H) güvenlik: yankı uyuşmazlığı / aralık dışı an → sonuç YOK; gövde + uç nokta aynı; adaptör -2 (önbellek ayrımı)", () => {
    const c = means[0];
    const bad = structuredClone(c);
    bad.response.birthDetails.time = "07:57:00";
    assert.equal(project(bad).ok, false);
    const tooOld = { ...c, body: { ...c.body, date: "1590-01-01" }, response: { ...structuredClone(c.response), birthDetails: { ...c.response.birthDetails, date: "1590-01-01" } } };
    const po = project(tooOld);
    assert.equal(po.ok, false);
    assert.ok(po.errors.some((e: string) => e.includes("ortalama düğüm")));
    assert.equal(ROXY_PROGRESSION.adapter, "astro-roxy-progression-2");
    assert.equal(ROXY_PROGRESSION.endpoint, "/astrology/progressions");
    const birth = { date: "1960-06-30", time: "07:56", latitude: 27.7172, longitude: 85.324, timezone: 5.5, utcOffsetSeconds: 19800 } as J;
    for (const nt of ["mean", "true"] as const) {
      const u = def.units({ birth, birthUtc: "1960-06-30T02:26:00Z", partner: null } as J, { targetDate: "2005-06-12", nodeType: nt });
      assert.equal(u[0].adapterVersion, "astro-roxy-progression-2");
      assert.deepEqual(u[0].body, targetDateBody(birth, "2005-06-12", nt));
    }
  });

  await t("I) uçtan uca (sahte DB, kayıtlı gerçek yanıt): hesapla → kaydet → aç → rapor; eski kayıt simülasyonu: aynen + not + etiket", async () => {
    const store = createStore({});
    const ctx: EngineCtx = { db: createFakeClient(store), tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
    for (const c of [means[0], polars[0]]) {
      const loc = { id: `qa-${c.testId}`, label: `${c.yer} (QA)`, timezone: c.tz, latitude: c.body.latitude, longitude: c.body.longitude };
      const [bd, bt] = c.dogumYerel.split("T");
      const pr = await createAstroProfile(ctx, { label: `TEST ${c.testId}`, birthDate: bd, birthTime: bt, timeKnown: true, timeAccuracy: "exact_record", locationId: loc.id }, (id) => (id === loc.id ? loc : null));
      assert.equal(pr.status, 201);
      const pid = (pr.body as J).profile.id;
      let bodyOk = false;
      const deps: EngineDeps = {
        config: { apiKey: "qa-yerel", baseUrl: "https://qa.local/api/v2" },
        callProvider: async (_c, endpoint, body) => {
          bodyOk = endpoint === c.endpoint && JSON.stringify(body) === JSON.stringify(c.body);
          return bodyOk ? { ok: true, raw: structuredClone(c.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        },
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      };
      const sel = { technique: "western.progression", options: { targetDate: c.body.targetDate, nodeType: c.body.nodeType } };
      const run = (await runAstrology(ctx, { profileId: pid, selections: [sel], confirmNewRequests: 1 }, deps, { ownerPreviewHideInterp: false })).body as J;
      assert.ok(bodyOk, `${c.testId} gövde`);
      const res = run.results[0];
      assert.ok(res.ok, JSON.stringify(res).slice(0, 200));
      const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, options: res.view.options, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
      const id = (sv.body as J).analysisId;
      const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
      assert.equal(a.versions.adapterVersion, "astro-roxy-progression-2");
      assert.deepEqual(a.legacyNotes, []);
      assert.deepEqual(JSON.parse(JSON.stringify(a.technical)), JSON.parse(JSON.stringify(res.view.technical)));
      if (c.grup === "mean") assert.equal(a.technical.nodeComputation.source, "local_mean");
      else assert.equal(a.technical.natalHouseStatus.status, "polar_undefined");
      const rep = reportTexts(buildAstroReport(a)).join("\n");
      assert.ok(!rep.includes("Natal ev (Placidus)") || c.grup === "mean");
      // Eski kayıt simülasyonu: snapshot -1 dönemindeki gibi (sağlayıcı değerleri) → okuma anında not + etiket; DB satırı DEĞİŞMEZ.
      const row = (store.tables.astro_analyses ?? []).find((r) => r.id === id)!;
      const old = legacyTechnical(c);
      row.technical_snapshot = JSON.parse(JSON.stringify(old));
      row.versions_snapshot = { ...(row.versions_snapshot as J), adapterVersion: "astro-roxy-progression-1" };
      const before = JSON.stringify(row.technical_snapshot);
      const a2 = ((await getAnalysis(ctx, id, false)).body as J).analysis;
      assert.equal(JSON.stringify(row.technical_snapshot), before, "kayıt değişmemeli");
      if (c.grup === "mean") {
        assert.deepEqual(a2.legacyNotes.map((n: J) => n.code), ["progression_mean_node"]);
        assert.equal(a2.technical.bodies.find((b: J) => b.id === "north_node").longitude, c.response.planets.find((x: J) => x.name === "North Node").longitude);
      } else {
        assert.deepEqual(a2.legacyNotes.map((n: J) => n.code), ["progression_polar_houses"]);
        assert.equal(a2.technical.natalHouseStatus.status, "legacy_polar_provider");
        const r2 = reportTexts(buildAstroReport(a2)).join("\n");
        assert.ok(!r2.includes("Natal ev (Placidus)") && r2.includes(LEGACY_POLAR_NATAL_HOUSE_LABEL));
      }
    }
  });

  console.log(`\nastrology F1/F2 (progresyon ortalama düğüm + kutup evleri) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})();
