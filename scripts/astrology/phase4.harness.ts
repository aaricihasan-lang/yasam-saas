/**
 * ASTROLOJİ AŞAMA 4 harness'i — Astrocartography · Relocation · Local Space.
 *
 *   • Golden (gerçek, sentetik kişi; 3 çağrı) → adaptör: bilinmeyen/düşürülen alan, teknik/yorum ayrımı.
 *   • Yorum A/B (açık / yetkisiz / önizleme) · ham yanıt · bilinmeyen alan fail-closed.
 *   • Önbellek (aynı konum 0 / farklı konum yeni) · konum çözümü (sunucuda) · saat bilinmiyor (TIME_REQUIRED).
 *   • Relocation: doğum anı sabit (gezegen boylamı = natal), ASC/MC/ev değişir; natal karşılaştırma birimi.
 *   • Bağımsız astronomi: ACG RA/Dec + MC/IC + AC/DC eğrileri, relocated ASC/MC, local space azimut/yükseklik.
 *   • Harita veri dönüşümü (filtre, antimeridyen, pusula) · Bilgi Bankası bağlamı · notlar (konum bağlamı)
 *   • Analizi Kaydet → aç = 0 istek · tenant izolasyonu · log PII.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase4.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlan4, RELOCATION_TARGET } from "./golden/phase4-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { getAstrologyResult, planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, listAnalyses, locationContextKey, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { projectRoxyAstrocartography, projectRoxyLocalSpace, projectRoxyRelocation } from "@/lib/astrology/providers/roxy/location";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { acgMapLines, compassPoint, localSpaceMapLines } from "@/app/admin/astroloji/_components/LocationPanels";
import { initialBearing, MAP_H, MAP_W, packedToPath, project, splitAtAntimeridian } from "@/app/admin/astroloji/_lib/geo";
import { WORLD_BORDER_LINES, WORLD_LAND_RINGS } from "@/app/admin/astroloji/_lib/worldMap110m";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import type { BodyId } from "@/lib/astrology/model/western";
import type { AcgAngle, AstrocartographyTechnical, LocalSpaceTechnical, RelocationTechnical } from "@/lib/astrology/model/westernLocation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const G4: Record<string, { endpoint: string; query: Record<string, string> | null; body: Record<string, unknown>; response: J }> = {};
for (const n of ["astrocartography", "relocation", "local-space"]) G4[n] = JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
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
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const BERLIN = WORLD_LOCATIONS.find((l) => l.id === "de-berlin")!;
const LONDON = WORLD_LOCATIONS.find((l) => l.id === "gb-london")!;

const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown>; query?: Record<string, string> };
/**
 * Sahte Roxy: endpoint → golden. Relocation/local space için gönderilen konum SENTETİK olarak yankılanır
 * (yalnız konum alanı; harita içeriği golden'dır) → farklı hedeflerle önbellek/plan testleri yapılabilir.
 */
function roxy(opts: { failWhen?: (c: Call) => boolean; noEcho?: boolean; mutate?: (endpoint: string, r: J) => void } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-4", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body, o) => {
      const c = { endpoint, body, query: o.query };
      calls.push(c);
      if (opts.failWhen?.(c)) return { ok: false, kind: "server_error", status: 500, attempts: 1 };
      let r: J;
      if (endpoint === "/astrology/natal-chart") r = structuredClone(NATAL_GOLDEN);
      else {
        const g = Object.values(G4).find((x) => x.endpoint === endpoint);
        if (!g) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        r = structuredClone(g.response);
        if (!opts.noEcho && endpoint === "/astrology/relocation-chart") r.relocation = { latitude: body.relocationLatitude, longitude: body.relocationLongitude };
        if (!opts.noEcho && endpoint === "/astrology/local-space") r.birthDetails = { ...r.birthDetails, latitude: body.latitude, longitude: body.longitude };
      }
      opts.mutate?.(endpoint, r);
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
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, extra: Record<string, unknown> = {}, preview = false) =>
  runAstrology(ctx, { profileId: pid, selections, ...extra }, deps, { ownerPreviewHideInterp: preview });

const SEL = {
  acg: { technique: "western.astrocartography", options: {} },
  rel: (id = "us-ny-new-york") => ({ technique: "western.relocation", options: { targetLocationId: id, houseSystem: "placidus" } }),
  ls: (id: string | null = null) => ({ technique: "western.local_space", options: { referenceLocationId: id } }),
};
const FIX: Record<string, string> = { "western.astrocartography": "astrocartography", "western.relocation": "relocation", "western.local_space": "local-space" };
const LOC_TECHS = ["western.astrocartography", "western.relocation", "western.local_space"] as const;

function narratives(raw: J): string[] {
  const out: string[] = [];
  const walk = (v: J) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
    else if (typeof v === "string" && v.length > 40) out.push(v);
  };
  walk(raw);
  return [...new Set(out)];
}
const leaks = (json: string, texts: string[]) => texts.filter((x) => json.includes(x));
const RAW_MARKERS = ["planetLocalized", "signLocalized", "compassDirection", "angularPlanetsLocalized", "raw_response", "input_hash", "relocationLatitude", "k-test-4"];

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const BIRTH = new Date(SYNTH_A.utc);
const AE_BODIES: [BodyId, Astronomy.Body][] = [
  ["sun", Astronomy.Body.Sun], ["moon", Astronomy.Body.Moon], ["mercury", Astronomy.Body.Mercury], ["venus", Astronomy.Body.Venus],
  ["mars", Astronomy.Body.Mars], ["jupiter", Astronomy.Body.Jupiter], ["saturn", Astronomy.Body.Saturn], ["uranus", Astronomy.Body.Uranus],
  ["neptune", Astronomy.Body.Neptune], ["pluto", Astronomy.Body.Pluto],
];

