/**
 * ASTROLOJİ AŞAMA 5 harness'i — Vedik / Jyotish (hesap motoru Roxy).
 *
 * 5B D1: golden eşleme · bilinmeyen alan fail-closed · iç tutarlılık korumaları · ayanamsa ayrımı ·
 *        teknik/yorum A/B · önbellek · saat bilinmiyor · Vedik/Batı KB ayrımı · notlar · kayıtlı analiz ·
 *        tenant · bağımsız astronomi (sidereal = tropikal − ayanamsa).
 * Sonraki alt aşamalar bu dosyaya eklenir. Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase5.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlan5 } from "./golden/phase5-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { getAstrologyResult, planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, locationContextKey, saveAnalysis, saveExpertNote, vedicContextKey } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique, traditionOfKey } from "@/lib/astrology/topics/index";
import { NITYA_YOGA_LABELS, VEDIC_SPECS, VEDIC_YOGA_NAMES, parseVedicTopicKey, vedicArgOptions, vedicDefaultParts, vedicTopicKey } from "@/lib/astrology/topics/vedic";
import {
  dashaEndpoint,
  karanaOfHalfTithi,
  navamsaRashiOfPada,
  projectRoxyVedicAshtakavarga,
  projectRoxyVedicD1,
  projectRoxyVedicDasha,
  projectRoxyVedicDrishti,
  projectRoxyVedicPanchanga,
  projectRoxyVedicShadbala,
  projectRoxyVedicVarga,
} from "@/lib/astrology/providers/roxy/vedic";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { currentDashaIndex, dashaTopicKey, dashaUtcMs, nakshatraSummary, toKundliData, toVargaChartData, vargaTopicKeys } from "@/app/admin/astroloji/_components/VedicPanels";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { formatDegree } from "@/lib/astrology/labels/tr";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import {
  SHADBALA_COMPONENTS,
  VEDIC_GRAHAS,
  VIMSHOTTARI_YEARS,
  type VedicAshtakavargaTechnical,
  type VedicD1Technical,
  type VedicDashaTechnical,
  type VedicDrishtiTechnical,
  type VedicGrahaId,
  type VedicPanchangaTechnical,
  type VedicShadbalaTechnical,
  type VedicVargaTechnical,
} from "@/lib/astrology/model/vedic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const has = (n: string) => existsSync(join(DIR, `${n}.json`));
const D1 = load("vedic-d1");
const D9 = load("vedic-d9");
const DM = load("vedic-dasha-major");
const DS = load("vedic-dasha-sub-md");
const DSA = load("vedic-dasha-sub-md-ad");
const FA = load("vedic-aspects");
const FK = load("vedic-ashtakavarga");
const FS = load("vedic-shadbala");
const FP = load("vedic-panchang");
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));

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

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const CLIENT_Y = "55555555-5555-4555-8555-555555555555";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };

const seed = (): FakeStore =>
  createStore({
    clients: [
      { id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" },
      { id: CLIENT_Y, tenant_id: TENANT_A, ad: "Sentetik", soyad: "Y" },
    ],
  });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown> };
/** Sahte Roxy: Vedik endpoint → golden (GERÇEK yanıt). Farklı ayanamsa için SENTETİK yankı (frame) — yalnız önbellek testleri. */
function roxy(opts: { mutate?: (endpoint: string, r: J, body: Record<string, unknown>) => void } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-5", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      let r: J;
      if (endpoint === "/vedic-astrology/birth-chart") r = structuredClone(D1.response);
      else if (endpoint === "/vedic-astrology/divisional-chart") {
        r = structuredClone(D9.response);
        // SENTETİK yankı (yalnız önbellek/ayrım testleri): D9 dışı bölümde division.number istenen değere çekilir.
        if (body.division !== 9) r.division = { ...r.division, number: body.division, name: `Synthetic D${String(body.division)}` };
        if (body.ayanamsa && body.ayanamsa !== "lahiri") r.chart.frame = { ...r.chart.frame, ayanamsa: body.ayanamsa };
      } else if (endpoint === DM.endpoint) r = structuredClone(DM.response);
      else if (endpoint === DS.endpoint) r = structuredClone(DS.response);
      else if (endpoint === DSA.endpoint) r = structuredClone(DSA.response);
      else if (endpoint === FA.endpoint) r = structuredClone(FA.response);
      else if (endpoint === FK.endpoint) r = structuredClone(FK.response);
      else if (endpoint === FS.endpoint) r = structuredClone(FS.response);
      else if (endpoint === FP.endpoint) r = structuredClone(FP.response);
      else return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      if (r.frame && body.ayanamsa && body.ayanamsa !== "lahiri") r.frame = { ...r.frame, ayanamsa: body.ayanamsa };
      opts.mutate?.(endpoint, r, body);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: (m, d) => logs.push(`${m} ${JSON.stringify(d ?? {})}`),
  };
  return { calls, deps, logs };
}

async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, preview = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: preview });
const D1SEL = (ayanamsa?: string) => ({ technique: "vedic.d1", options: ayanamsa ? { ayanamsa } : {} });
const VSEL = (division?: number | string, ayanamsa?: string) => ({ technique: "vedic.varga", options: { ...(division !== undefined ? { division } : {}), ...(ayanamsa ? { ayanamsa } : {}) } });
const DSEL = (mahadasha?: string, antardasha?: string, ayanamsa?: string) => ({ technique: "vedic.dasha", options: { ...(mahadasha ? { mahadasha } : {}), ...(antardasha ? { antardasha } : {}), ...(ayanamsa ? { ayanamsa } : {}) } });
const dashaTech = (fx: J, md: VedicGrahaId | null, ad: VedicGrahaId | null) => {
  const r = projectRoxyVedicDasha(fx.response, { ayanamsa: "lahiri", mahadasha: md, antardasha: ad, birthLocal: "1990-07-15T14:30:00", utcOffsetHours: 3 }) as J;
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.unmappedFields, []);
  assert.deepEqual(r.droppedValues, []);
  return r.technical as VedicDashaTechnical;
};
const projOk = (r: J) => {
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.unmappedFields, []);
  assert.deepEqual(r.droppedValues, []);
  return r.technical;
};
const d9Tech = () => (projectRoxyVedicVarga(D9.response, { ayanamsa: "lahiri", division: 9 }) as J).technical as VedicVargaTechnical;

/**
 * Sağlayıcı anlatıları (>40 karakter string). İSTİSNA: yogas[].evidence — hesaplanan oluşum koşulu
 * (ör. "Jupiter in kendra from Moon…"); kullanıcı kararı gereği TEKNİK veridir ("Yoga adı ve hesaplanan
 * oluşum bilgisi: teknik veri"). description/result ise yorumdur ve bu kümede kalır.
 */
function narratives(raw: J): string[] {
  const out: string[] = [];
  const walk = (v: J, key = "") => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, k));
    else if (typeof v === "string" && v.length > 40 && key !== "evidence") out.push(v);
  };
  walk(raw);
  return [...new Set(out)];
}
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const d1Tech = () => (projectRoxyVedicD1(D1.response, { ayanamsa: "lahiri" }) as J).technical as VedicD1Technical;

