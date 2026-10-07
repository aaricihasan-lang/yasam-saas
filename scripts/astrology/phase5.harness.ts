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
import { getAnalysis, getWorkspace, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique, traditionOfKey } from "@/lib/astrology/topics/index";
import { VEDIC_SPECS, VEDIC_YOGA_NAMES, parseVedicTopicKey, vedicArgOptions, vedicDefaultParts, vedicTopicKey } from "@/lib/astrology/topics/vedic";
import { projectRoxyVedicD1 } from "@/lib/astrology/providers/roxy/vedic";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { toKundliData } from "@/app/admin/astroloji/_components/VedicPanels";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import type { VedicD1Technical } from "@/lib/astrology/model/vedic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const has = (n: string) => existsSync(join(DIR, `${n}.json`));
const D1 = load("vedic-d1");
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
      saveExpertNote(ctx, { profileId: pid, technique: "vedic.d1", sectionKey: "overall", expectedRevision: null, ...o }).then((r) => assert.equal(r.status, status, JSON.stringify(r.body)));
    await note(pa, { body: "A Vedik notu" });
    await note(py, { body: "Y Vedik notu" });
    await note(pa, { sectionKey: "graha_in_rashi:sun:gemini", body: "A Güneş" });
    await note(pa, { sectionKey: "planet_in_sign:sun:cancer", body: "x" }, 400);
    assert.deepEqual((await ws(pa, D1SEL())).notes.map((n: J) => n.body).sort(), ["A Güneş", "A Vedik notu"]);
    assert.deepEqual((await ws(py, D1SEL())).notes.map((n: J) => n.body), ["Y Vedik notu"]);
    assert.equal((await ws(pa, { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } })).notes.length, 0, "Vedik not Batı natal alanında");
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