/** Jeosentrik, tarihin ekinoksuna göre görünür ekvator koordinatı (paralaks YOK — sağlayıcı yöntemi). */
function geoEquator(body: Astronomy.Body, tm: Astronomy.AstroTime): { ra: number; dec: number } {
  const v = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(tm), Astronomy.GeoVector(body, tm, true));
  const eq = Astronomy.EquatorFromVector(v);
  return { ra: eq.ra, dec: eq.dec };
}

const acgTech = () => (projectRoxyAstrocartography(G4.astrocartography.response) as J).technical as AstrocartographyTechnical;
const relTech = () => (projectRoxyRelocation(G4.relocation.response, { houseSystem: "placidus", target: { latitude: RELOCATION_TARGET.latitude, longitude: RELOCATION_TARGET.longitude } }) as J).technical as RelocationTechnical;
const lsTech = () => (projectRoxyLocalSpace(G4["local-space"].response, { reference: { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude } }) as J).technical as LocalSpaceTechnical;

async function main() {
  // ═══ A) GOLDEN ═══════════════════════════════════════════════════════════════
  await t("golden: 3 fixture mevcut; kayıtlı gövde/sorgu = ürünün gövdesi/sorgusu; anahtar/ad izi yok", () => {
    for (const g of goldenPlan4()) {
      const f = G4[g.name];
      assert.equal(f.endpoint, g.endpoint);
      assert.deepEqual(f.body, JSON.parse(JSON.stringify(g.body)));
      assert.deepEqual(f.query, g.query ?? null);
      assert.ok(!/api[_-]?key|x-api-key|Bearer |Sentetik/i.test(JSON.stringify(f)), g.name);
    }
    // Tekniklerin birimleri golden gövdesini AYNEN üretir (sorgu dahil).
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null };
    const acg = getTechnique("western.astrocartography")!.units(ctx, {})[0];
    assert.deepEqual(JSON.parse(JSON.stringify(acg.body)), G4.astrocartography.body);
    assert.deepEqual(acg.query, G4.astrocartography.query);
    const rel = getTechnique("western.relocation")!.units({ ...ctx, places: { target: RELOCATION_TARGET } }, { targetLocationId: "us-ny-new-york", houseSystem: "placidus" });
    assert.deepEqual(JSON.parse(JSON.stringify(rel[0].body)), G4.relocation.body);
    assert.equal(rel[1].technique, "western.natal", "relocation karşılaştırma birimi natal olmalı");
    const ls = getTechnique("western.local_space")!.units(ctx, { referenceLocationId: null })[0];
    assert.deepEqual(JSON.parse(JSON.stringify(ls.body)), G4["local-space"].body);
  });

  await t("golden: 3 endpoint → projeksiyon ok; bilinmeyen 0, düşürülen 0; sayımlar kayıpsız; teknikte anlatı yok", () => {
    const a = projectRoxyAstrocartography(G4.astrocartography.response) as J;
    const r = projectRoxyRelocation(G4.relocation.response, { houseSystem: "placidus", target: RELOCATION_TARGET }) as J;
    const l = projectRoxyLocalSpace(G4["local-space"].response, { reference: { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude } }) as J;
    for (const [n, x] of [["acg", a], ["rel", r], ["ls", l]] as const) {
      assert.ok(x.ok, `${n}: ${JSON.stringify(x.errors)}`);
      assert.deepEqual([x.unmappedFields, x.droppedValues], [[], []], n);
    }
    const ra = G4.astrocartography.response;
    assert.equal(a.technical.bodies.length, ra.lines.length);
    for (const b of ra.lines) {
      const tb = a.technical.bodies.find((x: J) => x.rightAscension === b.rightAscension);
      assert.equal(tb.asc.points.length, b.ascendant.points.length);
      assert.equal(tb.dsc.points.length, b.descendant.points.length);
    }
    assert.equal(a.interpretation.lines.length, ra.lines.length * 4);
    assert.equal(r.technical.bodies.length, G4.relocation.response.planets.length);
    assert.equal(r.technical.houses.length, 12);
    assert.equal(r.technical.changes.planetsChangedHouse.length, G4.relocation.response.changes.planetsChangedHouse.length);
    assert.equal(l.technical.bodies.length, G4["local-space"].response.bodies.length);
    for (const b of G4["local-space"].response.bodies) assert.equal(l.technical.bodies.find((x: J) => x.azimuth === b.azimuth).line.length, b.line.points.length);
    for (const [n, x, raw] of [["acg", a, G4.astrocartography.response], ["rel", r, G4.relocation.response], ["ls", l, G4["local-space"].response]] as const) {
      assert.deepEqual(leaks(JSON.stringify(x.technical), narratives(raw)), [], `${n}: teknikte anlatı`);
      assert.ok(leaks(JSON.stringify(x.interpretation), narratives(raw)).length > 0, `${n}: yorum katmanı boş`);
    }
  });

  await t("fail-closed: bilinmeyen yeni sağlayıcı alanı teknik SAYILMAZ; yalnız YOLU raporlanır (değer yok)", () => {
    const SECRET = "GIZLI-YENI-ALAN-DEGERI-asla-teknik-olmamali";
    const acgRaw = structuredClone(G4.astrocartography.response);
    acgRaw.lines[0].newNarrative = SECRET;
    acgRaw.lines[0].mc.extraHint = SECRET;
    const relRaw = structuredClone(G4.relocation.response);
    relRaw.planets[0].karma = SECRET;
    const lsRaw = structuredClone(G4["local-space"].response);
    lsRaw.bodies[0].line.bearingText = SECRET;
    const a = projectRoxyAstrocartography(acgRaw) as J;
    const r = projectRoxyRelocation(relRaw, { houseSystem: "placidus", target: RELOCATION_TARGET }) as J;
    const l = projectRoxyLocalSpace(lsRaw, { reference: { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude } }) as J;
    assert.deepEqual(a.unmappedFields.sort(), ["lines[].mc.extraHint", "lines[].newNarrative"]);
    assert.deepEqual(r.unmappedFields, ["planets[].karma"]);
    assert.deepEqual(l.unmappedFields, ["bodies[].line.bearingText"]);
    for (const x of [a, r, l]) assert.ok(!JSON.stringify(x).includes(SECRET), "bilinmeyen alanın DEĞERİ yansıdı");
  });

  // ═══ B) YORUM A/B + HAM YANIT ═════════════════════════════════════════════════
  await t("yorum: 3 teknik × (açık / yetkisiz / önizleme) — kapalıyken anlatı yanıtta YOK; ham alan/anahtar hiçbir durumda YOK", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const sels = [SEL.acg, SEL.rel(), SEL.ls()];
    const vis = await run(ctx, pa, sels, rx.deps);
    assert.equal(vis.status, 200, JSON.stringify(vis.body).slice(0, 300));
    const hid = await run(ctxOf(store, { entitlements: NO_INTERP }), pa, sels, rx.deps);
    const pre = await run(ctx, pa, sels, rx.deps, {}, true);
    for (const tech of LOC_TECHS) {
      const narr = narratives(G4[FIX[tech]].response);
      const pick = (r: J) => r.body.results.find((x: J) => x.technique === tech);
      assert.ok(pick(vis).ok && pick(hid).ok && pick(pre).ok, tech);
      assert.ok(leaks(JSON.stringify(pick(vis).view.interpretation), narr).length > 0, `${tech}: yetkili yorumu görmeli`);
      assert.deepEqual(leaks(JSON.stringify(pick(vis).view.technical), narr), [], `${tech}: teknikte anlatı`);
      assert.deepEqual(leaks(JSON.stringify(pick(hid)), narr), [], `${tech}: yetkisizde anlatı`);
      assert.deepEqual(leaks(JSON.stringify(pick(pre)), narr), [], `${tech}: önizlemede anlatı`);
      assert.deepEqual(pick(hid).view.interpretation, { visible: false, reason: "not_entitled" });
    }
    // Relocation yorumu YALNIZ relocation biriminden (natal karşılaştırma biriminin yorumu değil).
    const relInterp = vis.body as J;
    assert.equal(relInterp.results.find((x: J) => x.technique === "western.relocation").view.interpretation.content.schema, "astro.western.relocation.interp.v1");
    for (const r of [vis, hid, pre]) for (const m of RAW_MARKERS) assert.ok(!JSON.stringify(r.body).includes(m), `ham/anahtar izi: ${m}`);
  });

  // ═══ C) ÖNBELLEK + PLAN + KONUM ═══════════════════════════════════════════════
  await t("cache: aynı seçim 0 istek; relocation NY vs Berlin ve local space doğum yeri vs Londra AYRI anahtar; natal karşılaştırma birimi tekilleşir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const p0 = (await planAstrology(ctx, { profileId: pa, selections: [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }, SEL.acg, SEL.rel(), SEL.ls()] })).body as J;
    // natal + acg + relocation(+natal karşılaştırma → natal ile AYNI anahtar) + ls = 4 benzersiz istek.
    assert.deepEqual([p0.plan.selectedCount, p0.plan.newRequestCount, p0.plan.dedupedCount], [4, 4, 1]);
    await run(ctx, pa, [SEL.acg, SEL.rel(), SEL.ls()], rx.deps);
    assert.equal(rx.calls.length, 4, "acg + relocation + natal(karşılaştırma) + ls");
    await run(ctx, pa, [SEL.acg, SEL.rel(), SEL.ls()], rx.deps);
    assert.equal(rx.calls.length, 4, "tekrar 0 istek");
    const p = (await planAstrology(ctx, { profileId: pa, selections: [SEL.rel("de-berlin"), SEL.ls("gb-london"), SEL.rel(), SEL.ls()] })).body as J;
    assert.deepEqual(p.plan.selections.map((s: J) => s.newRequests), [1, 1, 0, 0], "farklı konum yeni istek; aynı konum kayıtlı");
    await run(ctx, pa, [SEL.rel("de-berlin"), SEL.ls("gb-london")], rx.deps);
    const bodies = rx.calls.slice(4).map((c) => c.body);
    assert.equal(bodies.find((b) => "relocationLatitude" in b)!.relocationLatitude, Math.round(BERLIN.lat * 1e6) / 1e6);
    assert.equal(bodies.find((b) => "latitude" in b && !("relocationLatitude" in b))!.latitude, Math.round(LONDON.lat * 1e6) / 1e6);
    // ACG sorgusu anahtara girer (sorgusuz aynı gövde ≠ aynı anahtar); sorgusuz eski anahtarlar değişmedi.
    const id = { provider: "roxy", providerApiVersion: "v", adapterVersion: "a", endpoint: "/x", lang: "tr", body: { a: 1 } };
    assert.notEqual(calcInputHash(id), calcInputHash({ ...id, query: { include: "chiron" } }));
    assert.equal(calcInputHash(id), calcInputHash({ ...id, query: {} }));
  });

  await t("konum güvenliği: hedef SUNUCUDA çözülür (istemcinin koordinatı yok sayılır); bilinmeyen konum → LOCATION_NOT_FOUND 0 istek; hedef tz hesaba girmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const spoof = { technique: "western.relocation", options: { targetLocationId: "us-ny-new-york", houseSystem: "placidus", target: { latitude: 1, longitude: 2 }, relocationLatitude: 1 } };
    const r = await run(ctx, pa, [spoof, SEL.rel("xx-yok-boyle-bir-yer"), SEL.ls("xx-yok")], rx.deps);
    const res = (r.body as J).results;
    assert.equal(res[0].ok, true);
    assert.equal(rx.calls.find((c) => c.endpoint === "/astrology/relocation-chart")!.body.relocationLatitude, RELOCATION_TARGET.latitude, "istemci koordinatı kullanıldı");
    assert.deepEqual([res[1].code, res[2].code], ["LOCATION_NOT_FOUND", "LOCATION_NOT_FOUND"]);
    assert.equal(rx.calls.filter((c) => c.endpoint !== "/astrology/natal-chart").length, 1);
    // Gövdede doğum ofseti (3), hedefin (New York) saat dilimi YOK.
    const body = rx.calls.find((c) => c.endpoint === "/astrology/relocation-chart")!.body;
    assert.equal(body.timezone, 3);
    assert.ok(!JSON.stringify(body).includes("America/New_York"));
    assert.equal(res[0].view.options.target.timezone, "America/New_York", "hedef tz yalnız gösterim için normalize seçenekte");
    assert.equal((await planAstrology(ctx, { profileId: pa, selections: [{ technique: "western.relocation", options: { houseSystem: "placidus" } }] })).status, 400);
  });

  await t("saat bilinmiyor: 3 teknik de TIME_REQUIRED (0 istek); saat-bağımlı veri uydurulmaz; görünüm maskesi teknik veriyi tamamen saklar", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const rx = roxy();
    const r = await run(ctx, pu, [SEL.acg, SEL.rel(), SEL.ls()], rx.deps);
    assert.equal(rx.calls.length, 0);
    assert.deepEqual((r.body as J).results.map((x: J) => x.code), ["TIME_REQUIRED", "TIME_REQUIRED", "TIME_REQUIRED"]);
    // Neden tekniğe özgü (return'e özgü "dönüş anı" ifadesi konum tekniklerinde YOK).
    const errs = (r.body as J).results.map((x: J) => String(x.error));
    assert.ok(errs.every((e: string) => !e.includes("dönüş")), errs.join(" | "));
    assert.ok(errs[0].includes("boylam") && errs[1].includes("Yükselen") && errs[2].includes("azimut"));
    for (const tech of LOC_TECHS) {
      const m = maskTechnical(tech, { schema: "x", bodies: [1] }, { primary: false, partner: null });
      assert.equal(m.technical, null, tech);
      assert.ok(m.masked && m.warnings.length === 1);
    }
  });

  // ═══ D) RELOCATION MODELİ ═════════════════════════════════════════════════════
  await t("relocation: aynı doğum anı → 14 gök cismi boylamı natal ile AYNI; ASC/MC/evler değişir; natal karşılaştırma birleştirilir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const v = ((await run(ctx, pa, [SEL.rel()], rx.deps)).body as J).results[0].view;
    const tech = v.technical as RelocationTechnical;
    for (const p of NATAL_GOLDEN.planets) {
      const id = tech.bodies.find((b) => Math.abs(b.longitude - p.longitude) < 1e-9);
      assert.ok(id, `${p.name}: relocated boylam natal ile aynı değil`);
    }
    assert.ok(tech.natal && tech.natal.angles, "natal karşılaştırma yok");
    assert.ok(angDiff(tech.angles.ascendant.longitude, tech.natal!.angles!.ascendant.longitude) > 30, "ASC değişmeli");
    assert.ok(angDiff(tech.angles.midheaven.longitude, tech.natal!.angles!.midheaven.longitude) > 30, "MC değişmeli");
    assert.notDeepEqual(tech.houses.map((h) => h.sign), tech.natal!.houses.map((h) => h.sign));
    for (const c of tech.changes.planetsChangedHouse) assert.equal(tech.natal!.bodyHouses.find((b) => b.id === c.id)?.house, c.natalHouse, `${c.id}: sağlayıcının natal evi ≠ natal haritanın evi`);
    assert.equal(v.resultIds.length, 2);
    assert.equal(v.missingParts, 0);
  });

  await t("relocation kısmi: natal karşılaştırma birimi hata → sonuç yine OK (natal=null, uyarı); relocation birimi hata → seçim BAŞARISIZ", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const a = roxy({ failWhen: (c) => c.endpoint === "/astrology/natal-chart" });
    const r1 = ((await run(ctx, pa, [SEL.rel()], a.deps)).body as J).results[0];
    assert.equal(r1.ok, true);
    assert.equal(r1.view.technical.natal, null);
    assert.equal(r1.view.missingParts, 1);
    const store2 = seed();
    const ctx2 = ctxOf(store2);
    const pb = await profile(ctx2);
    const b = roxy({ failWhen: (c) => c.endpoint === "/astrology/relocation-chart" });
    const r2 = (await run(ctx2, pb, [SEL.rel()], b.deps)).body as J;
    assert.equal(r2.results[0].ok, false);
    assert.equal(r2.results[0].code, "PROVIDER_UNAVAILABLE");
    // Sağlayıcı başka hedefi hesaplarsa (yankı uyuşmazlığı) sonuç kaydedilmez.
    const store3 = seed();
    const ctx3 = ctxOf(store3);
    const pc = await profile(ctx3);
    const c = roxy({ noEcho: true });
    const r3 = (await run(ctx3, pc, [SEL.rel("de-berlin")], c.deps)).body as J;
    assert.equal(r3.results[0].code, "PROVIDER_INVALID_RESPONSE");
    assert.ok(!(store3.tables.astro_provider_results ?? []).some((x) => x.technique === "western.relocation"));
  });

  // ═══ E) BAĞIMSIZ ASTRONOMİ ════════════════════════════════════════════════════
  await t("astronomi: relocated ASC/MC (New York, aynı an) astronomy-engine formülüyle ≤ 0.01°", () => {
    const tech = relTech();
    const tm = Astronomy.MakeTime(BIRTH);
    const r = Math.PI / 180;
    const lst = (Astronomy.SiderealTime(tm) * 15 + RELOCATION_TARGET.longitude + 360) % 360;
    const eps = 23.4393 - 0.0000004 * tm.tt;
    const mc = (Math.atan2(Math.sin(lst * r), Math.cos(lst * r) * Math.cos(eps * r)) / r + 360) % 360;
    const asc = (Math.atan2(Math.cos(lst * r), -(Math.sin(lst * r) * Math.cos(eps * r) + Math.tan(RELOCATION_TARGET.latitude * r) * Math.sin(eps * r))) / r + 360) % 360;
    assert.ok(angDiff(tech.angles.midheaven.longitude, mc) < 0.01, `MC ${tech.angles.midheaven.longitude} vs ${mc}`);
    assert.ok(angDiff(tech.angles.ascendant.longitude, asc) < 0.01, `ASC ${tech.angles.ascendant.longitude} vs ${asc}`);
    console.log(`     relocated ASC fark ${(angDiff(tech.angles.ascendant.longitude, asc) * 3600).toFixed(1)}″ · MC fark ${(angDiff(tech.angles.midheaven.longitude, mc) * 3600).toFixed(1)}″`);
  });

  await t("astronomi: ACG RA/Dec (10 gezegen) ≤ 0.01°; MC = RA − GMST, IC = MC+180 ≤ 0.02°; AC/DC eğri noktaları (H₀ = arccos(−tanφ·tanδ), geometrik ufuk) ≤ 0.01°", () => {
    const tech = acgTech();
    const tm = Astronomy.MakeTime(BIRTH);
    const gmst = Astronomy.SiderealTime(tm) * 15;
    const r = Math.PI / 180;
    let maxRa = 0;
    let maxMc = 0;
    let maxCurve = 0;
    for (const [id, body] of AE_BODIES) {
      const b = tech.bodies.find((x) => x.id === id)!;
      const eq = geoEquator(body, tm);
      maxRa = Math.max(maxRa, angDiff(b.rightAscension, eq.ra * 15), Math.abs(b.declination - eq.dec));
      const mcLon = ((b.rightAscension - gmst + 540) % 360) - 180;
      maxMc = Math.max(maxMc, angDiff(b.mcLongitude, mcLon), angDiff(b.icLongitude, mcLon + 180));
      for (const [curve, sign] of [[b.asc, -1], [b.dsc, 1]] as const) {
        for (const [lat, lon] of curve.points) {
          const cosH = -Math.tan(lat * r) * Math.tan(b.declination * r);
          if (Math.abs(cosH) > 1) continue;
          const h0 = Math.acos(cosH) / r;
          maxCurve = Math.max(maxCurve, angDiff(lon, b.rightAscension - gmst + sign * h0));
        }
        // Kutup sınırı: |φ| > arctan(1/|tanδ|) → doğuş yok; sağlayıcı sınırı ile tutarlı.
        if (curve.circumpolarBeyond !== null) assert.ok(Math.abs(curve.circumpolarBeyond - Math.atan(1 / Math.abs(Math.tan(b.declination * r))) / r) < 0.05, `${id} kutup sınırı`);
      }
    }
    assert.ok(maxRa <= 0.01, `RA/Dec ${maxRa}`);
    assert.ok(maxMc <= 0.02, `MC/IC ${maxMc}`);
    assert.ok(maxCurve <= 0.01, `AC/DC ${maxCurve}`);
    console.log(`     ACG max fark: RA/Dec ${(maxRa * 3600).toFixed(1)}″ · MC/IC ${(maxMc * 3600).toFixed(1)}″ · AC/DC eğri ${maxCurve.toFixed(3)}°`);
  });

  await t("astronomi: ACG Ay Düğümü hattı = GERÇEK (true) düğüm — sağlayıcı belgesi 'ortalama' dese de gerçek yanıt true (yankı nodeType=true)", () => {
    const tech = acgTech();
    const tm = Astronomy.MakeTime(BIRTH);
    const T = tm.tt / 36525;
    const r = Math.PI / 180;
    const eps = 23.4393 - 0.0000004 * tm.tt;
    const raOf = (lam: number) => (Math.atan2(Math.sin(lam * r) * Math.cos(eps * r), Math.cos(lam * r)) / r + 360) % 360;
    const meanNode = (((125.0445479 - 1934.1362891 * T + 0.0020754 * T * T) % 360) + 360) % 360;
    const trueNode = NATAL_GOLDEN.planets.find((p: J) => p.name === "North Node").longitude;
    const nn = tech.bodies.find((b) => b.id === "north_node")!;
    const dMean = angDiff(nn.rightAscension, raOf(meanNode));
    const dTrue = angDiff(nn.rightAscension, raOf(trueNode));
    assert.ok(dTrue < 0.01 && dMean > 0.5, `gerçek ${dTrue} / ortalama ${dMean}`);
    assert.equal(tech.nodeEcho, "true");
    console.log(`     düğüm RA farkı: ortalama ${dMean.toFixed(4)}° · gerçek ${dTrue.toFixed(3)}°`);
  });

  await t("astronomi: local space azimut/yükseklik (astronomy-engine Horizon, doğum yeri) ≤ 0.05°; hat ilk kerterizi = azimut; ilk nokta = referans", () => {
    const tech = lsTech();
    const tm = Astronomy.MakeTime(BIRTH);
    const obs = new Astronomy.Observer(SYNTH_A.latitude, SYNTH_A.longitude, 0);
    let maxAz = 0;
    let maxAlt = 0;
    let maxBear = 0;
    for (const [id, body] of AE_BODIES) {
      const b = tech.bodies.find((x) => x.id === id)!;
      const eq = geoEquator(body, tm);
      const hor = Astronomy.Horizon(tm, obs, eq.ra, eq.dec);
      maxAz = Math.max(maxAz, angDiff(b.azimuth, hor.azimuth));
      maxAlt = Math.max(maxAlt, Math.abs(b.altitude - hor.altitude));
      assert.equal(b.aboveHorizon, b.altitude > 0);
      const [[lat0, lon0], [lat1, lon1]] = b.line;
      assert.ok(Math.abs(lat0 - SYNTH_A.latitude) < 1e-3 && Math.abs(lon0 - SYNTH_A.longitude) < 1e-3, `${id}: ilk nokta referans değil`);
      maxBear = Math.max(maxBear, angDiff(initialBearing(lat0, lon0, lat1, lon1), b.azimuth));
    }
    assert.ok(maxAz <= 0.05 && maxAlt <= 0.05, `azimut ${maxAz} / yükseklik ${maxAlt}`);
    assert.ok(maxBear <= 0.1, `kerteriz ${maxBear}`);
    console.log(`     local space max fark: azimut ${(maxAz * 3600).toFixed(1)}″ · yükseklik ${(maxAlt * 3600).toFixed(1)}″ · kerteriz ${maxBear.toFixed(4)}°`);
  });

  // ═══ F) HARİTA VERİ DÖNÜŞÜMÜ ═══════════════════════════════════════════════════
  await t("harita: ACG filtre (gezegen × açı) hat sayısı; MC dikey; AC eğrisi antimeridyende bölünür; local space kesikli = ufuk altı; pusula K yukarı D sağ", () => {
    const tech = acgTech();
    const all = new Set(tech.bodies.map((b) => b.id));
    const A4 = new Set<AcgAngle>(["mc", "ic", "asc", "dsc"]);
    assert.equal(acgMapLines(tech, all, A4).length, 13 * 4);
    assert.equal(acgMapLines(tech, new Set<BodyId>(["venus"]), new Set<AcgAngle>(["mc"])).length, 1);
    assert.equal(acgMapLines(tech, new Set(), A4).length, 0);
    const mc = acgMapLines(tech, new Set<BodyId>(["sun"]), new Set<AcgAngle>(["mc"]))[0];
    const xs = [...mc.d.matchAll(/[ML]([\d.]+),/g)].map((m) => m[1]);
    assert.equal(new Set(xs).size, 1, "MC hattı dikey değil");
    assert.deepEqual(project(0, 0), [MAP_W / 2, MAP_H / 2]);
    const segs = splitAtAntimeridian([[10, 170], [20, 179], [30, -179], [40, -170]]);
    assert.equal(segs.length, 2, "antimeridyen bölünmedi");
    const ls = lsTech();
    const lines = localSpaceMapLines(ls, new Set(ls.bodies.map((b) => b.id)));
    for (const b of ls.bodies) assert.equal(lines.find((l) => l.key === `ls:${b.id}`)!.dash === undefined, b.aboveHorizon);
    assert.deepEqual(compassPoint(100, 100, 50, 0), [100, 50]);
    assert.deepEqual(compassPoint(100, 100, 50, 90), [150, 100]);
    assert.deepEqual(compassPoint(100, 100, 50, 180), [100, 150]);
    // Teknik tooltip anlatı içermez.
    assert.deepEqual(leaks(JSON.stringify(acgMapLines(tech, all, A4)), narratives(G4.astrocartography.response)), []);
  });

  await t("harita verisi: Natural Earth 110m — kara halkaları/sınırlar geçerli koordinat; yol üretimi sahte yatay çizgi yapmaz", () => {
    assert.ok(WORLD_LAND_RINGS.length > 100 && WORLD_BORDER_LINES.length > 100);
    for (const ring of [...WORLD_LAND_RINGS, ...WORLD_BORDER_LINES]) {
      assert.equal(ring.length % 2, 0);
      for (let i = 0; i < ring.length; i += 2) assert.ok(Math.abs(ring[i]) <= 18000 && Math.abs(ring[i + 1]) <= 9000);
    }
    for (const ring of WORLD_LAND_RINGS) {
      const d = packedToPath(ring, true);
      for (const seg of d.split("M").filter(Boolean)) {
        const pts = seg.replace("Z", "").split("L").map((p) => Number(p.split(",")[0]));
        for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i] - pts[i - 1]) < MAP_W / 2, "antimeridyen sahte çizgisi");
      }
    }
  });

  // ═══ G) BİLGİ BANKASI + NOTLAR + KAYDET ════════════════════════════════════════
  await t("konu bağlamı: ACG/relocation/local space konuları kendi bağlamında; natal'e yazılamaz; DB CHECK biçimine uyar", () => {
    const sets = { "western.astrocartography": topicsForTechnique("western.astrocartography", acgTech()), "western.relocation": topicsForTechnique("western.relocation", relTech()), "western.local_space": topicsForTechnique("western.local_space", lsTech()) };
    assert.equal(sets["western.astrocartography"].length, 13 * 4);
    assert.ok(sets["western.astrocartography"].some((x) => x.key === "astrocartography_line:venus:asc"));
    assert.ok(sets["western.relocation"].some((x) => x.key === "relocated_angular:mars:" + x.key.split(":")[2]), "açısal Mars konusu yok");
    assert.ok(sets["western.relocation"].some((x) => x.key.startsWith("relocated_angle_in_sign:ascendant:leo")));
    assert.ok(sets["western.local_space"].some((x) => x.key === "local_space_direction:sun:sw"));
    for (const [tech, list] of Object.entries(sets)) {
      for (const x of list) {
        assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/.test(x.key), x.key);
        assert.ok(parseAnyTopicKey("western", x.key), x.key);
        assert.ok(isSectionKeyForTechnique(tech, x.key));
        assert.ok(!isSectionKeyForTechnique("western.natal", x.key), `${x.key} natal'e yazılabiliyor`);
        assert.ok(!isSectionKeyForTechnique("western.transit", x.key));
      }
    }
    assert.ok(!isSectionKeyForTechnique("western.relocation", "planet_in_house:saturn:6"), "natal konusu relocation notuna yazılabiliyor");
  });

  await t("çalışma alanı + notlar: relocation KB natal'e karışmaz; NY notu Berlin'e karışmaz (konum bağlamı sunucuda türetilir)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }, SEL.rel(), SEL.rel("de-berlin"), SEL.acg, SEL.ls()], rx.deps);
    const ws = async (sel: J) => (await getWorkspace(ctx, { profileId: pa, revision: 1, ...sel })).body as J;
    const ny = await ws(SEL.rel());
    assert.equal(ny.ok, true, JSON.stringify(ny));
    assert.equal(ny.contextKey, locationContextKey("western.relocation", "us-ny-new-york"));
    assert.equal(ny.contextLocationId, "us-ny-new-york");
    const relKey = ny.topics.find((x: J) => x.key.startsWith("relocated_in_house:"))!.key;
    await createKb(ctx, { tradition: "western", topicKey: relKey, title: "Relocation ev notum", body: "relocation KB" });
    await createKb(ctx, { tradition: "western", topicKey: "astrocartography_line:venus:asc", title: "Venüs AC", body: "acg KB" });
    assert.deepEqual((await ws(SEL.rel())).kbMatches.map((e: J) => e.topicKey), [relKey]);
    assert.equal((await ws({ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } })).kbMatches.length, 0, "relocation/ACG KB natal'e karıştı");
    assert.deepEqual((await ws(SEL.acg)).kbMatches.map((e: J) => e.topicKey), ["astrocartography_line:venus:asc"]);
    const note = (o: J, status = 201) =>
      saveExpertNote(ctx, { profileId: pa, expectedRevision: null, sectionKey: "overall", ...o }).then((r) => {
        assert.equal(r.status, status, JSON.stringify(r.body));
      });
    await note({ technique: "western.relocation", contextLocationId: "us-ny-new-york", body: "NY notum" });
    await note({ technique: "western.relocation", contextLocationId: "de-berlin", body: "Berlin notum" });
    await note({ technique: "western.relocation", body: "hedefsiz" }, 400);
    await note({ technique: "western.relocation", contextLocationId: "xx-yok", body: "x" }, 404);
    await note({ technique: "western.relocation", contextLocationId: "us-ny-new-york", contextKey: randomUUID(), body: "sahte bağlam" }, 400);
    await note({ technique: "western.local_space", body: "doğum yeri LS notu" });
    await note({ technique: "western.astrocartography", body: "ACG notu" });
    assert.deepEqual((await ws(SEL.rel())).notes.map((n: J) => n.body), ["NY notum"]);
    assert.deepEqual((await ws(SEL.rel("de-berlin"))).notes.map((n: J) => n.body), ["Berlin notum"]);
    assert.deepEqual((await ws(SEL.ls())).notes.map((n: J) => n.body), ["doğum yeri LS notu"]);
  });

  await t("Analizi Kaydet: 3 teknik → snapshot konum (etiket/enlem/boylam/tz) + teknik + sürüm; aç = 0 istek, 0 sonuç tablosu okuması; yetkisizde anlatı yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [SEL.acg, SEL.rel(), SEL.ls("gb-london")], rx.deps);
    const n = rx.calls.length;
    const ids: Record<string, string> = {};
    for (const s of [SEL.acg, SEL.rel(), SEL.ls("gb-london")]) {
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...s, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, `${s.technique}: ${JSON.stringify(sv.body)}`);
      ids[s.technique] = (sv.body as J).analysisId;
    }
    const before = store.log.length;
    const rel = ((await getAnalysis(ctx, ids["western.relocation"], false)).body as J).analysis;
    assert.equal(rel.params.target.label.includes("New York"), true);
    assert.deepEqual([rel.params.target.latitude, rel.params.target.longitude, rel.params.target.timezone], [RELOCATION_TARGET.latitude, RELOCATION_TARGET.longitude, "America/New_York"]);
    assert.ok(rel.title.includes("→"));
    assert.equal(rel.technical.natal.angles.ascendant.sign.length > 0, true);
    assert.equal(rel.versions.adapterVersion, "astro-roxy-relocation-1");
    const ls = ((await getAnalysis(ctx, ids["western.local_space"], false)).body as J).analysis;
    assert.equal(ls.params.reference.locationId, "gb-london");
    assert.equal(ls.technical.reference.latitude, Math.round(LONDON.lat * 1e6) / 1e6);
    const acg = ((await getAnalysis(ctx, ids["western.astrocartography"], false)).body as J).analysis;
    assert.equal(acg.technical.bodies.length, 13);
    assert.ok(acg.topics.length === 52);
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.ok(!store.log.slice(before).some((l) => l.table === "astro_provider_results" || l.table === "astro_provider_interpretations"));
    for (const tech of LOC_TECHS) {
      const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), ids[tech], false)).body as J).analysis;
      assert.deepEqual(leaks(JSON.stringify(hidden), narratives(G4[FIX[tech]].response)), [], `${tech}: kayıtlı analizde yetkisiz anlatı`);
      const shown = ((await getAnalysis(ctx, ids[tech], false)).body as J).analysis;
      assert.ok(leaks(JSON.stringify(shown.interpretation), narratives(G4[FIX[tech]].response)).length > 0, `${tech}: dahil edilen yorum görünmeli`);
    }
    const list = ((await listAnalyses(ctx, pa)).body as J).analyses;
    assert.equal(list.length, 3);
  });

  // ═══ H) GÜVENLİK ═══════════════════════════════════════════════════════════════
  await t("tenant izolasyonu: başka tenant konum sonucu/analizini açamaz; aynı konum seçimi başka tenant'ta ayrı satır (paylaşılmaz)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SEL.rel()], rx.deps)).body as J;
    const ctxB = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    assert.equal((await getAstrologyResult(ctxB, r.results[0].view.id, { profileId: null, revision: null, ownerPreviewHideInterp: false })).status, 404);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.rel(), saveRequestId: randomUUID() }, false);
    assert.equal((await getAnalysis(ctxB, (sv.body as J).analysisId, false)).status, 404);
    assert.equal((await getWorkspace(ctxB, { profileId: pa, revision: 1, ...SEL.rel() })).status, 404);
    assert.equal((await runAstrology(ctxB, { profileId: pa, selections: [SEL.rel()] }, rx.deps, { ownerPreviewHideInterp: false })).status, 404);
    // Profil sahipliği DOĞRUDAN: başka tenant, A'nın profiline konum notu YAZAMAZ (yalnız profil kontrolü olan yol).
    const nb = await saveExpertNote(ctxB, { profileId: pa, technique: "western.relocation", contextLocationId: "us-ny-new-york", sectionKey: "overall", body: "yabancı not", expectedRevision: null });
    assert.equal(nb.status, 404, JSON.stringify(nb.body));
    assert.ok(!(store.tables.astro_expert_notes ?? []).some((n) => n.body === "yabancı not"), "başka tenant notu yazıldı");
  });

  await t("log PII: hata loglarında doğum/hedef koordinatı, tarih, ad, anahtar YOK", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy({ mutate: (_e, r) => ((r.extraUnknown = "x"), undefined), failWhen: (c) => c.endpoint === "/astrology/local-space" });
    await run(ctx, pa, [SEL.acg, SEL.rel(), SEL.ls()], rx.deps);
    const all = rx.logs.join("\n");
    assert.ok(all.length > 0, "log üretilmedi (test zayıf)");
    for (const bad of ["40.7128", "-74.006", "41.0082", "28.9784", "1990-07-15", "Sentetik", "k-test-4", "New York"]) assert.ok(!all.includes(bad), `log sızıntısı: ${bad}`);
  });

  console.log(`\nastrology phase4 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase4 harness çöktü:", e);
  process.exit(1);
});