async function main() {
  // ═══ 5B — D1 ═════════════════════════════════════════════════════════════════
  await t("5B golden: fixture = ürün gövdesi (lahiri, timezone=DOĞUM ofseti açık); anahtar/ad izi yok", () => {
    const g = goldenPlan5().find((x) => x.name === "vedic-d1")!;
    assert.deepEqual(D1.body, JSON.parse(JSON.stringify(g.body)));
    assert.equal(D1.body.timezone, 3, "Roxy Vedik varsayılanı 5.5 — açık gönderilmeli");
    assert.equal(D1.body.ayanamsa, "lahiri");
    assert.ok(!/api[_-]?key|x-api-key|Bearer |Sentetik/i.test(JSON.stringify(D1)));
    const u = getTechnique("vedic.d1")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { ayanamsa: "lahiri" })[0];
    assert.deepEqual(JSON.parse(JSON.stringify(u.body)), D1.body);
  });

  await t("5B golden: projeksiyon — bilinmeyen 0, düşürülen 0; 9 graha + Lagna; tüm tutarlılık denetimleri geçer; teknikte anlatı yok", () => {
    const p = projectRoxyVedicD1(D1.response, { ayanamsa: "lahiri" }) as J;
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
    assert.equal(p.technical.grahas.length, 9);
    assert.equal(p.technical.yogas.length, D1.response.yogas.length);
    assert.equal(p.technical.frame.ayanamsaDegrees, D1.response.frame.ayanamsaDegrees);
    for (const g of p.technical.grahas) {
      const m = D1.response.meta[g.id[0].toUpperCase() + g.id.slice(1)];
      assert.equal(g.longitude, m.longitude);
      assert.equal(g.house, m.house);
      assert.equal(g.nakshatra.pada, m.nakshatra.pada);
    }
    // Yoga oluşum kanıtı teknik (bilinçli); tanım/sonuç yorum katmanında.
    assert.ok(p.technical.yogas.some((y: J) => y.evidence && y.evidence.length > 20));
    assert.ok(!JSON.stringify(p.technical).includes(D1.response.yogas[0].result));
    const narr = narratives(D1.response);
    assert.ok(!narr.some((x) => JSON.stringify(p.technical).includes(x)), "teknikte anlatı");
    assert.ok(narr.some((x) => JSON.stringify(p.interpretation).includes(x)), "yorum katmanı boş");
  });

  await t("5B fail-closed: bilinmeyen alan yalnız YOLUYLA raporlanır; tutarsız sağlayıcı verisi (rashi/pada/lord/ev/kutu/ayanamsa) REDDEDİLİR", () => {
    const SECRET = "GIZLI-YENI-VEDIK-ALAN-teknik-olmamali";
    const r1 = structuredClone(D1.response);
    r1.meta.Sun.karmaHint = SECRET;
    const p1 = projectRoxyVedicD1(r1, { ayanamsa: "lahiri" }) as J;
    assert.deepEqual(p1.unmappedFields, ["meta.Sun.karmaHint"]);
    assert.ok(!JSON.stringify(p1).includes(SECRET));
    const bad = (f: (r: J) => void) => {
      const r = structuredClone(D1.response);
      f(r);
      return projectRoxyVedicD1(r, { ayanamsa: "lahiri" }).ok;
    };
    assert.equal(bad((r) => (r.meta.Sun.rashi = "Leo")), false, "rashi ↔ boylam");
    assert.equal(bad((r) => (r.meta.Moon.nakshatra.pada = 1)), false, "pada ↔ boylam");
    assert.equal(bad((r) => (r.meta.Mars.nakshatra.lord = "Venus")), false, "lord ↔ sıra");
    assert.equal(bad((r) => (r.meta.Saturn.house = 4)), false, "ev ↔ bütün-burç");
    assert.equal(bad((r) => (r.leo.signs = [{ graha: "Sun" }])), false, "kutu ↔ meta");
    assert.equal(projectRoxyVedicD1(D1.response, { ayanamsa: "raman" }).ok, false, "frame ayanamsa ≠ istenen");
  });

  await t("5B astronomi: sidereal = tropikal (astronomy-engine) − frame.ayanamsaDegrees — 7 graha ≤ 0.01°; Lagna ≤ 0.01°; Rahu = ORTALAMA düğüm", () => {
    const tech = d1Tech();
    const tm = Astronomy.MakeTime(new Date(SYNTH_A.utc));
    const ay = tech.frame.ayanamsaDegrees;
    const bodies: [string, Astronomy.Body][] = [["sun", Astronomy.Body.Sun], ["moon", Astronomy.Body.Moon], ["mars", Astronomy.Body.Mars], ["mercury", Astronomy.Body.Mercury], ["jupiter", Astronomy.Body.Jupiter], ["venus", Astronomy.Body.Venus], ["saturn", Astronomy.Body.Saturn]];
    let max = 0;
    for (const [id, b] of bodies) {
      const trop = Astronomy.Ecliptic(Astronomy.GeoVector(b, tm, true)).elon;
      const sid = tech.grahas.find((g) => g.id === id)!.longitude;
      max = Math.max(max, angDiff(sid, trop - ay));
    }
    assert.ok(max <= 0.01, `graha farkı ${max}`);
    const r = Math.PI / 180;
    const lst = (Astronomy.SiderealTime(tm) * 15 + SYNTH_A.longitude + 360) % 360;
    const eps = 23.4393 - 0.0000004 * tm.tt;
    const asc = (Math.atan2(Math.cos(lst * r), -(Math.sin(lst * r) * Math.cos(eps * r) + Math.tan(SYNTH_A.latitude * r) * Math.sin(eps * r))) / r + 360) % 360;
    const dLag = angDiff(tech.lagna.longitude, asc - ay);
    assert.ok(dLag <= 0.01, `Lagna farkı ${dLag}`);
    const T = tm.tt / 36525;
    const meanNode = (((125.0445479 - 1934.1362891 * T + 0.0020754 * T * T) % 360) + 360) % 360;
    const trueNode = NATAL_GOLDEN.planets.find((p: J) => p.name === "North Node").longitude;
    const rahu = tech.grahas.find((g) => g.id === "rahu")!;
    const ketu = tech.grahas.find((g) => g.id === "ketu")!;
    assert.ok(angDiff(rahu.longitude + ay, meanNode) < 0.02 && angDiff(rahu.longitude + ay, trueNode) > 0.5, `Rahu ortalama ${angDiff(rahu.longitude + ay, meanNode)} / gerçek ${angDiff(rahu.longitude + ay, trueNode)}`);
    assert.ok(angDiff(ketu.longitude, rahu.longitude + 180) < 1e-6);
    // Lahiri değeri makul aralıkta (1990: ~23.7°).
    assert.ok(ay > 23.6 && ay < 23.8, `ayanamsa ${ay}`);
    console.log(`     graha max ${(max * 3600).toFixed(1)}″ · Lagna ${(dLag * 3600).toFixed(1)}″ · ayanamsa ${ay.toFixed(4)}° · Rahu=ortalama düğüm`);
  });

  await t("5B ayanamsa: lahiri/raman/kp-newcomb/kp-old ayrı anahtar; varsayılan lahiri; custom/bilinmeyen reddedilir", () => {
    const def = getTechnique("vedic.d1")!;
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null };
    const hashes = ["lahiri", "raman", "kp-newcomb", "kp-old"].map((a) => def.units(ctx, def.parseOptions({ ayanamsa: a }, new Date())!)[0].inputHash);
    assert.equal(new Set(hashes).size, 4);
    assert.deepEqual(def.parseOptions({}, new Date()), { ayanamsa: "lahiri" });
    assert.equal(def.parseOptions({ ayanamsa: "custom" }, new Date()), null);
    assert.equal(def.parseOptions({ ayanamsa: "fagan" }, new Date()), null);
  });

  await t("5B motor: çalıştır → yorum A/B (açık/yetkisiz/önizleme), ham alan/anahtar yok; tekrar 0 istek; farklı ayanamsa yeni istek; saat yok → TIME_REQUIRED", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const vis = (await run(ctx, pa, [D1SEL()], rx.deps)).body as J;
    assert.equal(rx.calls.length, 1);
    const hid = (await run(ctxOf(store, { entitlements: NO_INTERP }), pa, [D1SEL()], rx.deps)).body as J;
    const pre = (await run(ctx, pa, [D1SEL()], rx.deps, true)).body as J;
    assert.equal(rx.calls.length, 1, "önbellek");
    const narr = narratives(D1.response);
    assert.ok(narr.some((x) => JSON.stringify(vis).includes(x)), "yetkili yorumu görmeli");
    for (const b of [hid, pre]) assert.ok(!narr.some((x) => JSON.stringify(b).includes(x)), "anlatı sızdı");
    for (const b of [vis, hid, pre]) for (const m of ["interpretations", "\"meta\"", "raw_response", "input_hash", "k-test-5", "jagradadi\":\"Swapna", "\"signs\""]) assert.ok(!JSON.stringify(b).includes(m), m);
    assert.equal(vis.results[0].view.technical.frame.ayanamsa, "lahiri");
    await run(ctx, pa, [D1SEL("raman")], rx.deps);
    assert.equal(rx.calls.length, 2, "farklı ayanamsa yeni istek");
    assert.equal(rx.calls[1].body.ayanamsa, "raman");
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const u = (await run(ctx, pu, [D1SEL()], rx.deps)).body as J;
    assert.equal(u.results[0].code, "TIME_REQUIRED");
    assert.equal(rx.calls.length, 2);
    assert.equal(maskTechnical("vedic.d1", d1Tech(), { primary: false, partner: null }).technical, null);
  });

  await t("5B KB + notlar: Vedik konular 'vedic' geleneğinde; Batı natal notu/KB Vedik alana karışmaz (ve tersi); danışan notları ayrı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const py = await profile(ctx, { clientId: CLIENT_Y, label: "Sentetik Y" });
    const rx = roxy();
    await run(ctx, pa, [D1SEL(), { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }], { ...rx.deps, callProvider: async (c, e, b, o) => (e === "/astrology/natal-chart" ? { ok: true, raw: structuredClone(NATAL_GOLDEN), attempts: 1 } : rx.deps.callProvider(c, e, b, o)) });
    await run(ctx, py, [D1SEL()], rx.deps);
    const topics = topicsForTechnique("vedic.d1", d1Tech());
    assert.ok(topics.some((x) => x.key === "graha_in_rashi:sun:gemini"));
    assert.ok(topics.some((x) => x.key === "graha_nakshatra_pada:moon:revati:4"));
    assert.ok(topics.some((x) => x.key === "lagna_nakshatra:swati"));
    assert.ok(topics.some((x) => x.key.startsWith("yoga:")));
    for (const x of topics) {
      assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/.test(x.key), x.key);
      assert.ok(parseAnyTopicKey("vedic", x.key), x.key);
      assert.equal(parseAnyTopicKey("western", x.key), null, `${x.key} Batı anahtarı gibi ayrıştı`);
      assert.ok(isSectionKeyForTechnique("vedic.d1", x.key));
      assert.ok(!isSectionKeyForTechnique("western.natal", x.key));
    }
    assert.ok(!isSectionKeyForTechnique("vedic.d1", "planet_in_house:saturn:6"), "Batı konusu Vedik nota yazılabiliyor");
    await createKb(ctx, { tradition: "vedic", topicKey: "graha_in_rashi:sun:gemini", title: "Vedik Güneş", body: "vedik KB" });
    await createKb(ctx, { tradition: "western", topicKey: "planet_in_sign:sun:cancer", title: "Batı Güneş", body: "batı KB" });
    assert.equal((await createKb(ctx, { tradition: "western", topicKey: "graha_in_rashi:sun:gemini", title: "x", body: "x" })).status, 400, "Vedik anahtar Batı geleneğinde kabul edildi");
    const ws = async (pid: string, sel: J) => (await getWorkspace(ctx, { profileId: pid, revision: 1, ...sel })).body as J;
    const v = await ws(pa, D1SEL());
    assert.deepEqual(v.kbMatches.map((e: J) => e.tradition + ":" + e.topicKey), ["vedic:graha_in_rashi:sun:gemini"]);
    const w = await ws(pa, { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } });
    assert.ok(w.kbMatches.every((e: J) => e.tradition === "western"), "Vedik KB Batı natal alanına karıştı");
    const note = (pid: string, o: J, status = 201) =>
      saveExpertNote(ctx, { profileId: pid, technique: "vedic.d1", sectionKey: "overall", expectedRevision: null, noteContext: "ayanamsa:lahiri", ...o }).then((r) => assert.equal(r.status, status, JSON.stringify(r.body)));
    await note(pa, { body: "A Vedik notu" });
    await note(py, { body: "Y Vedik notu" });
    await note(pa, { sectionKey: "graha_in_rashi:sun:gemini", body: "A Güneş" });
    await note(pa, { sectionKey: "planet_in_sign:sun:cancer", body: "x" }, 400);
    assert.deepEqual((await ws(pa, D1SEL())).notes.map((n: J) => n.body).sort(), ["A Güneş", "A Vedik notu"]);
    assert.deepEqual((await ws(py, D1SEL())).notes.map((n: J) => n.body), ["Y Vedik notu"]);
    assert.equal((await ws(pa, { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } })).notes.length, 0, "Vedik not Batı natal alanında");
  });

  await t("5C not bağlamı: ayanamsa'ya göre ayrı (Lahiri ≠ Raman); bağlam SUNUCUDA türetilir; sahte/eksik/uyumsuz bağlam reddedilir; kayıtlı analiz kendi bağlamının notunu taşır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy({ mutate: (_e, r, body) => { r.frame.ayanamsa = body.ayanamsa; } });
    await run(ctx, pa, [D1SEL(), D1SEL("raman")], rx.deps);
    const ws = async (sel: J) => (await getWorkspace(ctx, { profileId: pa, revision: 1, ...sel })).body as J;
    const L = await ws(D1SEL());
    const Rm = await ws(D1SEL("raman"));
    assert.equal(L.noteContext, "ayanamsa:lahiri");
    assert.equal(Rm.noteContext, "ayanamsa:raman");
    assert.match(L.contextKey, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(L.contextKey, Rm.contextKey);
    assert.equal(L.contextKey, vedicContextKey("vedic.d1", "ayanamsa:lahiri"));
    assert.notEqual(vedicContextKey("vedic.d1", "ayanamsa:lahiri"), locationContextKey("vedic.d1", "ayanamsa:lahiri"), "konum ad alanıyla çakışma");
    const note = (o: J) => saveExpertNote(ctx, { profileId: pa, technique: "vedic.d1", sectionKey: "overall", expectedRevision: null, ...o });
    assert.equal((await note({ noteContext: "ayanamsa:lahiri", body: "Lahiri notu" })).status, 201);
    assert.equal((await note({ noteContext: "ayanamsa:raman", body: "Raman notu" })).status, 201);
    assert.deepEqual((await ws(D1SEL())).notes.map((n: J) => n.body), ["Lahiri notu"]);
    assert.deepEqual((await ws(D1SEL("raman"))).notes.map((n: J) => n.body), ["Raman notu"]);
    for (const bad of [undefined, "", "ayanamsa:custom", "ayanamsa:LAHIRI", "ayanamsa:lahiri|x:1", "ayanamsa:lahiri|ayanamsa:raman", "lahiri", "ayanamsa:", "x".repeat(300)]) {
      const r = await note({ noteContext: bad, sectionKey: "lagna_rashi:libra", body: "x" });
      assert.equal(r.status, 400, `kabul edildi: ${String(bad)}`);
    }
    // İstemci uuid'i uyumsuzsa reddedilir (Raman bağlamı + Lahiri uuid'i).
    assert.equal((await note({ noteContext: "ayanamsa:raman", contextKey: L.contextKey, sectionKey: "lagna_rashi:libra", body: "x" })).status, 400);
    assert.equal((await note({ noteContext: "ayanamsa:raman", contextKey: Rm.contextKey, sectionKey: "lagna_rashi:libra", body: "ok" })).status, 201);
    // Kayıtlı analiz kendi ayanamsa bağlamının notlarını snapshot'lar.
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...D1SEL("raman"), title: "Raman D1", saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const got = (await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J;
    const bodies = JSON.stringify(got.analysis);
    assert.ok(bodies.includes("Raman notu") && !bodies.includes("Lahiri notu"), "kayıtlı analiz yanlış ayanamsa notunu taşıyor");
    assert.equal(rx.calls.length, 2);
  });

  await t("5B kayıtlı analiz: snapshot ayanamsa/frame + teknik + sürüm + Vedik etiket; açmak 0 istek; yetkisizde anlatı yok; tenant izolasyonu", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL("raman")], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...D1SEL("raman"), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const before = store.log.length;
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(a.technique, "vedic.d1");
    assert.ok(a.techniqueLabel.startsWith("Vedik"));
    assert.equal(a.params.ayanamsa, "raman");
    assert.equal(a.technical.frame.ayanamsa, "raman");
    assert.equal(a.versions.adapterVersion, "astro-roxy-vedic-d1-1");
    assert.ok(a.topics.length > 30);
    assert.equal(rx.calls.length, n);
    assert.ok(!store.log.slice(before).some((l) => l.table === "astro_provider_results" || l.table === "astro_provider_interpretations"));
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis;
    assert.ok(!narratives(D1.response).some((x) => JSON.stringify(hidden).includes(x)));
    const ctxB = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    assert.equal((await getAnalysis(ctxB, (sv.body as J).analysisId, false)).status, 404);
    const res = store.tables.astro_provider_results.find((x) => x.technique === "vedic.d1")!;
    assert.equal((await getAstrologyResult(ctxB, String(res.id), { profileId: null, revision: null, ownerPreviewHideInterp: false })).status, 404);
    assert.equal((await planAstrology(ctxB, { profileId: pa, selections: [D1SEL()] })).status, 404);
  });

  await t("5B harita verisi: <roxy-vedic-kundli>'ye giden nesne YALNIZ teknik alanlar; Roxy meta değerleriyle alan alan AYNI; anlatı/ham alan yok", () => {
    const k = toKundliData(d1Tech()) as J;
    assert.deepEqual(Object.keys(k).sort(), ["combustion", "frame", "meta", "planetaryWar"]);
    assert.deepEqual(Object.keys(k.meta).sort(), Object.keys(D1.response.meta).sort());
    for (const [name, m] of Object.entries(D1.response.meta) as [string, J][]) {
      const x = k.meta[name];
      assert.equal(x.rashi, m.rashi, `${name} rashi`);
      assert.equal(x.longitude, m.longitude, `${name} boylam`);
      assert.equal(x.nakshatra.pada, m.nakshatra.pada);
      assert.equal(x.nakshatra.lord, m.nakshatra.lord);
      assert.equal(x.nakshatra.name.toLowerCase().replace(/\s+/g, "_"), m.nakshatra.name.toLowerCase().replace(/\s+/g, "_"));
      assert.equal(x.isRetrograde, m.isRetrograde);
      assert.equal(x.house, m.house);
      if (m.awastha && name !== "Lagna") assert.equal(x.awastha, m.awastha);
      if (m.deeptadi) assert.equal(x.deeptadi, m.deeptadi);
    }
    assert.deepEqual(k.combustion, D1.response.combustion.map((c: J) => ({ planet: c.planet })));
    assert.deepEqual(k.frame, D1.response.frame);
    const s = JSON.stringify(k);
    for (const x of narratives(D1.response)) assert.ok(!s.includes(x), "harita verisinde anlatı");
    for (const m of ["interpretations", "description", "result", "themes", "yogas"]) assert.ok(!s.includes(m), m);
  });

  // Planlı fixture'ların varlığı (alt aşamalar ilerledikçe).
  await t("5B konu seçici: her Vedik tür × her argüman seçeneği geçerli 'vedic' anahtarı üretir, Batı'da GEÇERSİZ; 48 yoga kimliği listede; KB editörü geleneği anahtardan türetir", () => {
    let n = 0;
    for (const kind of Object.keys(VEDIC_SPECS)) {
      const base = vedicDefaultParts(kind);
      assert.ok(parseVedicTopicKey(vedicTopicKey(kind, base)), `${kind} varsayılan`);
      VEDIC_SPECS[kind].args.forEach((a, i) => {
        for (const [v] of vedicArgOptions(a)) {
          const parts = [...base];
          parts[i] = v;
          const key = vedicTopicKey(kind, parts);
          assert.ok(parseAnyTopicKey("vedic", key), key);
          assert.equal(parseAnyTopicKey("western", key), null, `Batı'da geçersiz olmalı: ${key}`);
          assert.equal(traditionOfKey(key), "vedic");
          // DB CHECK (astro_kb_topic_chk / astro_en_section_chk) ile birebir: tür adında rakam olamaz.
          assert.match(key, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/, `DB kısıtını geçmez: ${key}`);
          n++;
        }
      });
    }
    assert.ok(n > 300, `kapsanan anahtar ${n}`);
    const ids = (D1.response.yogas as J[]).map((y) => y.id).sort();
    assert.deepEqual(ids, Object.keys(VEDIC_YOGA_NAMES).sort());
    assert.equal(parseVedicTopicKey("yoga:chandra")!.label, "Yoga: Chakra Yoga");
    assert.equal(traditionOfKey("planet_in_sign:sun:aries"), "western");
    assert.equal(parseAnyTopicKey("vedic", "planet_in_sign:sun:aries"), null);
    const kb = readFileSync(join(process.cwd(), "app/admin/astroloji/_components/KnowledgeBankPanel.tsx"), "utf8");
    assert.ok(kb.includes("tradition: traditionOfKey(topicKey)"), "KbEditor gelenek türetimi");
    assert.ok(!/tradition:\s*"western",/.test(kb), "sabit western gelenek kalmamalı");
  });

  await t("5C nakshatra/pada: özet SAF ve Roxy verisiyle aynı; 10 nokta; Janma = Chandra; yönetici yeri aynı haritadan; Vimshottari grupları bölüntü; bağımsız boylam → nakshatra/pada/oran", () => {
    const tech = d1Tech();
    const s = nakshatraSummary(tech);
    assert.equal(s.rows.length, 10);
    assert.equal(s.janma.point, "moon");
    assert.equal(s.janma.nakshatra.id, "revati");
    assert.equal(s.janma.nakshatra.pada, 4);
    assert.deepEqual(s.byLord.map((g) => g.lord), ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"]);
    assert.deepEqual(s.byLord.flatMap((g) => g.points).sort(), s.rows.map((r) => r.point).sort(), "gruplar bölüntü değil");
    const span = 360 / 27;
    const pts = [{ id: "lagna", ...tech.lagna }, ...tech.grahas];
    for (const r of s.rows) {
      const p = pts.find((x) => x.id === r.point)!;
      assert.equal(r.nakshatra, p.nakshatra, "özet yeni nesne üretmemeli (Roxy değeri aynen)");
      if (r.point !== "lagna") {
        const lord = tech.grahas.find((g) => g.id === r.nakshatra.lord)!;
        assert.equal(r.lordRashi, lord.rashi);
        assert.equal(r.lordHouse, lord.house);
      }
      // Bağımsız denetim: sidereal boylam → nakshatra sırası, pada, oran, kalan.
      const lon = SIGN_IDS.indexOf(p.rashi) * 30 + p.degreeInRashi;
      const idx = Math.floor(lon / span);
      const within = lon - idx * span;
      assert.equal(r.nakshatra.index, idx, `${r.point} nakshatra`);
      assert.equal(r.nakshatra.pada, Math.floor(within / (span / 4)) + 1, `${r.point} pada`);
      assert.ok(Math.abs(r.nakshatra.ratio - within / span) < 0.01, `${r.point} oran`);
      assert.ok(Math.abs(r.nakshatra.remaining - (span - within)) < 0.02, `${r.point} kalan`);
      const topics = topicsForTechnique("vedic.d1", tech).map((x) => x.key);
      if (r.point === "lagna") assert.ok(topics.includes(`lagna_nakshatra:${r.nakshatra.id}`));
      else assert.ok(topics.includes(`graha_nakshatra_pada:${r.point}:${r.nakshatra.id}:${r.nakshatra.pada}`));
    }
  });

  await t("5D golden D9: gövde (division 9, lahiri, doğum timezone); projeksiyon bilinmeyen 0 / düşürülen 0; Lagna Oğlak; vargottama Güneş/Ay/Jüpiter/Satürn; significance yalnız yorum katmanında", () => {
    assert.equal(D9.endpoint, "/vedic-astrology/divisional-chart");
    assert.equal(D9.body.division, 9);
    assert.equal(D9.body.ayanamsa, "lahiri");
    assert.equal(D9.body.timezone, 3);
    assert.ok(!JSON.stringify(D9).match(/apiKey|x-api-key|Ayşe|Ali Örnek/i));
    const r = projectRoxyVedicVarga(D9.response, { ayanamsa: "lahiri", division: 9 }) as J;
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, []);
    const tech = r.technical as VedicVargaTechnical;
    assert.equal(tech.lagna.rashi, "capricorn");
    assert.equal(tech.lagna.d1Rashi, "libra");
    assert.deepEqual([...tech.vargottama].sort(), ["jupiter", "moon", "saturn", "sun"]);
    assert.equal(tech.grahas.length, 9);
    const sig = D9.response.division.significance as string;
    assert.ok(sig && !JSON.stringify(tech).includes(sig), "significance teknik katmanda");
    assert.equal(r.interpretation.significance, sig);
    assert.ok(!JSON.stringify(toVargaChartData(tech)).includes(sig), "significance harita verisinde");
  });

  await t("5D bağımsız denetim: D9 rashisi = ⌊boylam×9/30⌋ mod 12 (pada formülünden BAĞIMSIZ); D1 rashisi = D1 golden; ev = varga Lagna'sından bütün-burç; boylamlar D1 ile aynı", () => {
    const tech = d9Tech();
    const d1 = d1Tech();
    for (const p of [{ id: "lagna", ...tech.lagna }, ...tech.grahas]) {
      const nav = SIGN_IDS[Math.floor((p.longitude * 9) / 30) % 12];
      assert.equal(p.rashi, nav, `${p.id} navamsa`);
      assert.equal(navamsaRashiOfPada(p.nakshatra.index, p.nakshatra.pada), nav, `${p.id} pada↔navamsa`);
      const d1p = p.id === "lagna" ? d1.lagna : d1.grahas.find((g) => g.id === p.id)!;
      assert.equal(p.d1Rashi, d1p.rashi, `${p.id} D1 rashi`);
      assert.ok(Math.abs(p.longitude - d1p.longitude) < 1e-9, `${p.id} boylam D1 ile aynı değil`);
      assert.equal(p.house, ((SIGN_IDS.indexOf(p.rashi) - SIGN_IDS.indexOf(tech.lagna.rashi) + 12) % 12) + 1);
    }
  });

  await t("5D fail-closed: bölüm/ayanamsa yankısı, navamsa↔pada, vargottama listesi, ev, kutu, chart.frame çelişkisi REDDEDİLİR; bilinmeyen alan yalnız yolu", () => {
    const bad = (fn: (r: J) => void, division: 9 | 10 = 9, ay: "lahiri" | "raman" = "lahiri") => {
      const r = structuredClone(D9.response);
      fn(r);
      return projectRoxyVedicVarga(r, { ayanamsa: ay, division }) as J;
    };
    assert.equal(bad(() => {}, 10).ok, false, "yanlış bölüm kabul edildi");
    assert.equal(bad(() => {}, 9, "raman").ok, false, "yanlış ayanamsa kabul edildi");
    assert.equal(bad((r) => { r.chart.frame.ayanamsa = "raman"; }).ok, false, "chart.frame çelişkisi");
    // Navamsa rashisini (ve kutusunu/evini) tutarlı biçimde değiştir → yalnız pada/navamsa denetimi yakalar.
    const nav = bad((r) => {
      r.chart.meta.Mars.rashi = "Cancer";
      r.chart.meta.Mars.house = 7;
      r.chart.gemini.signs = r.chart.gemini.signs.filter((x: J) => x.graha !== "Mars");
      r.chart.cancer.signs.push({ ...r.chart.meta.Mars });
    });
    assert.equal(nav.ok, false);
    assert.ok(nav.errors.some((e: string) => e.includes("navamsa")), JSON.stringify(nav.errors));
    assert.equal(bad((r) => { r.vargottama = ["Sun", "Moon", "Jupiter"]; }).ok, false, "eksik vargottama");
    assert.equal(bad((r) => { r.vargottama = [...r.vargottama, "Mars"]; }).ok, false, "fazla vargottama");
    assert.equal(bad((r) => { r.chart.meta.Sun.house = 7; }).ok, false, "ev");
    assert.equal(bad((r) => { r.chart.meta.Lagna.house = 2; }).ok, false, "Lagna evi");
    assert.equal(bad((r) => { r.chart.pisces.signs.push({ graha: "Sun" }); }).ok, false, "kutu");
    assert.equal(bad((r) => { r.chart.meta.Moon.nakshatra.pada = 3; }).ok, false, "pada");
    const u = bad((r) => { r.chart.meta.Sun.secretNote = "SIZINTI-METNI"; r.extraNarrative = "SIZINTI-2"; });
    assert.ok(u.ok);
    assert.deepEqual([...u.unmappedFields].sort(), ["chart.meta.Sun.secretNote", "extraNarrative"]);
    assert.ok(!JSON.stringify(u.technical).includes("SIZINTI") && !JSON.stringify(u.interpretation).includes("SIZINTI"));
  });

  await t("5D motor: D1 ve D9 AYRI sonuç/önbellek; bölüm ve ayanamsa ayrı anahtar; tekrar 0 istek; geçersiz bölüm (1/5/61/'x') reddedilir; varsayılan D9; saat yok → TIME_REQUIRED; yetkisizde significance yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r1 = (await run(ctx, pa, [D1SEL(), VSEL(), VSEL(10), VSEL(9, "raman")], rx.deps)).body as J;
    assert.equal(rx.calls.length, 4, JSON.stringify(r1).slice(0, 400));
    const bodies = rx.calls.filter((c) => c.endpoint === "/vedic-astrology/divisional-chart").map((c) => c.body);
    assert.deepEqual(bodies.map((b) => `${String(b.division)}/${String(b.ayanamsa)}/${String(b.timezone)}`).sort(), ["10/lahiri/3", "9/lahiri/3", "9/raman/3"]);
    assert.ok(rx.calls.every((c) => !("apiKey" in c.body)));
    const ids = (r1.results as J[]).map((x) => x.view.id);
    assert.equal(new Set(ids).size, 4, "D1/D9/D10/D9-raman sonuç kimlikleri ayrı olmalı");
    const again = (await run(ctx, pa, [VSEL(9), VSEL(10)], rx.deps)).body as J;
    assert.equal(rx.calls.length, 4, "tekrar çalıştırma yeni istek yaptı");
    assert.deepEqual((again.results as J[]).map((x) => x.view.id).sort(), [ids[1], ids[2]].sort());
    for (const badDiv of [1, 5, 61, "x", -9]) {
      const r = await run(ctx, pa, [VSEL(badDiv as number)], rx.deps);
      const b = r.body as J;
      assert.ok(r.status >= 400 || (b.results as J[]).every((x) => !x.ok), `bölüm ${String(badDiv)} kabul edildi`);
    }
    assert.equal(rx.calls.length, 4);
    const unknown = await profile(ctx, { label: "Saatsiz", birthTime: null, timeKnown: false, timeAccuracy: "unknown" });
    const tu = (await run(ctx, unknown, [VSEL()], rx.deps)).body as J;
    assert.ok(JSON.stringify(tu).includes("TIME_REQUIRED"), JSON.stringify(tu).slice(0, 300));
    assert.equal(rx.calls.length, 4);
    const sig = D9.response.division.significance as string;
    const got = await getAstrologyResult(ctxOf(store, { entitlements: NO_INTERP }), ids[1], { profileId: null, revision: null, ownerPreviewHideInterp: false });
    assert.ok(!JSON.stringify(got.body).includes(sig), "yetkisiz görünümde significance");
    const ok = await getAstrologyResult(ctx, ids[1], { profileId: null, revision: null, ownerPreviewHideInterp: false });
    assert.ok(JSON.stringify(ok.body).includes(sig), "yetkili görünümde significance yok");
    assert.ok(!JSON.stringify(ok.body).match(/raw_response|apiKey/));
  });

  await t("5D konular + notlar: D9 anahtarları navamsa_*, D10 varga_*:d10 — D1 ile karışmaz; not bağlamı ayanamsa|division (D1 ≠ D9 ≠ D10); KB vedic geleneği; ayrıntı anahtarları konu kümesinin alt kümesi", async () => {
    const tech = d9Tech();
    const k9 = topicsForTechnique("vedic.varga", tech).map((x) => x.key);
    assert.ok(k9.includes("navamsa_lagna_rashi:capricorn"));
    assert.ok(k9.includes("navamsa_vargottama:sun"));
    assert.ok(k9.includes("navamsa_graha_in_bhava:venus:10"));
    for (const k of k9) {
      assert.ok(isSectionKeyForTechnique("vedic.varga", k), k);
      assert.ok(!isSectionKeyForTechnique("vedic.d1", k), `D9 konusu D1 notuna yazılabiliyor: ${k}`);
      assert.equal(parseAnyTopicKey("western", k), null);
    }
    for (const k of topicsForTechnique("vedic.d1", d1Tech()).map((x) => x.key)) assert.ok(!isSectionKeyForTechnique("vedic.varga", k), `D1 konusu varga notuna yazılabiliyor: ${k}`);
    const t10 = { ...tech, division: { ...tech.division, number: 10 as const, name: "Dasamsa" } };
    const k10 = topicsForTechnique("vedic.varga", t10).map((x) => x.key);
    assert.ok(k10.every((k) => k.startsWith("varga_") && k.includes(":d10")), k10.join(","));
    for (const p of ["lagna", "sun", "moon", "mars"] as const) {
      for (const k of vargaTopicKeys(tech, p)) assert.ok(k9.includes(k), `ayrıntı anahtarı konu kümesinde yok: ${k}`);
      for (const k of vargaTopicKeys(t10, p)) assert.ok(k10.includes(k), k);
    }
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL(), VSEL(9), VSEL(10)], rx.deps);
    const ws = async (sel: J) => (await getWorkspace(ctx, { profileId: pa, revision: 1, ...sel })).body as J;
    const w9 = await ws(VSEL(9));
    const w10 = await ws(VSEL(10));
    const w1 = await ws(D1SEL());
    assert.equal(w9.noteContext, "ayanamsa:lahiri|division:9");
    assert.equal(w10.noteContext, "ayanamsa:lahiri|division:10");
    assert.equal(new Set([w9.contextKey, w10.contextKey, w1.contextKey]).size, 3);
    const note = (sel: J, nc: string, body: string, sectionKey = "overall") =>
      saveExpertNote(ctx, { profileId: pa, technique: sel.technique, sectionKey, expectedRevision: null, noteContext: nc, body });
    { const r0 = await note(VSEL(9), "ayanamsa:lahiri|division:9", "D9 notu"); assert.equal(r0.status, 201, JSON.stringify(r0.body)); }
    { const r0 = await note(VSEL(10), "ayanamsa:lahiri|division:10", "D10 notu"); assert.equal(r0.status, 201, JSON.stringify(r0.body)); }
    { const r0 = await note(VSEL(9), "ayanamsa:lahiri|division:9", "D9 Güneş", "navamsa_vargottama:sun"); assert.equal(r0.status, 201, JSON.stringify(r0.body)); }
    assert.equal((await note(VSEL(9), "ayanamsa:lahiri|division:9", "x", "graha_in_rashi:sun:gemini")).status, 400, "D1 konusu D9 notuna yazıldı");
    assert.equal((await note(VSEL(9), "ayanamsa:lahiri|division:1", "x")).status, 400);
    assert.equal((await note(VSEL(9), "division:9|ayanamsa:lahiri", "x")).status, 400, "kanonik olmayan sıra kabul edildi");
    assert.equal((await note(VSEL(9), "ayanamsa:lahiri", "x")).status, 400, "bölümsüz varga bağlamı kabul edildi");
    assert.deepEqual((await ws(VSEL(9))).notes.map((n: J) => n.body).sort(), ["D9 Güneş", "D9 notu"]);
    assert.deepEqual((await ws(VSEL(10))).notes.map((n: J) => n.body), ["D10 notu"]);
    assert.equal((await ws(D1SEL())).notes.length, 0);
    await createKb(ctx, { tradition: "vedic", topicKey: "navamsa_vargottama:sun", title: "Vargottama Güneş", body: "kb" });
    await createKb(ctx, { tradition: "vedic", topicKey: "graha_in_rashi:sun:gemini", title: "D1 Güneş", body: "kb" });
    assert.deepEqual((await ws(VSEL(9))).kbMatches.map((e: J) => e.topicKey), ["navamsa_vargottama:sun"]);
    assert.deepEqual((await ws(D1SEL())).kbMatches.map((e: J) => e.topicKey), ["graha_in_rashi:sun:gemini"]);
    assert.equal(rx.calls.length, 3);
  });

  await t("5D kayıtlı analiz: D9 snapshot (bölüm + ayanamsa + teknik + sürüm), açmak 0 istek; yetkisizde significance yok; başka tenant göremez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [VSEL(9)], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...VSEL(9), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n);
    const js = JSON.stringify(a);
    assert.ok(js.includes('"division":9') || js.includes('"number":9'), "bölüm snapshot'ta yok");
    assert.ok(js.includes("lahiri"));
    assert.ok(js.includes("astro-roxy-vedic-varga-1"), "adaptör sürümü yok");
    const sig = D9.response.division.significance as string;
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis;
    assert.ok(!JSON.stringify(hidden).includes(sig), "yetkisiz kayıtlı görünümde significance");
    const other = await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (sv.body as J).analysisId, false);
    assert.equal(other.status, 404);
  });


  await t("5D yorum paneli: her Vedik yorum şemasının ayrı çizimi var (\"tanınmıyor\"a düşmez); teknik panel sağlayıcı yorum türlerini içe aktarmaz", () => {
    const panel = readFileSync(join(process.cwd(), "app/admin/astroloji/_components/ProviderInterpretationPanel.tsx"), "utf8");
    for (const sch of ["astro.vedic.d1.interp.v1", "astro.vedic.varga.interp.v1"]) assert.ok(panel.includes(`case "${sch}"`), sch);
    const vp = readFileSync(join(process.cwd(), "app/admin/astroloji/_components/VedicPanels.tsx"), "utf8");
    assert.ok(!/Interpretation|significance|interpretations/.test(vp.replace(/division\.significance\s*\n?\s*\*\s*ANLATIDIR[^\n]*/g, "").replace(/\/\*\*[\s\S]*?\*\//g, "")), "Vedik teknik panel yorum alanına erişiyor");
  });

  await t("5E golden: 3 dasha fixture'ı = ürün uç/gövdesi (dashaEndpoint + vedicBirthBody lahiri, doğum timezone); significators yok; anahtar/kişi izi yok", () => {
    const body = vedicBirthBody(SYNTH_A, "lahiri");
    for (const [fx, md, ad] of [[DM, null, null], [DS, "mercury", null], [DSA, "moon", "rahu"]] as const) {
      assert.equal(fx.endpoint, dashaEndpoint(md, ad));
      assert.deepEqual(fx.body, body);
      assert.ok(!("significators" in fx.body));
      assert.ok(!JSON.stringify(fx).match(/apiKey|x-api-key|Ayşe|Ali Örnek/i));
    }
  });

  await t("5E projeksiyon + BAĞIMSIZ denetim: bilinmeyen/düşürülen 0; Ay boylamı = D1 Ay; Janma Revati/Budha; doğum bakiyesi = (1−oran)×17 y; MD'ler kanonik yıllar ve 120 yıl; AD/PD oranları; PD toplamı = AD", () => {
    const m = dashaTech(DM, null, null);
    const s = dashaTech(DS, "mercury", null);
    const p = dashaTech(DSA, "moon", "rahu");
    const d1Moon = d1Tech().grahas.find((g) => g.id === "moon")!;
    for (const x of [m, s, p]) assert.ok(Math.abs(x.moon.longitude - d1Moon.longitude) < 1e-9, "Ay boylamı D1 ile aynı değil");
    assert.equal(m.moon.nakshatraIndex, 26);
    assert.equal(m.moon.nakshatraLord, "mercury");
    const ratio = (d1Moon.longitude - 26 * (360 / 27)) / (360 / 27);
    assert.ok(Math.abs(m.periods[0].durationYears - (1 - ratio) * 17) < 0.003, "doğum bakiyesi");
    assert.equal(m.periods[0].start, "1990-07-15T14:30:00");
    assert.equal(m.periods[0].nominalStart, "1974-07-06T14:30:00");
    assert.deepEqual(m.periods.map((x) => x.lord), ["mercury", "ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn"]);
    m.periods.slice(1).forEach((x) => assert.equal(x.durationYears, VIMSHOTTARI_YEARS[x.lord]));
    assert.equal(Number(m.periods[8].end.slice(0, 4)) - Number(m.periods[0].nominalStart!.slice(0, 4)), 120);
    // sub/Mercury: doğumla kesilmiş MD → yalnız doğumdan sonraki AD (Saturn), nominal başlangıç = MD sonu − 17×19/120 yıl.
    assert.equal(s.parent!.lord, "mercury");
    assert.deepEqual(s.periods.map((x) => x.lord), ["saturn"]);
    const satFull = (17 * 19) / 120;
    const nomMs = Date.parse(`${s.periods[0].nominalStart}Z`);
    const endMs = Date.parse(`${s.periods[0].end}Z`);
    assert.ok(Math.abs((endMs - nomMs) / (365.25 * 86400000) - satFull) < 0.003, "Satürn AD nominal süresi");
    // sub/Moon/Rahu: 9 PD, sıra Rahu'dan; süre = (10×18/120)×pd/120; toplam = AD (1.5 y).
    assert.equal(p.parent!.lord, "rahu");
    assert.deepEqual(p.periods.map((x) => x.lord), ["rahu", "jupiter", "saturn", "mercury", "ketu", "venus", "sun", "moon", "mars"]);
    p.periods.forEach((x) => assert.ok(Math.abs(x.durationYears - (1.5 * VIMSHOTTARI_YEARS[x.lord]) / 120) < 0.003, x.lord));
    assert.ok(Math.abs(p.periods.reduce((a, x) => a + x.durationYears, 0) - 1.5) < 0.003);
    assert.equal(p.periods[0].start, p.parent!.start);
    assert.equal(p.periods[8].end, p.parent!.end);
    // Ay MD'si (major) Rahu AD'yi kapsar.
    const moonMd = m.periods.find((x) => x.lord === "moon")!;
    assert.ok(moonMd.start <= p.parent!.start && p.parent!.end <= moonMd.end);
    for (const x of [m, s, p]) assert.ok(!JSON.stringify(x).match(/interpretation|Bu dönem|Entelektüel/), "teknikte anlatı");
  });

  await t("5E fail-closed: sıra/ardışıklık/süre/ayanamsa/nakshatra/doğum anı/bakiye/üst yönetici/kesilme işareti çelişkisi REDDEDİLİR; bilinmeyen alan (significators) yalnız yolu", () => {
    const bad = (fx: J, md: VedicGrahaId | null, ad: VedicGrahaId | null, fn: (r: J) => void, ay: "lahiri" | "raman" = "lahiri") => {
      const r = structuredClone(fx.response);
      fn(r);
      return projectRoxyVedicDasha(r, { ayanamsa: ay, mahadasha: md, antardasha: ad, birthLocal: "1990-07-15T14:30:00", utcOffsetHours: 3 }) as J;
    };
    const no = (r: J, why: string) => assert.equal(r.ok, false, why);
    no(bad(DM, null, null, () => {}, "raman"), "ayanamsa");
    no(bad(DM, null, null, (r) => { [r.mahadashas[2], r.mahadashas[3]] = [r.mahadashas[3], r.mahadashas[2]]; }), "sıra");
    no(bad(DM, null, null, (r) => { r.mahadashas[3].startDate = "2018-07-07T14:30:00"; }), "ardışıklık");
    no(bad(DM, null, null, (r) => { r.mahadashas[4].durationYears = 11; }), "süre");
    no(bad(DM, null, null, (r) => { r.moonNakshatra = 26; }), "moonNakshatra");
    no(bad(DM, null, null, (r) => { r.nakshatraLord = "Ketu"; }), "nakshatraLord");
    no(bad(DM, null, null, (r) => { r.mahadashas[0].startDate = "1990-07-15T12:30:00"; }), "doğum anı");
    no(bad(DM, null, null, (r) => { r.moonLongitude = 357.5; }), "bakiye ↔ Ay boylamı");
    no(bad(DM, null, null, (r) => { r.totalYears = 100; }), "totalYears");
    no(bad(DS, "mercury", null, (r) => { r.mahadashaLord = "Venus"; }), "md");
    no(bad(DS, "mercury", null, (r) => { delete r.antardashas[0].nominalStartDate; }), "kesilme işareti");
    no(bad(DS, "venus", null, () => {}), "istenmeyen md");
    no(bad(DSA, "moon", "rahu", (r) => { r.pratyantardashas[4].antardashaLord = "Venus"; }), "pd üst yönetici");
    // YALNIZ sıra: Ketu ve Mars (ikisi de 7 y) adları yer değiştirir — tarih/süre/ardışıklık geçerli kalır.
    no(bad(DSA, "moon", "rahu", (r) => { r.pratyantardashas[4].planet = "Mars"; r.pratyantardashas[8].planet = "Ketu"; }), "Vimshottari sırası (yalnız)");
    no(bad(DSA, "moon", "rahu", (r) => { r.pratyantardashas[8].endDate = "2027-06-07T18:30:00"; }), "son bitiş ≠ AD sonu");
    no(bad(DSA, "moon", "rahu", (r) => { r.antardashaPeriod.durationYears = 1.6; }), "AD kanonik süre");
    no(bad(DSA, "moon", "jupiter", () => {}), "istenmeyen ad");
    const u = bad(DM, null, null, (r) => { r.mahadashas[0].significators = { house: 9, strength: { grade: "A" } }; r.houseThemes = { 1: ["SIZINTI"] }; });
    assert.ok(u.ok);
    assert.ok(u.unmappedFields.includes("houseThemes") && u.unmappedFields.some((x: string) => x.startsWith("mahadashas[].significators")), JSON.stringify(u.unmappedFields));
    assert.ok(!JSON.stringify(u.technical).includes("SIZINTI") && !JSON.stringify(u.technical).includes("significators"));
  });

  await t("5E motor: 3 düzey AYRI sonuç/önbellek, uçlar beyaz listeden; tekrar 0 istek; geçersiz yol (ad tek başına, 'Mercury', 'pluto') reddedilir; saat yok → TIME_REQUIRED; yorum A/B", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r1 = (await run(ctx, pa, [DSEL(), DSEL("mercury"), DSEL("moon", "rahu")], rx.deps)).body as J;
    assert.deepEqual(rx.calls.map((c) => c.endpoint).sort(), ["/vedic-astrology/dasha/major", "/vedic-astrology/dasha/sub/Mercury", "/vedic-astrology/dasha/sub/Moon/Rahu"]);
    assert.ok((r1.results as J[]).every((x) => x.ok), JSON.stringify(r1).slice(0, 300));
    assert.equal(new Set((r1.results as J[]).map((x) => x.view.id)).size, 3);
    await run(ctx, pa, [DSEL("moon", "rahu"), DSEL()], rx.deps);
    assert.equal(rx.calls.length, 3, "önbellek");
    for (const sel of [{ technique: "vedic.dasha", options: { antardasha: "rahu" } }, DSEL("Mercury"), DSEL("pluto"), DSEL("moon", "x")]) {
      const r = await run(ctx, pa, [sel], rx.deps);
      const b = r.body as J;
      assert.ok(r.status >= 400 || (b.results as J[]).every((x) => !x.ok), JSON.stringify(sel));
    }
    assert.equal(rx.calls.length, 3);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const u = (await run(ctx, pu, [DSEL()], rx.deps)).body as J;
    assert.equal(u.results[0].code, "TIME_REQUIRED");
    assert.equal(rx.calls.length, 3);
    const narr = (DSA.response.pratyantardashas as J[]).map((x) => x.interpretation as string);
    const vis = JSON.stringify((await run(ctx, pa, [DSEL("moon", "rahu")], rx.deps)).body);
    const hid = JSON.stringify((await run(ctxOf(store, { entitlements: NO_INTERP }), pa, [DSEL("moon", "rahu")], rx.deps)).body);
    const pre = JSON.stringify((await run(ctx, pa, [DSEL("moon", "rahu")], rx.deps, true)).body);
    assert.ok(narr.some((x) => vis.includes(x)), "yetkili yorumu görmeli");
    for (const b of [hid, pre]) assert.ok(!narr.some((x) => b.includes(x)), "yorum sızdı");
    assert.equal(rx.calls.length, 3);
  });

  await t("5E konular + notlar: düzeye göre dasha_mahadasha / dasha_antardasha:md / dasha_pratyantardasha:md:ad; not bağlamı ayanamsa|mahadasha|antardasha (düzeyler ayrı); kayıtlı analiz 0 istek + yorum kapısı + tenant", async () => {
    const m = dashaTech(DM, null, null);
    const p = dashaTech(DSA, "moon", "rahu");
    assert.deepEqual(topicsForTechnique("vedic.dasha", m).map((x) => x.key).sort(), m.periods.map((x) => `dasha_mahadasha:${x.lord}`).sort());
    assert.deepEqual(topicsForTechnique("vedic.dasha", dashaTech(DS, "mercury", null)).map((x) => x.key), ["dasha_antardasha:mercury:saturn"]);
    const pk = topicsForTechnique("vedic.dasha", p).map((x) => x.key);
    assert.equal(pk.length, 9);
    assert.ok(pk.includes("dasha_pratyantardasha:moon:rahu:mercury"));
    for (const k of pk) {
      assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
      assert.ok(isSectionKeyForTechnique("vedic.dasha", k) && !isSectionKeyForTechnique("vedic.d1", k));
    }
    assert.equal(dashaTopicKey(p, "ketu"), "dasha_pratyantardasha:moon:rahu:ketu");
    assert.equal(dashaTopicKey(m, "venus"), "dasha_mahadasha:venus");
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [DSEL(), DSEL("moon", "rahu")], rx.deps);
    const ws = async (sel: J) => (await getWorkspace(ctx, { profileId: pa, revision: 1, ...sel })).body as J;
    const wm = await ws(DSEL());
    const wp = await ws(DSEL("moon", "rahu"));
    assert.equal(wm.noteContext, "ayanamsa:lahiri");
    assert.equal(wp.noteContext, "ayanamsa:lahiri|mahadasha:moon|antardasha:rahu");
    assert.notEqual(wm.contextKey, wp.contextKey);
    const note = (nc: string, body: string, sectionKey = "overall") => saveExpertNote(ctx, { profileId: pa, technique: "vedic.dasha", sectionKey, expectedRevision: null, noteContext: nc, body });
    assert.equal((await note("ayanamsa:lahiri", "MD notu")).status, 201);
    assert.equal((await note("ayanamsa:lahiri|mahadasha:moon|antardasha:rahu", "PD notu", "dasha_pratyantardasha:moon:rahu:mercury")).status, 201);
    assert.equal((await note("ayanamsa:lahiri|antardasha:rahu", "x")).status, 400, "md'siz bağlam");
    assert.equal((await note("ayanamsa:lahiri|mahadasha:Moon", "x")).status, 400, "büyük harf");
    assert.deepEqual((await ws(DSEL())).notes.map((n: J) => n.body), ["MD notu"]);
    assert.deepEqual((await ws(DSEL("moon", "rahu"))).notes.map((n: J) => n.body), ["PD notu"]);
    await createKb(ctx, { tradition: "vedic", topicKey: "dasha_pratyantardasha:moon:rahu:mercury", title: "PD KB", body: "kb" });
    assert.deepEqual((await ws(DSEL("moon", "rahu"))).kbMatches.map((e: J) => e.title), ["PD KB"]);
    assert.equal((await ws(DSEL())).kbMatches.length, 0);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DSEL("moon", "rahu"), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = JSON.stringify(((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis);
    assert.equal(rx.calls.length, n, "kayıtlı analiz açmak istek yaptı");
    assert.ok(a.includes("PD notu") && !a.includes("MD notu"), "yanlış bağlam notu");
    assert.ok(a.includes("astro-roxy-vedic-dasha-1") && a.includes('"antardasha":"rahu"'));
    const narr = (DSA.response.pratyantardashas as J[]).map((x) => x.interpretation as string);
    const hidden = JSON.stringify(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis);
    assert.ok(!narr.some((x) => hidden.includes(x)), "yetkisiz kayıtlı görünümde yorum");
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (sv.body as J).analysisId, false)).status, 404);
  });

  await t("5E saf yardımcılar + istemci uç koruması: yerel→UTC (doğum ofseti); 'şimdi' sırası; uç beyaz listesi (büyük harf yönetici kabul, '..'/'//'/sorgu/boşluk RED)", async () => {
    const m = dashaTech(DM, null, null);
    const p = dashaTech(DSA, "moon", "rahu");
    assert.equal(dashaUtcMs("1990-07-15T14:30:00", 3), Date.UTC(1990, 6, 15, 11, 30));
    const at = Date.UTC(2026, 9, 8, 12, 0);
    assert.equal(m.periods[currentDashaIndex(m, at)].lord, "moon");
    assert.equal(p.periods[currentDashaIndex(p, at)].lord, "mercury");
    assert.equal(currentDashaIndex(p, Date.UTC(2030, 0, 1)), -1);
    // Sınır: PD Mercury bitişi 2026-10-21T12:30 (+3) = 09:30Z → o an Ketu başlar.
    assert.equal(p.periods[currentDashaIndex(p, Date.UTC(2026, 9, 21, 9, 30))].lord, "ketu");
    const urls: string[] = [];
    const fetchImpl = async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const cfg = { apiKey: "k-test-5e", baseUrl: "https://roxy-fake.local/api/v2" };
    const ok = await callRoxy(cfg, "/vedic-astrology/dasha/sub/Moon/Rahu", {}, { fetchImpl, maxRetries: 0 });
    assert.ok(ok.ok);
    for (const bad of ["/vedic-astrology/dasha/sub/../major", "//evil.example/x", "/vedic-astrology/dasha/sub/Moon?x=1", "/vedic astrology", "/vedic-astrology/dasha/sub/Moon%2F..", "vedic-astrology/dasha/major"]) {
      const r = await callRoxy(cfg, bad, {}, { fetchImpl, maxRetries: 0 });
      assert.equal(r.ok, false, bad);
    }
    assert.equal(urls.length, 1);
    assert.ok(urls[0].startsWith("https://roxy-fake.local/api/v2/vedic-astrology/dasha/sub/Moon/Rahu?"));
    for (const md of VEDIC_GRAHAS) for (const ad of [null, ...VEDIC_GRAHAS]) assert.match(dashaEndpoint(md, ad), /^\/vedic-astrology\/dasha\/sub\/[A-Z][a-z]+(\/[A-Z][a-z]+)?$/);
  });

  await t("5F golden: 4 fixture = ürün uç/gövdesi (aspects/panchang ayanamsasız Lahiri-sabit; ashtakavarga/shadbala lahiri); yoga/detect golden'ı YOK (D1 48 yoga denetimini zaten taşır)", () => {
    const b = vedicBirthBody(SYNTH_A, "lahiri");
    const fixed = { date: b.date, time: b.time, latitude: b.latitude, longitude: b.longitude, timezone: b.timezone };
    assert.equal(FA.endpoint, "/vedic-astrology/aspects");
    assert.deepEqual(FA.body, { ...fixed, coordinateSystem: "sidereal" });
    assert.equal(FP.endpoint, "/vedic-astrology/panchang/basic");
    assert.deepEqual(FP.body, fixed);
    assert.deepEqual(FK.body, b);
    assert.deepEqual(FS.body, b);
    for (const fx of [FA, FP, FK, FS]) assert.ok(!JSON.stringify(fx).match(/apiKey|x-api-key|Ayşe|Ali Örnek/i));
    assert.equal(has("vedic-yoga"), false, "yoga/detect için gereksiz golden çağrısı yapılmış");
    assert.equal((D1.response.yogas as J[]).length, 48);
  });

  await t("5F bağımsız denetim: drishti konumları = D1 boylamları ve açı = (n−1)×30° ± orb; Ashtakavarga BPHS toplamları + SAV; Shadbala toplam/rupa/oran/sıra; Panchanga D1'in Güneş/Ay'ından yeniden türetilir", () => {
    const d1 = d1Tech();
    const dr = projOk(projectRoxyVedicDrishti(FA.response, { birthLocal: "1990-07-15T14:30:00" })) as VedicDrishtiTechnical;
    // /aspects boylamları 4 ondalığa yuvarlar (≤5e-5°): aynı Lahiri çerçevesi + aynı an.
    for (const p of dr.positions) assert.ok(Math.abs(p.longitude - d1.grahas.find((g) => g.id === p.id)!.longitude) < 1e-4, `${p.id} boylamı D1 ile aynı değil`);
    assert.ok(dr.aspects.some((a) => a.from === "sun" && a.to === "saturn" && a.type === 7));
    for (const a of dr.aspects) {
      const lf = dr.positions.find((p) => p.id === a.from)!.longitude;
      const lt = dr.positions.find((p) => p.id === a.to)!.longitude;
      const sep = (((lt - lf) % 360) + 360) % 360;
      assert.ok(Math.abs(Math.abs(((sep - (a.type - 1) * 30 + 540) % 360) - 180) - a.orb) < 0.02, `${a.from}→${a.to}`);
    }
    const ak = projOk(projectRoxyVedicAshtakavarga(FK.response, { ayanamsa: "lahiri" })) as VedicAshtakavargaTechnical;
    assert.deepEqual(ak.bav.map((r) => r.total), [48, 49, 39, 54, 56, 52, 39, 49]);
    assert.equal(ak.sav.total, 337);
    for (let i = 0; i < 12; i++) assert.equal(ak.sav.bindus[i], ak.bav.slice(0, 7).reduce((s, r) => s + r.bindus[i], 0));
    const sb = projOk(projectRoxyVedicShadbala(FS.response, { ayanamsa: "lahiri" })) as VedicShadbalaTechnical;
    for (const p of sb.planets) assert.ok(Math.abs(SHADBALA_COMPONENTS.reduce((s, c) => s + p[c], 0) - p.totalVirupas) < 0.05, p.id);
    assert.deepEqual([...sb.planets].sort((a, b) => a.rank - b.rank).map((p) => p.id), ["sun", "mars", "moon", "venus", "saturn", "jupiter", "mercury"]);
    const pc = projOk(projectRoxyVedicPanchanga(FP.response)) as VedicPanchangaTechnical;
    const sun = d1.grahas.find((g) => g.id === "sun")!.longitude;
    const moon = d1.grahas.find((g) => g.id === "moon")!.longitude;
    const el = (((moon - sun) % 360) + 360) % 360;
    assert.equal(pc.tithi.number, Math.floor(el / 12) + 1);
    assert.equal(pc.tithi.number, 23);
    assert.equal(pc.tithi.paksha, "krishna");
    assert.equal(pc.nityaYoga.number, Math.floor(((sun + moon) % 360) / (360 / 27)) + 1);
    assert.equal(NITYA_YOGA_LABELS[pc.nityaYoga.number - 1], "Sukarma");
    assert.equal(pc.karana.id, karanaOfHalfTithi(Math.floor(el / 6)).id);
    assert.equal(pc.karana.id, "kaulava");
    assert.equal(pc.nakshatra.id, d1.grahas.find((g) => g.id === "moon")!.nakshatra.id);
    assert.deepEqual([karanaOfHalfTithi(0).id, karanaOfHalfTithi(1).id, karanaOfHalfTithi(56).id, karanaOfHalfTithi(57).id, karanaOfHalfTithi(59).id], ["kimstughna", "bava", "vishti", "shakuni", "naga"]);
    for (const x of [dr, ak, sb, pc]) assert.ok(!JSON.stringify(x).match(/characteristics|meaning|balaThemes|Konum gücü|bireyleri/), "teknikte anlatı");
  });

  await t("5F fail-closed: drishti (orb/izinsiz tür/eksik karşılık), Ashtakavarga (BAV toplamı/SAV/indirgenmiş>özgün/pinda), Shadbala (toplam/rupa/asgari/sıra), Panchanga (tithi/paksha/yoga/karana/pada) REDDEDİLİR; bilinmeyen alan yalnız yolu", () => {
    const m = <T,>(fx: J, fn: (r: J) => void, p: (r: J) => T) => {
      const r = structuredClone(fx.response);
      fn(r);
      return p(r) as J;
    };
    const DR = (fn: (r: J) => void) => m(FA, fn, (r) => projectRoxyVedicDrishti(r, { birthLocal: "1990-07-15T14:30:00" }));
    const AK = (fn: (r: J) => void, ay: "lahiri" | "raman" = "lahiri") => m(FK, fn, (r) => projectRoxyVedicAshtakavarga(r, { ayanamsa: ay }));
    const SB = (fn: (r: J) => void) => m(FS, fn, (r) => projectRoxyVedicShadbala(r, { ayanamsa: "lahiri" }));
    const PC = (fn: (r: J) => void) => m(FP, fn, (r) => projectRoxyVedicPanchanga(r));
    const no = (r: J, why: string) => assert.equal(r.ok, false, why);
    no(DR((r) => { r.aspects[0].orb = 3; }), "orb");
    no(DR((r) => { r.aspects[0].aspectType = "5th"; }), "Güneş 5. bakış");
    no(DR((r) => { r.mutualAspects.push({ planet1: "Moon", planet2: "Mars", aspectType: "7th" }); }), "olmayan karşılıklı");
    no(DR((r) => { r.planets[0].sign = "Cancer"; }), "rashi");
    no(DR((r) => { r.datetime = "1990-07-15T12:30:00"; }), "tarih");
    no(AK(() => {}, "raman"), "ayanamsa");
    no(AK((r) => { r.bhinnashtakavarga[0].bindus[0] += 1; r.bhinnashtakavarga[0].total += 1; r.sarvashtakavarga.bindus[0] += 1; r.sarvashtakavarga.total += 1; }), "BAV toplamı BPHS");
    no(AK((r) => { r.sarvashtakavarga.bindus[0] += 1; r.sarvashtakavarga.bindus[1] -= 1; }), "SAV ≠ Σ BAV");
    no(AK((r) => { r.reducedBhinnashtakavarga[1].bindus[2] = 3; r.reducedBhinnashtakavarga[1].total += 3; r.reducedSarvashtakavarga.bindus[2] += 3; r.reducedSarvashtakavarga.total += 3; }), "indirgenmiş > özgün");
    no(AK((r) => { r.shodhyaPinda[0].shodhyaPinda += 1; }), "pinda");
    no(SB((r) => { r.planets[0].kalaBala += 10; }), "toplam");
    no(SB((r) => { r.planets[3].minRequired = 5; }), "asgari");
    no(SB((r) => { r.planets[6].naisargikaBala = 10; r.planets[6].totalVirupas += 1.43; r.planets[6].totalRupas = r.planets[6].totalVirupas / 60; r.planets[6].strengthRatio = r.planets[6].totalRupas / 5; }), "naisargika");
    no(SB((r) => { [r.planets[0].relativeRank, r.planets[1].relativeRank] = [r.planets[1].relativeRank, r.planets[0].relativeRank]; }), "sıra");
    no(PC((r) => { r.tithi.number = 22; }), "tithi");
    no(PC((r) => { r.tithi.paksha = "Shukla"; }), "paksha");
    no(PC((r) => { r.yoga.number = 8; }), "nitya yoga");
    no(PC((r) => { r.karana.number = 4; }), "karana");
    no(PC((r) => { r.nakshatra.pada = 3; }), "pada");
    const u = PC((r) => { r.vara = { name: "SIZINTI" }; r.tithi.extra = "SIZINTI"; });
    assert.ok(u.ok);
    assert.deepEqual([...u.unmappedFields].sort(), ["tithi.extra", "vara"]);
    assert.ok(!JSON.stringify(u.technical).includes("SIZINTI"));
  });

  await t("5F motor: 4 teknik ayrı sonuç; Lahiri dışında drishti/panchanga BİRİM YOK (0 istek, açık neden); ashtakavarga/shadbala ayanamsa ayrı anahtar; tekrar 0 istek; saat yok → TIME_REQUIRED; yorum A/B", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const sels = ["vedic.drishti", "vedic.ashtakavarga", "vedic.shadbala", "vedic.panchanga"].map((technique) => ({ technique, options: {} }));
    const r1 = (await run(ctx, pa, sels, rx.deps)).body as J;
    assert.ok((r1.results as J[]).every((x) => x.ok), JSON.stringify(r1).slice(0, 400));
    assert.deepEqual(rx.calls.map((c) => c.endpoint).sort(), ["/vedic-astrology/ashtakavarga", "/vedic-astrology/aspects", "/vedic-astrology/panchang/basic", "/vedic-astrology/shadbala"]);
    assert.ok(!("ayanamsa" in rx.calls.find((c) => c.endpoint === "/vedic-astrology/aspects")!.body));
    assert.ok(!("ayanamsa" in rx.calls.find((c) => c.endpoint === "/vedic-astrology/panchang/basic")!.body));
    await run(ctx, pa, sels, rx.deps);
    assert.equal(rx.calls.length, 4, "önbellek");
    const rr = await run(ctx, pa, sels.map((s) => ({ ...s, options: { ayanamsa: "raman" } })), rx.deps);
    const rb = JSON.stringify(rr.body);
    assert.ok(rb.includes("yalnız Lahiri"), rb.slice(0, 300));
    assert.equal(rx.calls.filter((c) => c.endpoint === "/vedic-astrology/aspects" || c.endpoint === "/vedic-astrology/panchang/basic").length, 2, "Lahiri dışı drishti/panchanga sağlayıcıya gitti");
    assert.deepEqual(rx.calls.slice(4).map((c) => `${c.endpoint}:${String(c.body.ayanamsa)}`).sort(), ["/vedic-astrology/ashtakavarga:raman", "/vedic-astrology/shadbala:raman"]);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const u = (await run(ctx, pu, sels, rx.deps)).body as J;
    assert.ok((u.results as J[]).every((x) => x.code === "TIME_REQUIRED"));
    const n = rx.calls.length;
    const themes = Object.values(FS.response.balaThemes as J).map((x: J) => x.meaning as string);
    const chars = [FP.response.nakshatra.characteristics, FP.response.karana.characteristics] as string[];
    const vis = JSON.stringify((await run(ctx, pa, sels, rx.deps)).body);
    const hid = JSON.stringify((await run(ctxOf(store, { entitlements: NO_INTERP }), pa, sels, rx.deps)).body);
    const pre = JSON.stringify((await run(ctx, pa, sels, rx.deps, true)).body);
    assert.ok(themes.some((x) => vis.includes(x)) && chars.some((x) => vis.includes(x)), "yetkili yorumu görmeli");
    for (const b of [hid, pre]) assert.ok(![...themes, ...chars].some((x) => b.includes(x)), "yorum sızdı");
    assert.equal(rx.calls.length, n);
  });

  await t("5F konular + notlar + kayıtlı analiz: graha_drishti / shadbala_*_min / panchanga_* (DB regex); bağlamlar Vedik D1'den ayrı; KB eşleşmesi; kayıtlı Panchanga 0 istek + yorum kapısı", async () => {
    const dr = projOk(projectRoxyVedicDrishti(FA.response, { birthLocal: "1990-07-15T14:30:00" })) as VedicDrishtiTechnical;
    const sb = projOk(projectRoxyVedicShadbala(FS.response, { ayanamsa: "lahiri" })) as VedicShadbalaTechnical;
    const pc = projOk(projectRoxyVedicPanchanga(FP.response)) as VedicPanchangaTechnical;
    const kd = topicsForTechnique("vedic.drishti", dr).map((x) => x.key);
    const ks = topicsForTechnique("vedic.shadbala", sb).map((x) => x.key);
    const kp = topicsForTechnique("vedic.panchanga", pc).map((x) => x.key);
    assert.ok(kd.includes("graha_drishti:sun:saturn"));
    assert.ok(ks.includes("shadbala_below_min:mercury") && ks.includes("shadbala_above_min:sun"));
    assert.deepEqual(kp.sort(), ["panchanga_karana:kaulava", "panchanga_nitya_yoga:7", "panchanga_tithi:23"]);
    assert.deepEqual(topicsForTechnique("vedic.ashtakavarga", {}), []);
    for (const [tech, keys] of [["vedic.drishti", kd], ["vedic.shadbala", ks], ["vedic.panchanga", kp]] as const) {
      for (const k of keys) {
        assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
        assert.ok(isSectionKeyForTechnique(tech, k) && !isSectionKeyForTechnique("vedic.d1", k), k);
        assert.equal(parseAnyTopicKey("western", k), null);
      }
    }
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const PSEL = { technique: "vedic.panchanga", options: {} };
    await run(ctx, pa, [PSEL, { technique: "vedic.shadbala", options: {} }], rx.deps);
    await createKb(ctx, { tradition: "vedic", topicKey: "panchanga_tithi:23", title: "Krishna Ashtami notum", body: "kb" });
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...PSEL })).body as J;
    assert.equal(ws.noteContext, "ayanamsa:lahiri");
    assert.deepEqual(ws.kbMatches.map((e: J) => e.title), ["Krishna Ashtami notum"]);
    const nr = await saveExpertNote(ctx, { profileId: pa, technique: "vedic.panchanga", sectionKey: "panchanga_tithi:23", expectedRevision: null, noteContext: "ayanamsa:lahiri", body: "Panchanga notu" });
    assert.equal(nr.status, 201, JSON.stringify(nr.body));
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.panchanga", sectionKey: "overall", expectedRevision: null, noteContext: "ayanamsa:raman", body: "x" })).status, 400, "Lahiri-sabit teknikte raman bağlamı");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PSEL, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = JSON.stringify(((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis);
    assert.equal(rx.calls.length, n);
    assert.ok(a.includes("Panchanga notu") && a.includes("astro-roxy-vedic-panchanga-1"));
    const hidden = JSON.stringify(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis);
    assert.ok(!hidden.includes(FP.response.nakshatra.characteristics as string));
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (sv.body as J).analysisId, false)).status, 404);
  });

  await t("biçim: derece/dakika KESİLİR (yuvarlanmaz) — 29°59.9′ asla 30°00′ / sonraki burç olmaz", () => {
    assert.equal(formatDegree(28.9975), "28°59′");
    assert.equal(formatDegree(29.99999), "29°59′");
    assert.equal(formatDegree(12.5), "12°30′");
    assert.equal(formatDegree(11 + 20 / 60), "11°20′");
    assert.equal(formatDegree(0), "0°00′");
    assert.equal(formatDegree(88.99753063012518 % 30), "28°59′");
  });

  await t("golden kaydı: var olan Vedik fixture'lar plan adlarıyla uyumlu", () => {
    for (const g of goldenPlan5()) if (has(g.name)) assert.equal(load(g.name).endpoint.split("/").slice(0, 3).join("/"), g.endpoint.split("/").slice(0, 3).join("/"));
    assert.ok(SIGN_IDS.length === 12);
  });

  console.log(`\nastrology phase5 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase5 harness çöktü:", e);
  process.exit(1);
});
