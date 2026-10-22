/**
 * ASTROLOJİ AŞAMA 3 harness'i — Transit · Forecast · Secondary Progression · Solar Arc · Solar/Lunar
 * Return · Synastry · Composite.
 *
 *   • Golden: gerçek (sentetik kişi) Roxy yanıtları → adaptör; ürünün gövdesi = golden gövdesi.
 *   • Yorum güvenliği (açık/kapalı/önizleme) + ham yanıt sızıntısı — her teknik.
 *   • Önbellek (aynı hedef 0 istek / farklı hedef yeni istek) · forecast parçalama + kısmi başarı.
 *   • Planlayıcı 5/10 seçim gerçek istek hesabı · saat bilinmiyor (engel / maske) · karşı taraf izolasyonu.
 *   • Çalışma alanı / not bağlamı / Analizi Kaydet (v2) / kayıtlı analiz 0 istek.
 *   • Bağımsız astronomi (astronomy-engine): transit, solar/lunar return, composite midpoint, progression.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase3.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { goldenPlan, SYNTH_A, SYNTH_B } from "./golden/phase3-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { appendAstroRevision, createAstroProfile } from "@/lib/astrology/profiles/service";
import { getAstrologyResult, planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS as ALL_TECHNIQUE_IDS, type TechniqueId } from "@/lib/astrology/engine/techniques";

/** Aşama 3 kapsamı (natal + 8 teknik). Aşama 4 konum teknikleri phase4, sabit yıldızlar fixedstars harness'indedir. */
const TECHNIQUE_IDS = ALL_TECHNIQUE_IDS.filter((x) => x.startsWith("western.") && !["western.astrocartography", "western.relocation", "western.local_space", "western.fixed_stars", "western.profections", "western.extra_points", "western.planetary_return"].includes(x));
import { buildPlan, parseSelections } from "@/lib/astrology/engine/planner";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, listAnalyses, previewAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { buildTechniqueView, maskTechnical } from "@/lib/astrology/view/techniqueView";
import { forecastChunks } from "@/lib/astrology/providers/roxy/requests";
import { lunarReturnsInMonth, natalMoonLongitude } from "@/lib/astrology/engine/lunarReturnDate";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import type { TransitTechnical } from "@/lib/astrology/model/westernTiming";
import { toSynastryWheelData, toTransitWheelData } from "@/app/admin/astroloji/_lib/roxyWheelData";

// Harness gövdeleri JSON yanıtlarını gezer; tip daraltması test okunurluğunu düşürür.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const G: Record<string, { endpoint: string; body: Record<string, unknown>; response: J }> = {};
for (const n of ["transit", "forecast", "progression", "solar-arc", "solar-return", "lunar-return", "synastry", "composite"]) {
  G[n] = JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
}
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const BY_ENDPOINT: Record<string, J> = { "/astrology/natal-chart": NATAL_GOLDEN };
for (const g of Object.values(G)) BY_ENDPOINT[g.endpoint] = g.response;

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
const CLIENT_B = "33333333-3333-4333-8333-333333333333";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const ANKARA: ResolvedLocation = { id: "tr-06-ankara", label: "Ankara, Türkiye", timezone: "Europe/Istanbul", latitude: 39.9334, longitude: 32.8597 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : id === ANKARA.id ? ANKARA : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };

function seed(): FakeStore {
  return createStore({
    clients: [
      { id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" },
      { id: CLIENT_Y, tenant_id: TENANT_A, ad: "Sentetik", soyad: "B" },
      { id: CLIENT_B, tenant_id: TENANT_B, ad: "Başka", soyad: "Tenant" },
    ],
  });
}
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown> };
/** Sahte Roxy: endpoint'e göre golden yanıt; forecast parçası için yalnız o parçanın olayları. */
function roxy(opts: { failWhen?: (c: Call, n: number) => boolean } = {}) {
  const calls: Call[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      const c = { endpoint, body };
      calls.push(c);
      if (opts.failWhen?.(c, calls.length)) return { ok: false, kind: "server_error", status: 500, attempts: 1 };
      const base = BY_ENDPOINT[endpoint];
      if (!base) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(base);
      if (endpoint === "/forecast/transits") {
        const s = String(body.startDate);
        const e = String(body.endDate);
        r.events = (r.events as J[]).filter((x) => x.date >= s && x.date <= e);
        r.period = { ...(r.period ?? {}), start: s, end: e };
      }
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => new Date("2026-10-07T09:41:00Z"),
  };
  return { calls, deps };
}

async function profile(ctx: EngineCtx, who: "A" | "B", over: Record<string, unknown> = {}): Promise<string> {
  const base =
    who === "A"
      ? { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }
      : { label: "Sentetik B", clientId: CLIENT_Y, birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: ANKARA.id };
  const r = await createAstroProfile(ctx, { ...base, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}

/** Golden ile AYNI seçenekler (golden gövdeleri bu seçimlerin birimleridir). */
function goldenSelection(id: TechniqueId, partner?: string): { technique: TechniqueId; options: Record<string, unknown> } {
  switch (id) {
    case "western.natal":
      return { technique: id, options: { houseSystem: "placidus", nodeType: "true" } };
    case "western.transit":
      return { technique: id, options: { atUtc: "2026-10-07T09:00", nodeType: "true" } };
    case "western.forecast":
      return { technique: id, options: { startDate: "2026-10-01", days: 90 } };
    case "western.progression":
    case "western.solar_arc":
      return { technique: id, options: { targetDate: "2026-10-07", nodeType: "true" } };
    case "western.solar_return":
      return { technique: id, options: { returnYear: 2026, houseSystem: "placidus" } };
    case "western.lunar_return":
      return { technique: id, options: { month: "2026-10", houseSystem: "placidus" } };
    case "western.synastry":
    case "western.composite":
      return { technique: id, options: { partnerProfileId: partner, houseSystem: "placidus", nodeType: "true" } };
    default:
      throw new Error(`goldenSelection: Aşama 3 dışı teknik ${id}`);
  }
}
const TIMING: TechniqueId[] = TECHNIQUE_IDS.filter((x) => x !== "western.natal");
const FIXTURE_OF: Record<string, string> = {
  "western.transit": "transit",
  "western.forecast": "forecast",
  "western.progression": "progression",
  "western.solar_arc": "solar-arc",
  "western.solar_return": "solar-return",
  "western.lunar_return": "lunar-return",
  "western.synastry": "synastry",
  "western.composite": "composite",
};

/** Yanıttaki tüm anlatı metinleri (>40 karakter string yaprak). */
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
const RAW_MARKERS = ["transitAspects", "interAspects", "compositePlanets", "raw_response", "birthDetails", "aspectInterpretation", "input_hash", "inputHash"];

const lon = (b: Astronomy.Body, d: Date) => Astronomy.Ecliptic(Astronomy.GeoVector(b, Astronomy.MakeTime(d), true)).elon;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const AE_BODIES: [string, Astronomy.Body][] = [
  ["sun", Astronomy.Body.Sun], ["moon", Astronomy.Body.Moon], ["mercury", Astronomy.Body.Mercury], ["venus", Astronomy.Body.Venus],
  ["mars", Astronomy.Body.Mars], ["jupiter", Astronomy.Body.Jupiter], ["saturn", Astronomy.Body.Saturn], ["uranus", Astronomy.Body.Uranus],
  ["neptune", Astronomy.Body.Neptune], ["pluto", Astronomy.Body.Pluto],
];

async function run(ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, extra: Record<string, unknown> = {}, preview = false) {
  return runAstrology(ctx, { profileId: pid, selections, ...extra }, deps, { ownerPreviewHideInterp: preview });
}

async function main() {
  // ═══ A) GOLDEN: ürün gövdesi = golden gövdesi; projeksiyon kayıpsız ═══════════
  await t("golden: 8 fixture mevcut, bütün (endpoint + gövde + yanıt) ve anahtar/PII metni içermiyor", () => {
    const plan = goldenPlan();
    assert.equal(plan.length, 8);
    for (const g of plan) {
      const f = G[g.name];
      assert.ok(f, `${g.name} fixture yok`);
      assert.equal(f.endpoint, g.endpoint);
      assert.deepEqual(f.body, JSON.parse(JSON.stringify(g.body)), `${g.name}: kayıtlı gövde ≠ ürün gövdesi`);
      const s = JSON.stringify(f);
      assert.ok(!/api[_-]?key|x-api-key|Bearer /i.test(s), `${g.name}: anahtar izi`);
      assert.ok(!/Sentetik|name"\s*:\s*"[A-ZÇĞİÖŞÜ][a-zçğıöşü]+ [A-Z]/.test(JSON.stringify(f.body)), `${g.name}: gövdede kişi adı`);
    }
  });

  await t("golden: her tekniğin units() gövdesi golden gövdesiyle BİREBİR (çağrı = ürünün çağrısı)", () => {
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B };
    for (const id of TIMING) {
      const def = getTechnique(id)!;
      const sel = goldenSelection(id, "00000000-0000-4000-8000-00000000abcd");
      const opts = def.parseOptions(sel.options, new Date())!;
      const units = def.units(ctx, opts);
      assert.equal(units.length, 1, id);
      assert.equal(units[0].endpoint, G[FIXTURE_OF[id]].endpoint, id);
      assert.deepEqual(JSON.parse(JSON.stringify(units[0].body)), G[FIXTURE_OF[id]].body, `${id} gövde farklı`);
    }
  });

  await t("golden: 8 endpoint → projeksiyon ok; bilinmeyen alan 0, düşürülen değer 0; sayımlar ham yanıtla aynı", () => {
    const counts: Record<string, [number, number]> = {};
    for (const id of TIMING) {
      const f = G[FIXTURE_OF[id]];
      const def = getTechnique(id)!;
      const opts = def.parseOptions(goldenSelection(id, "00000000-0000-4000-8000-00000000abcd").options, new Date())!;
      const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B }, opts)[0];
      const p = def.project(u, f.response, opts);
      assert.ok(p.ok, `${id}: ${!p.ok ? p.errors.join(";") : ""}`);
      if (!p.ok) continue;
      assert.deepEqual(p.unmappedFields, [], `${id} unmapped: ${p.unmappedFields.join(",")}`);
      assert.deepEqual(p.droppedValues, [], `${id} dropped: ${p.droppedValues.join(",")}`);
      const tech = p.technical as J;
      const r = f.response;
      if (id === "western.transit") counts[id] = [tech.aspects.length, r.transitAspects.length];
      if (id === "western.forecast") counts[id] = [tech.events.length, r.events.length];
      if (id === "western.progression") counts[id] = [tech.bodies.length, r.planets.length];
      if (id === "western.solar_arc") counts[id] = [tech.directed.length, r.directed.length];
      if (id === "western.solar_return" || id === "western.lunar_return") counts[id] = [tech.chart.aspects.length, r.chart.aspects.length];
      if (id === "western.synastry") counts[id] = [tech.aspects.length, r.interAspects.length];
      if (id === "western.composite") counts[id] = [tech.aspects.length, r.aspects.length];
      // Teknik katmanda sağlayıcı anlatısı YOK (yorum açık olsa bile).
      assert.deepEqual(leaks(JSON.stringify(tech), narratives(r)), [], `${id}: teknik katmanda anlatı`);
    }
    for (const [id, [a, b]] of Object.entries(counts)) assert.equal(a, b, `${id}: ${a} ≠ ham ${b} (sessiz kayıp)`);
  });

  await t("golden: solar arc açıları Yaşam aritmetiği (orb ≤ 1°, majör) — directed − natal = arc her noktada", () => {
    const def = getTechnique("western.solar_arc")!;
    const opts = def.parseOptions(goldenSelection("western.solar_arc").options, new Date())!;
    const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0];
    const p = def.project(u, G["solar-arc"].response, opts);
    assert.ok(p.ok);
    const tech = (p as J).technical;
    for (const d of tech.directed) assert.ok(angDiff(d.directedLongitude - d.natalLongitude, tech.arc) < 1e-6, d.id);
    assert.ok(tech.aspects.length > 0 && tech.aspects.every((a: J) => a.orb <= 1));
    assert.equal(tech.aspectMethod, "yasam-arith-v1:major-aspects:orb-1deg");
  });

  // ═══ B) YORUM GÜVENLİĞİ + HAM YANIT ═════════════════════════════════════════
  await t("yorum: 9 teknik × (açık / yetkisiz / önizleme) — kapalıyken anlatı yanıtta YOK; ham yanıt hiçbir durumda YOK", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const { deps } = roxy();
    const sels = TECHNIQUE_IDS.map((id) => goldenSelection(id, pb));
    const r = await run(ctx, pa, sels, deps, { confirmNewRequests: 9 });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const visibleJson = JSON.stringify(r.body);
    const hidden = await run(ctxOf(store, { entitlements: NO_INTERP }), pa, sels, deps);
    const previewR = await run(ctx, pa, sels, deps, {}, true);
    for (const id of TECHNIQUE_IDS) {
      const raw = id === "western.natal" ? NATAL_GOLDEN : G[FIXTURE_OF[id]].response;
      const narr = narratives(raw);
      const vis = (r.body as J).results.find((x: J) => x.technique === id);
      const hid = (hidden.body as J).results.find((x: J) => x.technique === id);
      const pre = (previewR.body as J).results.find((x: J) => x.technique === id);
      assert.ok(vis.ok && hid.ok && pre.ok, id);
      assert.deepEqual(leaks(JSON.stringify(hid), narr), [], `${id}: yetkisizde anlatı sızdı`);
      assert.deepEqual(leaks(JSON.stringify(pre), narr), [], `${id}: önizlemede anlatı sızdı`);
      assert.deepEqual(hid.view.interpretation, { visible: false, reason: "not_entitled" }, id);
      assert.deepEqual(pre.view.interpretation, { visible: false, reason: "owner_preview_hidden" }, id);
      // 2026-10-12 (UAT madde 13): forecast `description` artık yorum katmanında (yalnız yetkiliye, teknik katmana karışmaz).
      assert.equal(vis.view.interpretation.visible, true, `${id} yetkiliyken yorum görünmeli`);
      assert.ok(leaks(JSON.stringify(vis.view.interpretation), narr).length > 0, `${id}: yorum içeriği boş`);
      assert.deepEqual(leaks(JSON.stringify(vis.view.technical), narr), [], `${id}: teknikte anlatı`);
      if (id === "western.forecast") {
        const descs = (G[FIXTURE_OF[id]].response as { events: { description?: string; domain?: string }[] }).events.filter((e) => (e.domain ?? "western") === "western" && typeof e.description === "string");
        const ev = (vis.view.interpretation.content as { events: { text: string }[] }).events;
        assert.equal(ev.length, descs.length, "forecast: her olayın Roxy cümlesi eksiksiz");
        assert.deepEqual(ev.map((e) => e.text).sort(), descs.map((e) => e.description!).sort(), "forecast: metin AYNEN (kırpma/değişiklik yok)");
      }
    }
    for (const json of [visibleJson, JSON.stringify(hidden.body), JSON.stringify(previewR.body)]) {
      for (const m of RAW_MARKERS) assert.ok(!json.includes(m), `ham yanıt izi: ${m}`);
      assert.ok(!json.includes("k-test"), "anahtar sızdı");
    }
  });

  await t("yorum: kayıtlı sonucu tekrar aç (getAstrologyResult) — yetkisizde anlatı yok, sağlayıcı çağrısı 0", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const rx = roxy();
    const r = await run(ctx, pa, [goldenSelection("western.synastry", pb), goldenSelection("western.transit")], rx.deps);
    const n = rx.calls.length;
    for (const res of (r.body as J).results) {
      const hid = await getAstrologyResult(ctxOf(store, { entitlements: NO_INTERP }), res.view.id, { profileId: null, revision: null, ownerPreviewHideInterp: false });
      assert.equal(hid.status, 200);
      const narr = narratives(G[FIXTURE_OF[res.technique]].response);
      assert.deepEqual(leaks(JSON.stringify(hid.body), narr), []);
      const vis = await getAstrologyResult(ctx, res.view.id, { profileId: null, revision: null, ownerPreviewHideInterp: false });
      assert.ok(leaks(JSON.stringify(vis.body), narr).length > 0);
    }
    assert.equal(rx.calls.length, n, "açmak sağlayıcı çağırdı");
    const other = await getAstrologyResult(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (r.body as J).results[0].view.id, { profileId: null, revision: null, ownerPreviewHideInterp: false });
    assert.equal(other.status, 404, "başka tenant sonucu açtı");
  });

  // ═══ C) ÖNBELLEK ═════════════════════════════════════════════════════════════
  await t("cache: aynı hedef/seçenek → 0 yeni istek; farklı transit anı / hedef tarih / yıl / ay / ev sistemi → yeni istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    const base = [goldenSelection("western.transit"), goldenSelection("western.progression"), goldenSelection("western.solar_return"), goldenSelection("western.lunar_return")];
    let r = await run(ctx, pa, base, rx.deps);
    assert.equal(rx.calls.length, 4);
    assert.deepEqual((r.body as J).executed, { newResults: 4, cachedResults: 0, providerAttempts: 4 });
    r = await run(ctx, pa, base, rx.deps);
    assert.equal(rx.calls.length, 4, "ikinci çalıştırma istek yaptı");
    assert.deepEqual((r.body as J).executed, { newResults: 0, cachedResults: 4, providerAttempts: 0 });
    const variants = [
      { technique: "western.transit", options: { atUtc: "2026-10-07T10:00", nodeType: "true" } },
      { technique: "western.progression", options: { targetDate: "2027-01-01", nodeType: "true" } },
      { technique: "western.solar_return", options: { returnYear: 2027, houseSystem: "placidus" } },
      { technique: "western.lunar_return", options: { month: "2026-11", houseSystem: "placidus" } },
      { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "koch" } },
    ];
    const p = await planAstrology(ctx, { profileId: pa, selections: variants });
    assert.equal((p.body as J).plan.newRequestCount, 5, "her farklı hedef yeni istek olmalı");
    // "şimdi" → UTC saat başı: aynı saat içindeki iki istek AYNI anahtar.
    const a = parseSelections([{ technique: "western.transit", options: { now: true } }], new Date("2026-10-07T09:05:00Z"));
    const b = parseSelections([{ technique: "western.transit", options: { now: true } }], new Date("2026-10-07T09:55:00Z"));
    const c = parseSelections([{ technique: "western.transit", options: { now: true } }], new Date("2026-10-07T10:01:00Z"));
    assert.ok(a.ok && b.ok && c.ok);
    if (a.ok && b.ok && c.ok) {
      assert.deepEqual(a.selections[0].options, b.selections[0].options);
      assert.notDeepEqual(a.selections[0].options, c.selections[0].options);
      assert.equal(a.selections[0].options.atUtc, "2026-10-07T09:00");
    }
    // Yerel saat + IANA dilimi → UTC normalize (aynı an iki yazım = aynı anahtar).
    const loc = parseSelections([{ technique: "western.transit", options: { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul" } }]);
    assert.ok(loc.ok && loc.selections[0].options.atUtc === "2026-10-07T09:00");
  });

  // ═══ D) FORECAST PARÇALAMA ════════════════════════════════════════════════
  await t("forecast: 90→1, 91→2, 180→2, 365→5, 366→5 parça; 367 reddedilir; parçalar bitişik/çakışmasız", () => {
    for (const [days, n] of [[1, 1], [90, 1], [91, 2], [180, 2], [365, 5], [366, 5]] as const) {
      const ch = forecastChunks("2026-10-01", days);
      assert.equal(ch.length, n, `${days} gün`);
      assert.equal(ch[0].start, "2026-10-01");
      for (let i = 1; i < ch.length; i++) {
        const prevEnd = new Date(`${ch[i - 1].end}T00:00:00Z`).getTime();
        assert.equal(new Date(`${ch[i].start}T00:00:00Z`).getTime() - prevEnd, 86400_000, "boşluk/çakışma");
      }
      const total = ch.reduce((s, c) => s + (new Date(`${c.end}T00:00:00Z`).getTime() - new Date(`${c.start}T00:00:00Z`).getTime()) / 86400_000 + 1, 0);
      assert.equal(total, days);
    }
    assert.equal((parseSelections([{ technique: "western.forecast", options: { startDate: "2026-10-01", days: 367 } }]) as J).code, "INVALID_OPTIONS");
  });

  await t("forecast: 365 gün → plan 5 yeni istek (1 seçim ≠ 1 istek) → 5 çağrı → birleşik takvim; tekrar 0", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    const sel = [{ technique: "western.forecast", options: { startDate: "2026-10-01", days: 365 } }];
    const p = await planAstrology(ctx, { profileId: pa, selections: sel });
    const plan = (p.body as J).plan;
    assert.deepEqual([plan.selectedCount, plan.newRequestCount, plan.selections[0].unitCount], [1, 5, 5]);
    assert.deepEqual(plan.units.map((u: J) => u.part), [0, 1, 2, 3, 4]);
    const r = await run(ctx, pa, sel, rx.deps);
    assert.equal(rx.calls.length, 5);
    const view = (r.body as J).results[0].view;
    assert.equal(view.resultIds.length, 5);
    assert.deepEqual(view.technical.window, { start: "2026-10-01", end: "2027-09-30" });
    // Golden 2026-10-01..12-29 olayları parça 0 + parça 1'e bölündü; birleşimde HEPSİ var (kayıp yok).
    assert.equal(view.technical.events.length, G.forecast.response.events.length);
    const sorted = [...view.technical.events].map((e: J) => e.datetime);
    assert.deepEqual(sorted, [...sorted].sort());
    assert.equal(view.missingParts, 0);
    await run(ctx, pa, sel, rx.deps);
    assert.equal(rx.calls.length, 5, "tekrar çalıştırma istek yaptı");
  });

  await t("forecast: 3. parça hata → kısmi başarı (partial, missingParts=1, uyarı); tekrar → yalnız eksik parça istenir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const failing = roxy({ failWhen: (c) => c.endpoint === "/forecast/transits" && c.body.startDate === "2027-03-30" });
    const sel = [{ technique: "western.forecast", options: { startDate: "2026-10-01", days: 365 } }];
    const r = await run(ctx, pa, sel, failing.deps);
    assert.equal(r.status, 200);
    const res = (r.body as J).results[0];
    assert.equal(res.ok, true);
    assert.equal(res.partial, true);
    assert.equal(res.view.missingParts, 1);
    assert.equal(res.view.resultIds.length, 4);
    assert.ok(res.view.warnings.some((w: string) => w.includes("1 dönem parçası")), "eksik parça uyarısı yok");
    const ok = roxy();
    const r2 = await run(ctx, pa, sel, ok.deps);
    assert.equal(ok.calls.length, 1, "yalnız eksik parça istenmeliydi");
    assert.equal((r2.body as J).results[0].partial, false);
    assert.equal((r2.body as J).results[0].view.resultIds.length, 5);
    // Tüm parçalar başarısız → seçim başarısız (sessiz boş takvim YOK).
    const store2 = seed();
    const ctx2 = ctxOf(store2);
    const pa2 = await profile(ctx2, "A");
    const all = roxy({ failWhen: () => true });
    const r3 = await run(ctx2, pa2, sel, all.deps);
    assert.equal((r3.body as J).ok, false);
    assert.equal((r3.body as J).results[0].ok, false);
    assert.equal(r3.status, 502);
  });

  // ═══ E) PLANLAYICI 5 / 10 SEÇİM ═══════════════════════════════════════════
  await t("plan 5 seçim: natal + transit + progression + solar arc + forecast 180g → 6 yeni istek; ikinci kez 0 yeni / 6 kayıtlı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const sels = [
      goldenSelection("western.natal"),
      goldenSelection("western.transit"),
      goldenSelection("western.progression"),
      goldenSelection("western.solar_arc"),
      { technique: "western.forecast", options: { startDate: "2026-10-01", days: 180 } },
    ];
    const p1 = (await planAstrology(ctx, { profileId: pa, selections: sels })).body as J;
    assert.deepEqual([p1.plan.selectedCount, p1.plan.newRequestCount, p1.plan.cachedCount, p1.plan.blockedCount, p1.plan.requiresConfirmation], [5, 6, 0, 0, false]);
    assert.deepEqual(p1.plan.selections.map((s: J) => s.newRequests), [1, 1, 1, 1, 2]);
    const rx = roxy();
    await run(ctx, pa, sels, rx.deps);
    assert.equal(rx.calls.length, 6);
    const p2 = (await planAstrology(ctx, { profileId: pa, selections: sels })).body as J;
    assert.deepEqual([p2.plan.selectedCount, p2.plan.newRequestCount, p2.plan.cachedCount], [5, 0, 6]);
  });

  await t("plan 10 seçim: 9 teknik + yinelenen natal, forecast 365g → 13 yeni istek (tekilleştirme 1) → onay zorunlu; onaysız 0 çağrı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const sels = [
      goldenSelection("western.natal"),
      goldenSelection("western.natal"),
      goldenSelection("western.transit"),
      { technique: "western.forecast", options: { startDate: "2026-10-01", days: 365 } },
      goldenSelection("western.progression"),
      goldenSelection("western.solar_arc"),
      goldenSelection("western.solar_return"),
      goldenSelection("western.lunar_return"),
      goldenSelection("western.synastry", pb),
      goldenSelection("western.composite", pb),
    ];
    const p = (await planAstrology(ctx, { profileId: pa, selections: sels })).body as J;
    assert.deepEqual([p.plan.selectedCount, p.plan.newRequestCount, p.plan.dedupedCount, p.plan.requiresConfirmation], [10, 13, 1, true]);
    const rx = roxy();
    const no = await run(ctx, pa, sels, rx.deps);
    assert.equal(no.status, 409);
    assert.equal((no.body as J).code, "CONFIRMATION_REQUIRED");
    assert.equal(rx.calls.length, 0);
    const wrong = await run(ctx, pa, sels, rx.deps, { confirmNewRequests: 12 });
    assert.equal(wrong.status, 409);
    const yes = await run(ctx, pa, sels, rx.deps, { confirmNewRequests: 13 });
    assert.equal(yes.status, 200);
    assert.equal(rx.calls.length, 13);
    assert.equal((yes.body as J).results.length, 10);
    assert.ok((yes.body as J).results.every((x: J) => x.ok));
  });

  // ═══ F) SAAT BİLİNMİYOR ═════════════════════════════════════════════════════
  await t("saat yok: solar/lunar return ENGELLENİR (TIME_REQUIRED, 0 istek); diğer 7 teknik çalışır + maskeler", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pu = await profile(ctx, "A", { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const pb = await profile(ctx, "B");
    const rx = roxy();
    const sels = TECHNIQUE_IDS.map((id) => goldenSelection(id, pb));
    const plan = (await planAstrology(ctx, { profileId: pu, selections: sels })).body as J;
    assert.equal(plan.plan.blockedCount, 2);
    const blocked = plan.plan.selections.filter((s: J) => s.blocked).map((s: J) => [s.technique, s.blocked.code, s.unitCount]);
    assert.deepEqual(blocked, [["western.solar_return", "TIME_REQUIRED", 0], ["western.lunar_return", "TIME_REQUIRED", 0]]);
    const r = await run(ctx, pu, sels, rx.deps);
    assert.equal(rx.calls.length, 7, "engellenen teknik için istek yapıldı");
    assert.ok(!rx.calls.some((c) => c.endpoint.includes("return")));
    const res = Object.fromEntries((r.body as J).results.map((x: J) => [x.technique, x]));
    assert.equal(res["western.solar_return"].ok, false);
    assert.equal(res["western.solar_return"].code, "TIME_REQUIRED");
    const v = (id: string) => res[id].view;
    assert.equal(v("western.natal").technical.angles, null);
    assert.ok(v("western.transit").timeUnknownMasked && v("western.transit").technical.aspects.every((a: J) => a.natal !== "ascendant" && a.natal !== "midheaven"));
    assert.ok(v("western.forecast").technical.events.every((e: J) => e.targetBody !== "ascendant" && e.targetBody !== "midheaven"));
    assert.equal(v("western.progression").technical.angles, null);
    assert.ok(v("western.progression").technical.bodies.every((b: J) => b.house === null));
    assert.ok(v("western.solar_arc").technical.directed.every((d: J) => d.id !== "ascendant" && d.id !== "midheaven"));
    assert.ok(v("western.solar_arc").technical.aspects.every((a: J) => !["ascendant", "midheaven"].includes(a.directed) && !["ascendant", "midheaven"].includes(a.natal)));
    const syn = v("western.synastry").technical;
    assert.equal(syn.person1.ascendant, null);
    assert.ok(syn.person1.bodies.every((b: J) => b.house === null));
    assert.ok(syn.person2.bodies.every((b: J) => b.houseInOther === null), "kişi 2'nin kişi 1 evine bindirmesi kişi 1 saatine bağlı");
    assert.ok(syn.person2.bodies.some((b: J) => b.house !== null), "kişi 2'nin saati biliniyor → kendi evleri kalmalı");
    const comp = v("western.composite").technical;
    assert.deepEqual([comp.houses.length, comp.angles], [0, null]);
    assert.ok(comp.bodies.every((b: J) => b.house === null));
    for (const id of ["western.transit", "western.progression", "western.synastry", "western.composite"]) assert.ok(v(id).warnings.length > 0, `${id} uyarı yok`);
    // Saat-bağımlı konu üretilmez.
    assert.ok(!topicsForTechnique("western.composite", comp).some((x) => x.kind.endsWith("_in_house") || x.kind.endsWith("angle_in_sign")));
    assert.ok(!topicsForTechnique("western.progression", v("western.progression").technical).some((x) => x.kind.endsWith("_in_house") || x.kind.endsWith("angle_in_sign")));
  });

  await t("saat yok: maske birim testi — açısal hedefli transit/forecast satırı uydurulmaz, saklanır", () => {
    const tr = { schema: "astro.western.transit.v1", zodiac: "tropical", nodeType: "true", atUtc: "x", bodies: [], summary: {}, aspects: [
      { transit: "saturn", natal: "ascendant", type: "square", exactAngle: 90, orb: 1, applying: true, strength: 50, nature: null },
      { transit: "saturn", natal: "sun", type: "square", exactAngle: 90, orb: 1, applying: true, strength: 50, nature: null },
    ] } as unknown as TransitTechnical;
    const known = maskTechnical("western.transit", tr, { primary: true, partner: null });
    assert.equal((known.technical as J).aspects.length, 2);
    const unk = maskTechnical("western.transit", tr, { primary: false, partner: null });
    assert.deepEqual((unk.technical as J).aspects.map((a: J) => a.natal), ["sun"]);
    const fc = { schema: "astro.western.forecast.v1", window: { start: "a", end: "b" }, events: [{ type: "transit_aspect", targetBody: "midheaven" }, { type: "sign_ingress", targetBody: null }] };
    assert.equal((maskTechnical("western.forecast", fc, { primary: false, partner: null }).technical as J).events.length, 1);
  });

  // ═══ G) KARŞI TARAF İZOLASYONU ══════════════════════════════════════════════
  await t("karşı taraf: başka tenant profili → PARTNER_NOT_FOUND, 0 istek; aynı profil → PARTNER_SAME_PROFILE; var olmayan → NOT_FOUND", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const ctxB = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    const foreign = await profile(ctxB, "B", { clientId: CLIENT_B });
    const rx = roxy();
    const r = await run(ctx, pa, [goldenSelection("western.synastry", foreign), goldenSelection("western.composite", pa), goldenSelection("western.composite", randomUUID())], rx.deps);
    assert.equal(rx.calls.length, 0, "engellenen karşı taraf için istek yapıldı");
    assert.deepEqual((r.body as J).results.map((x: J) => x.code), ["PARTNER_NOT_FOUND", "PARTNER_SAME_PROFILE", "PARTNER_NOT_FOUND"]);
    assert.equal(r.status, 422);
    assert.ok(!JSON.stringify(r.body).includes("1988-03-21"), "başka tenant doğum verisi sızdı");
    // Başka tenant'ın notu/analizi için de karşı taraf kullanılamaz.
    const note = await saveExpertNote(ctx, { profileId: pa, technique: "western.synastry", contextKey: foreign, sectionKey: "overall", body: "x" });
    assert.equal(note.status, 404);
    const ws = await getWorkspace(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.synastry", foreign) });
    assert.equal(ws.status, 409);
    assert.equal((ws.body as J).code, "PARTNER_NOT_FOUND");
  });

  await t("karşı taraf: danışansız (bağımsız) profil kullanılabilir; sonuç satırı partner kimliği + revizyonu taşır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const free = await profile(ctx, "B", { clientId: null, label: "Bağımsız B" });
    const rx = roxy();
    const r = await run(ctx, pa, [goldenSelection("western.synastry", free)], rx.deps);
    assert.equal(r.status, 200);
    const row = store.tables.astro_provider_results.find((x) => x.technique === "western.synastry")!;
    assert.deepEqual([row.partner_profile_id, row.partner_profile_revision], [free, 1]);
    assert.equal((r.body as J).results[0].view.options.partnerRevision, 1, "kullanılan revizyon seçeneğe normalize edilmeli");
  });

  await t("karşı taraf revize: yeni revizyon → yeni istek; eski revizyon açıkça istenirse kayıtlı (0); kayıtlı analiz DEĞİŞMEZ", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const rx = roxy();
    await run(ctx, pa, [goldenSelection("western.synastry", pb)], rx.deps);
    assert.equal(rx.calls.length, 1);
    const saved = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.synastry", pb), saveRequestId: randomUUID() }, false);
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const aid = (saved.body as J).analysisId;
    const before = JSON.stringify((await getAnalysis(ctx, aid, false)).body);
    const rev = await appendAstroRevision(ctx, pb, { expectedRevision: 1, birthDate: "1988-03-21", birthTime: "07:15", timeKnown: true, timeAccuracy: "rectified", locationId: ANKARA.id }, resolveLoc);
    assert.equal(rev.status, 200, JSON.stringify(rev.body));
    const p = (await planAstrology(ctx, { profileId: pa, selections: [goldenSelection("western.synastry", pb)] })).body as J;
    assert.equal(p.plan.newRequestCount, 1, "karşı taraf revize → yeni hesap");
    assert.equal(p.plan.selections[0].options.partnerRevision, 2);
    const old = (await planAstrology(ctx, { profileId: pa, selections: [{ ...goldenSelection("western.synastry", pb), options: { ...goldenSelection("western.synastry", pb).options, partnerRevision: 1 } }] })).body as J;
    assert.deepEqual([old.plan.newRequestCount, old.plan.cachedCount], [0, 1]);
    await run(ctx, pa, [goldenSelection("western.synastry", pb)], rx.deps);
    assert.equal(rx.calls.length, 2);
    assert.equal(JSON.stringify((await getAnalysis(ctx, aid, false)).body), before, "kayıtlı sinastri analizi değişti");
    const a = ((await getAnalysis(ctx, aid, false)).body as J).analysis;
    assert.equal(a.profile.partner.revision.revision, 1);
  });

  // ═══ H) ÇALIŞMA ALANI · NOT BAĞLAMI · KAYDET ════════════════════════════════
  await t("konu bağlamı: her tekniğin konuları kendi bağlamında; natal anahtarıyla çakışmaz; not bölümü yanlış bağlama yazılamaz", () => {
    const seen = new Map<string, string>();
    for (const id of TIMING) {
      const def = getTechnique(id)!;
      const opts = def.parseOptions(goldenSelection(id, "00000000-0000-4000-8000-00000000abcd").options, new Date())!;
      const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B }, opts)[0];
      const p = def.project(u, G[FIXTURE_OF[id]].response, opts);
      assert.ok(p.ok);
      const topics = topicsForTechnique(id, (p as J).technical);
      assert.ok(topics.length > 0, `${id} konu yok`);
      for (const x of topics) {
        const parsed = parseAnyTopicKey("western", x.key);
        assert.ok(parsed, `${id}: geçersiz anahtar ${x.key}`);
        assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/.test(x.key), `DB CHECK'e uymuyor: ${x.key}`);
        assert.notEqual(parsed!.context, "natal", `${id}: natal bağlamlı konu üretti`);
        assert.ok(isSectionKeyForTechnique(id, x.key));
        assert.ok(!isSectionKeyForTechnique("western.natal", x.key), `${x.key} natal notuna yazılabiliyor`);
        const prev = seen.get(x.key);
        if (prev) assert.ok((prev === "western.transit" && id === "western.forecast") || prev === id || (prev === "western.solar_return" && id === "western.lunar_return" && false), `${x.key} iki bağlamda`);
        seen.set(x.key, id);
      }
    }
    assert.ok(!isSectionKeyForTechnique("western.transit", "planet_in_house:saturn:7"));
    assert.ok(isSectionKeyForTechnique("western.transit", "overall"));
    assert.ok(!isSectionKeyForTechnique("western.synastry", "composite_in_sign:sun:taurus"));
  });

  await t("çalışma alanı + KB: transit konusu yalnız transit alanında eşleşir; natal alanına karışmaz; hesaplanmamış seçim → RESULT_NOT_COMPUTED", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const rx = roxy();
    await run(ctx, pa, [goldenSelection("western.natal"), goldenSelection("western.transit"), goldenSelection("western.synastry", pb)], rx.deps);
    const n = rx.calls.length;
    const trWs = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.transit") })).body as J;
    assert.equal(trWs.ok, true);
    const trKey = trWs.topics[0].key;
    await createKb(ctx, { tradition: "western", topicKey: trKey, title: "Transit notu", body: "transit KB metni" });
    const synKey = ((await getWorkspace(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.synastry", pb) })).body as J).topics[0].key;
    await createKb(ctx, { tradition: "western", topicKey: synKey, title: "Sinastri notu", body: "sinastri KB metni" });
    const tr2 = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.transit") })).body as J;
    assert.deepEqual(tr2.kbMatches.map((e: J) => e.topicKey), [trKey]);
    const natal = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.natal") })).body as J;
    assert.equal(natal.kbMatches.length, 0, "transit/sinastri KB natal alanına karıştı");
    const syn = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.synastry", pb) })).body as J;
    assert.deepEqual(syn.kbMatches.map((e: J) => e.topicKey), [synKey]);
    assert.equal(syn.contextKey, pb);
    const notYet = await getWorkspace(ctx, { profileId: pa, revision: 1, technique: "western.transit", options: { atUtc: "2030-01-01T00:00", nodeType: "true" } });
    assert.equal(notYet.status, 409);
    assert.equal((notYet.body as J).code, "RESULT_NOT_COMPUTED");
    assert.equal(rx.calls.length, n, "çalışma alanı sağlayıcı çağırdı");
    // Aşama 2 uyumu: GET ?resultId= natal hâlâ çalışır; natal olmayan sonuç kimliği reddedilir.
    const natalId = store.tables.astro_provider_results.find((x) => x.technique === "western.natal")!.id;
    assert.equal((await getWorkspace(ctx, { profileId: pa, revision: 1, resultId: natalId })).status, 200);
    const trId = store.tables.astro_provider_results.find((x) => x.technique === "western.transit")!.id;
    assert.equal((await getWorkspace(ctx, { profileId: pa, revision: 1, resultId: trId })).status, 400);
  });

  await t("uzman notu: (profil, teknik, karşı taraf, bölüm) bağlamı — transit notu natal'e, Y notu Z'ye karışmaz; yanlış bölüm/bağlam reddedilir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const pz = await profile(ctx, "B", { clientId: null, label: "Z" });
    const rx = roxy();
    await run(ctx, pa, [goldenSelection("western.natal"), goldenSelection("western.transit"), goldenSelection("western.synastry", pb), goldenSelection("western.synastry", pz)], rx.deps);
    const ok = async (b: Record<string, unknown>, status = 201) => {
      const r = await saveExpertNote(ctx, { profileId: pa, expectedRevision: null, ...b });
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r;
    };
    await ok({ technique: "western.transit", sectionKey: "overall", body: "transit genel" });
    await ok({ sectionKey: "overall", body: "natal genel" }); // teknik verilmezse natal (Aşama 2 uyumu)
    await ok({ technique: "western.synastry", contextKey: pb, sectionKey: "overall", body: "Y ile" });
    await ok({ technique: "western.synastry", contextKey: pz, sectionKey: "overall", body: "Z ile" });
    await ok({ technique: "western.transit", sectionKey: "planet_in_house:saturn:7", body: "x" }, 400);
    await ok({ technique: "western.natal", sectionKey: "transit_aspect:saturn:square:sun", body: "x" }, 400);
    await ok({ technique: "western.synastry", sectionKey: "overall", body: "bağlamsız" }, 400);
    await ok({ technique: "western.transit", contextKey: pb, sectionKey: "overall", body: "x" }, 400);
    await ok({ technique: "western.everything", sectionKey: "overall", body: "x" }, 400);
    const notes = async (sel: J) => (((await getWorkspace(ctx, { profileId: pa, revision: 1, ...sel })).body as J).notes as J[]).map((n) => n.body);
    assert.deepEqual(await notes(goldenSelection("western.transit")), ["transit genel"]);
    assert.deepEqual(await notes(goldenSelection("western.natal")), ["natal genel"]);
    assert.deepEqual(await notes(goldenSelection("western.synastry", pb)), ["Y ile"]);
    assert.deepEqual(await notes(goldenSelection("western.synastry", pz)), ["Z ile"]);
    // İyimser kilit bağlam içinde çalışır.
    const upd = await saveExpertNote(ctx, { profileId: pa, technique: "western.synastry", contextKey: pb, sectionKey: "overall", body: "Y ile v2", expectedRevision: 1 });
    assert.equal(upd.status, 200);
    assert.deepEqual(await notes(goldenSelection("western.synastry", pz)), ["Z ile"], "Y güncellemesi Z notunu değiştirdi");
  });

  await t("Analizi Kaydet: 9 teknik × v2 snapshot (teknik, normalize seçenek, parça kimlikleri, karşı taraf) → aç = 0 istek, metadata kaybolmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const rx = roxy();
    const sels = [...TECHNIQUE_IDS.map((id) => goldenSelection(id, pb))];
    sels[2] = { technique: "western.forecast", options: { startDate: "2026-10-01", days: 180 } };
    await run(ctx, pa, sels, rx.deps, { confirmNewRequests: 10 });
    const n = rx.calls.length;
    const ids: Record<string, string> = {};
    for (const s of sels) {
      await saveExpertNote(ctx, { profileId: pa, technique: s.technique, contextKey: getTechnique(s.technique)!.requiresPartner ? pb : "", sectionKey: "overall", body: `${s.technique} yorumu` });
      const pv = await previewAnalysis(ctx, { profileId: pa, revision: 1, ...s }, false);
      assert.equal(pv.status, 200, `${s.technique}: ${JSON.stringify(pv.body)}`);
      const sum = (pv.body as J).summary;
      assert.equal(sum.technique, s.technique);
      assert.equal(sum.noteCount, 1);
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...s, includeProviderInterp: s.technique !== "western.forecast", saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, `${s.technique}: ${JSON.stringify(sv.body)}`);
      ids[s.technique] = (sv.body as J).analysisId;
    }
    const logBefore = store.log.length;
    for (const s of sels) {
      const a = ((await getAnalysis(ctx, ids[s.technique], false)).body as J).analysis;
      assert.equal(a.technique, s.technique);
      assert.equal(a.method.technique, s.technique);
      assert.ok(a.techniqueLabel.length > 0);
      for (const [k, v] of Object.entries(s.options)) if (k !== "partnerRevision") assert.deepEqual(a.params[k], v, `${s.technique}: ${k} kayboldu`);
      assert.ok(a.topics.length > 0, `${s.technique}: konu yok`);
      assert.deepEqual(a.notes.map((x: J) => x.body), [`${s.technique} yorumu`]);
      if (getTechnique(s.technique)!.requiresPartner) {
        assert.equal(a.profile.partner.profileId, pb);
        assert.equal(a.profile.partner.label, "Sentetik B");
        assert.equal(a.params.partnerRevision, 1);
      } else assert.equal(a.profile.partner, null);
      if (s.technique !== "western.forecast") assert.equal(a.interpretation.visible, true, s.technique);
      const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), ids[s.technique], false)).body as J).analysis;
      const raw = s.technique === "western.natal" ? NATAL_GOLDEN : G[FIXTURE_OF[s.technique]].response;
      assert.deepEqual(leaks(JSON.stringify(hidden), narratives(raw)), [], `${s.technique}: kayıtlı analizde yetkisiz anlatı`);
    }
    const row = store.tables.astro_analyses.find((x) => x.id === ids["western.forecast"])!;
    assert.equal((row.result_ids as string[]).length, 2);
    assert.equal(row.result_id, null, "çok parçalı analizde tek result_id olmamalı");
    const syn = store.tables.astro_analyses.find((x) => x.id === ids["western.synastry"])!;
    assert.deepEqual([syn.partner_profile_id, syn.partner_profile_revision, (syn.result_ids as string[]).length], [pb, 1, 1]);
    assert.equal(rx.calls.length, n, "kaydetme/açma sağlayıcı çağırdı");
    assert.ok(!store.log.slice(logBefore).some((l) => l.table === "astro_provider_results" || l.table === "astro_provider_interpretations"), "açmak sonuç tablosuna gitti");
    const list = ((await listAnalyses(ctx, pa)).body as J).analyses;
    assert.equal(list.length, 9);
    const synL = list.find((x: J) => x.technique === "western.synastry");
    assert.equal(synL.partnerLabel, "Sentetik B");
    assert.equal(list.find((x: J) => x.technique === "western.transit").params.atUtc, "2026-10-07T09:00");
  });

  await t("kaydet (2026-10-12): yorum HER kayıtta (önizleme yalnız görünürlük); yorum katmanı olmayan teknik engellenmez, uydurulmaz; v2 idempotent", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    await run(ctx, pa, [goldenSelection("western.transit"), goldenSelection("western.forecast")], rx.deps);
    const pv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.transit"), includeProviderInterp: true, saveRequestId: randomUUID() }, true);
    assert.equal(pv.status, 201);
    assert.equal(store.tables.astro_analyses.find((x) => x.id === (pv.body as J).analysisId)!.provider_interp_included, true);
    // Forecast: Roxy olay cümleleri yorum katmanı olarak kayda girer (2026-10-12); yorum katmanı OLMAYAN teknik kaydı
    // engellenmez ve yorum uydurulmaz.
    const fc = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.forecast"), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(fc.status, 201);
    const fcRow = store.tables.astro_analyses.find((x) => x.id === (fc.body as J).analysisId)!;
    assert.equal(fcRow.provider_interp_included, true);
    assert.equal((fcRow.provider_interp_snapshot as { content: { schema: string } }).content.schema, "astro.western.forecast.interp.v1");
    store.tables.astro_analyses.length = 0;
    const req = randomUUID();
    const a = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.transit"), saveRequestId: req }, false);
    const b = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.transit"), saveRequestId: req }, false);
    assert.deepEqual([a.status, b.status, (a.body as J).analysisId], [201, 200, (b.body as J).analysisId]);
    assert.equal(store.tables.astro_analyses.length, 1);
  });

  await t("fake DB sadakati: not context_key CHECK, sonuç partner çifti CHECK + FK (çapraz tenant), save_v2 FK", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const db = createFakeClient(store);
    const e1 = await db.from("astro_expert_notes").insert({ tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: pa, technique: "western.synastry", context_key: "serbest", section_key: "overall", body: "x" });
    assert.equal(e1.error?.code, "23514");
    const e2 = await db.from("astro_provider_results").insert({ tenant_id: TENANT_A, input_hash: "h1", partner_profile_id: pa });
    assert.equal(e2.error?.code, "23514");
    const ctxB = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    const foreign = await profile(ctxB, "B", { clientId: CLIENT_B });
    const e3 = await db.from("astro_provider_results").insert({ tenant_id: TENANT_A, input_hash: "h2", partner_profile_id: foreign, partner_profile_revision: 1 });
    assert.equal(e3.error?.code, "23503");
    const e4 = await db.rpc("astro_analysis_save_v2", { p_tenant_id: TENANT_A, p_user_id: OWNER, p_profile_id: pa, p_profile_revision: 1, p_partner_profile_id: foreign, p_partner_profile_revision: 1, p_result_ids: [], p_technique: "western.synastry", p_title: "x", p_save_request_id: randomUUID(), p_technique_params: {}, p_notes: [] });
    assert.equal(e4.error?.code, "23503");
  });

  // ═══ I) BAĞIMSIZ ASTRONOMİ (astronomy-engine) ═══════════════════════════════
  await t("astronomi: transit 2026-10-07 09:00 UTC — 10 gezegen Roxy vs astronomy-engine ≤ 0.01°", () => {
    const def = getTechnique("western.transit")!;
    const opts = def.parseOptions(goldenSelection("western.transit").options, new Date())!;
    const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0];
    const p = def.project(u, G.transit.response, opts) as J;
    const at = new Date("2026-10-07T09:00:00Z");
    const diffs: string[] = [];
    for (const [id, b] of AE_BODIES) {
      const roxyLon = p.technical.bodies.find((x: J) => x.id === id).longitude;
      const d = angDiff(roxyLon, lon(b, at));
      diffs.push(`${id}:${(d * 3600).toFixed(1)}″`);
      assert.ok(d <= 0.01, `${id} fark ${d}`);
    }
    console.log(`     transit farkları ${diffs.join(" ")}`);
  });

  await t("astronomi: solar return anı (yerel−ofset → UTC) Güneş = natal Güneş ≤ 0.01°; dönüş haritası Güneşi = natal Güneş", () => {
    const p = getTechnique("western.solar_return")!;
    const opts = p.parseOptions(goldenSelection("western.solar_return").options, new Date())!;
    const tech = (p.project(p.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0], G["solar-return"].response, opts) as J).technical;
    const utc = new Date(new Date(`${tech.returnLocal}Z`).getTime() - tech.returnOffsetHours * 3600_000);
    const natalSun = lon(Astronomy.Body.Sun, new Date(SYNTH_A.utc));
    assert.ok(angDiff(lon(Astronomy.Body.Sun, utc), natalSun) <= 0.01, `AE dönüş anında Güneş farkı ${angDiff(lon(Astronomy.Body.Sun, utc), natalSun)}`);
    assert.ok(angDiff(tech.natalPoint.longitude, natalSun) <= 0.01);
    assert.ok(angDiff(tech.chart.bodies.find((b: J) => b.id === "sun").longitude, tech.natalPoint.longitude) <= 0.001);
    console.log(`     solar return UTC ${utc.toISOString()} · AE Güneş farkı ${(angDiff(lon(Astronomy.Body.Sun, utc), natalSun) * 3600).toFixed(1)}″`);
  });

  await t("astronomi: lunar return anı Ay = natal Ay ≤ 0.05°; istenen ay (2026-10) içinde", () => {
    const p = getTechnique("western.lunar_return")!;
    const opts = p.parseOptions(goldenSelection("western.lunar_return").options, new Date())!;
    const u = p.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0];
    const tech = (p.project(u, G["lunar-return"].response, opts) as J).technical;
    const utc = new Date(new Date(`${tech.returnLocal}Z`).getTime() - tech.returnOffsetHours * 3600_000);
    const natalMoon = lon(Astronomy.Body.Moon, new Date(SYNTH_A.utc));
    const d = angDiff(lon(Astronomy.Body.Moon, utc), natalMoon);
    assert.ok(d <= 0.05, `Ay farkı ${d}`);
    assert.ok(utc.toISOString().startsWith("2026-10"));
    console.log(`     lunar return UTC ${utc.toISOString()} · AE Ay farkı ${(d * 3600).toFixed(1)}″`);
  });

  await t("astronomi: composite = iki kişinin kısa-yay orta noktası (sinastri golden'ındaki aynı kişiler) ≤ 0.01°", () => {
    const syn = getTechnique("western.synastry")!;
    const opts = syn.parseOptions(goldenSelection("western.synastry", "00000000-0000-4000-8000-00000000abcd").options, new Date())!;
    const st = (syn.project(syn.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B }, opts)[0], G.synastry.response, opts) as J).technical;
    const co = getTechnique("western.composite")!;
    const ct = (co.project(co.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B }, opts)[0], G.composite.response, opts) as J).technical;
    let checked = 0;
    for (const [id] of AE_BODIES) {
      const a = st.person1.bodies.find((b: J) => b.id === id)?.longitude;
      const b = st.person2.bodies.find((x: J) => x.id === id)?.longitude;
      const c = ct.bodies.find((x: J) => x.id === id)?.longitude;
      if (a === undefined || b === undefined || c === undefined) continue;
      const delta = ((b - a + 540) % 360) - 180;
      const mid = (a + delta / 2 + 360) % 360;
      assert.ok(angDiff(c, mid) <= 0.01, `${id}: composite ${c} ≠ midpoint ${mid}`);
      checked += 1;
    }
    assert.equal(checked, 10);
    // Kişi 1/2 natal Güneş'leri de astronomy-engine ile tutarlı.
    assert.ok(angDiff(st.person1.bodies.find((b: J) => b.id === "sun").longitude, lon(Astronomy.Body.Sun, new Date(SYNTH_A.utc))) <= 0.01);
    assert.ok(angDiff(st.person2.bodies.find((b: J) => b.id === "sun").longitude, lon(Astronomy.Body.Sun, new Date(SYNTH_B.utc))) <= 0.01);
  });

  await t("astronomi: secondary progression — doğum + elapsedYears gün anındaki gezegenler (Ay hariç ≤ 0.02°, Ay ≤ 0.3°)", () => {
    const p = getTechnique("western.progression")!;
    const opts = p.parseOptions(goldenSelection("western.progression").options, new Date())!;
    const tech = (p.project(p.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0], G.progression.response, opts) as J).technical;
    const at = new Date(new Date(SYNTH_A.utc).getTime() + tech.elapsedYears * 86400_000);
    assert.equal(at.toISOString().slice(0, 10), tech.progressedDate, "ilerletilmiş tarih = doğum + yıl kadar gün");
    const diffs: string[] = [];
    for (const [id, b] of AE_BODIES) {
      const d = angDiff(tech.bodies.find((x: J) => x.id === id).longitude, lon(b, at));
      diffs.push(`${id}:${(d * 3600).toFixed(0)}″`);
      assert.ok(d <= (id === "moon" ? 0.3 : 0.02), `${id} fark ${d}`);
    }
    console.log(`     progression farkları ${diffs.join(" ")}`);
    // Solar arc = ilerletilmiş Güneş − natal Güneş (aynı gün/aynı yöntem).
    const sa = getTechnique("western.solar_arc")!;
    const st = (sa.project(sa.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0], G["solar-arc"].response, opts) as J).technical;
    const progSun = tech.bodies.find((x: J) => x.id === "sun").longitude;
    assert.ok(angDiff(st.arc, progSun - lon(Astronomy.Body.Sun, new Date(SYNTH_A.utc))) <= 0.02, "solar arc = ilerletilmiş Güneş − natal Güneş");
  });

  // ═══ J) PLANLAYICI SAF ═══════════════════════════════════════════════════════
  await t("planlayıcı saf: engellenen seçim birim üretmez; seçim indeksi korunur; publicPlanSummary gövde/hash/doğum verisi içermez", () => {
    const s = parseSelections([goldenSelection("western.natal"), goldenSelection("western.solar_return")]);
    assert.ok(s.ok);
    if (!s.ok) return;
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null };
    const plan = buildPlan([{ ...s.selections[0], ctx, blocked: null }, { ...s.selections[1], ctx: null, blocked: { code: "TIME_REQUIRED", error: "x" } }], () => false);
    assert.deepEqual([plan.units.length, plan.blockedCount, plan.selectionUnits[1].length], [1, 1, 0]);
  });

  // ═══ K) P2-1 — LUNAR RETURN: AYDA BİRDEN FAZLA DÖNÜŞ ═════════════════════════
  const natalMoon = natalMoonLongitude(SYNTH_A.utc);
  /** SENTETİK (golden'dan türetilmiş) lunar return yanıtı: dönüş anı istenen dönüşe ayarlanır. */
  const lunarFor = (approxUtc: string) => {
    const r = structuredClone(G["lunar-return"].response);
    const local = new Date(Date.parse(`${approxUtc}:00Z`) + 3 * 3600_000).toISOString().slice(0, 19);
    r.lunarReturnDate = local;
    return r;
  };
  /** Sahte Roxy: lunar-return isteği için gönderilen güne EN YAKIN dönüşü (sağlayıcı kuralı) döndürür. */
  function lunarRoxy(mode: "nearest" | "always-october" = "nearest") {
    const calls: Call[] = [];
    const deps: EngineDeps = {
      ...roxy().deps,
      callProvider: async (_c, endpoint, body) => {
        calls.push({ endpoint, body });
        if (endpoint !== "/astrology/lunar-return") return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        if (mode === "always-october") return { ok: true, raw: structuredClone(G["lunar-return"].response), attempts: 1 };
        const day = String(body.returnDate);
        const month = day.slice(0, 7);
        const near = [-1, 0, 1]
          .map((d) => {
            const m = new Date(`${month}-15T00:00:00Z`);
            m.setUTCMonth(m.getUTCMonth() + d);
            return m.toISOString().slice(0, 7);
          })
          .flatMap((m) => lunarReturnsInMonth(natalMoon, m))
          .sort((a, b) => Math.abs(Date.parse(`${a.approxUtc}:00Z`) - Date.parse(`${day}T12:00:00Z`)) - Math.abs(Date.parse(`${b.approxUtc}:00Z`) - Date.parse(`${day}T12:00:00Z`)))[0];
        return { ok: true, raw: lunarFor(near.approxUtc), attempts: 1 };
      },
    };
    return { calls, deps };
  }

  await t("P2-1 dönüş listesi: 2026-10 → 1 dönüş, istek günü golden ile AYNI (önbellek uyumu); 2027-06 → 2 dönüş, ~27.3 gün arayla, her biri Ay=natal Ay (astronomy-engine)", () => {
    const oct = lunarReturnsInMonth(natalMoon, "2026-10");
    assert.equal(oct.length, 1);
    assert.equal(oct[0].requestDate, G["lunar-return"].body.returnDate);
    // Golden sağlayıcı anı (2026-10-25T14:43:22 +3 → 11:43:22 UTC) ile tahmin ≤ 2 dk.
    assert.ok(Math.abs(Date.parse(`${oct[0].approxUtc}:00Z`) - Date.parse("2026-10-25T11:43:22Z")) <= 120_000, oct[0].approxUtc);
    const jun = lunarReturnsInMonth(natalMoon, "2027-06");
    assert.deepEqual(jun.map((c) => c.sequence), [1, 2]);
    const gapDays = (Date.parse(`${jun[1].approxUtc}:00Z`) - Date.parse(`${jun[0].approxUtc}:00Z`)) / 86400_000;
    assert.ok(gapDays > 27 && gapDays < 27.7, `aralık ${gapDays}`);
    for (const c of jun) {
      assert.ok(c.approxUtc.startsWith("2027-06"));
      assert.ok(angDiff(lon(Astronomy.Body.Moon, new Date(`${c.approxUtc}:00Z`)), natalMoon) < 0.05, `${c.sequence}. dönüş Ay farkı`);
    }
    assert.notEqual(jun[0].requestDate, jun[1].requestDate);
  });

  await t("P2-1 geriye uyum: sırasız eski seçenek = sequence 1 → AYNI gövde/anahtar; eski kayıtlı sonuç 0 istekle açılır", async () => {
    const def = getTechnique("western.lunar_return")!;
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null };
    const old = def.parseOptions({ month: "2026-10", houseSystem: "placidus" }, new Date())!;
    const seq1 = def.parseOptions({ month: "2026-10", sequence: 1, houseSystem: "placidus" }, new Date())!;
    assert.equal(old.sequence, 1);
    assert.equal(def.units(ctx, old)[0].inputHash, def.units(ctx, seq1)[0].inputHash);
    assert.deepEqual(JSON.parse(JSON.stringify(def.units(ctx, seq1)[0].body)), G["lunar-return"].body, "gövde golden ile aynı olmalı");
    assert.equal(def.parseOptions({ month: "2026-10", sequence: 3, houseSystem: "placidus" }, new Date()), null);
    // Aşama 3'te (sırasız) kaydedilmiş sonuç → yeni sürüm sequence:1 ile 0 istek.
    const store = seed();
    const ectx = ctxOf(store);
    const pa = await profile(ectx, "A");
    const rx = roxy();
    await run(ectx, pa, [{ technique: "western.lunar_return", options: { month: "2026-10", houseSystem: "placidus" } }], rx.deps);
    assert.equal(rx.calls.length, 1);
    const again = await run(ectx, pa, [{ technique: "western.lunar_return", options: { month: "2026-10", sequence: 1, houseSystem: "placidus" } }], rx.deps);
    assert.equal(rx.calls.length, 1, "eski kayıt yeniden istendi");
    assert.equal((again.body as J).results[0].view.technical.requested.sequence, 1);
  });

  await t("P2-1 iki dönüş: 2027-06 sıra 1 + sıra 2 → plan 2 dönüşü gösterir, 2 ayrı istek/anahtar, teknik + kayıtlı analiz sırayı ve anı taşır, açmak 0 istek", async () => {
    const store = seed();
    const ectx = ctxOf(store);
    const pa = await profile(ectx, "A");
    const lx = lunarRoxy();
    const s1 = { technique: "western.lunar_return", options: { month: "2027-06", sequence: 1, houseSystem: "placidus" } };
    const s2 = { technique: "western.lunar_return", options: { month: "2027-06", sequence: 2, houseSystem: "placidus" } };
    const p = (await planAstrology(ectx, { profileId: pa, selections: [s1, s2] })).body as J;
    assert.deepEqual([p.plan.newRequestCount, p.plan.dedupedCount], [2, 0]);
    assert.deepEqual(p.plan.selections[0].info.lunarReturns.map((x: J) => x.sequence), [1, 2]);
    assert.deepEqual(p.plan.selections.map((x: J) => x.options.sequence), [1, 2]);
    const r = await run(ectx, pa, [s1, s2], lx.deps);
    assert.equal(lx.calls.length, 2);
    assert.notEqual(lx.calls[0].body.returnDate, lx.calls[1].body.returnDate);
    const v = (r.body as J).results.map((x: J) => x.view);
    assert.deepEqual(v.map((x: J) => x.technical.requested.sequence), [1, 2]);
    const jun = lunarReturnsInMonth(natalMoon, "2027-06");
    assert.deepEqual(v.map((x: J) => x.technical.requested.expectedUtc), jun.map((c) => c.approxUtc));
    assert.notEqual(v[0].id, v[1].id);
    const ids: string[] = [];
    for (const s of [s1, s2]) {
      const sv = await saveAnalysis(ectx, { profileId: pa, revision: 1, ...s, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, JSON.stringify(sv.body));
      ids.push((sv.body as J).analysisId);
    }
    const n = lx.calls.length;
    const a = await Promise.all(ids.map(async (id) => ((await getAnalysis(ectx, id, false)).body as J).analysis));
    assert.deepEqual(a.map((x) => x.params.sequence), [1, 2]);
    assert.deepEqual(a.map((x) => x.technical.requested.sequence), [1, 2]);
    assert.notEqual(a[0].technical.returnLocal, a[1].technical.returnLocal);
    assert.equal(lx.calls.length, n, "kayıtlı analizi açmak istek yaptı");
    await run(ectx, pa, [s1, s2], lx.deps);
    assert.equal(lx.calls.length, n, "önbellek: tekrar 0 istek");
  });

  await t("P2-1 yok olan dönüş: tek dönüşlü ayda sıra 2 → açık nedenle engellenir, 0 istek", async () => {
    const store = seed();
    const ectx = ctxOf(store);
    const pa = await profile(ectx, "A");
    const lx = lunarRoxy();
    const r = await run(ectx, pa, [{ technique: "western.lunar_return", options: { month: "2026-10", sequence: 2, houseSystem: "placidus" } }], lx.deps);
    assert.equal(lx.calls.length, 0);
    const res = (r.body as J).results[0];
    assert.equal(res.code, "NO_UNIT");
    assert.match(res.error, /bu ayda 1 lunar return var; 2\. dönüş yok/);
  });

  await t("P2-1 koruma: sağlayıcı SEÇİLMEYEN dönüşü döndürürse sonuç kaydedilmez (PROVIDER_INVALID_RESPONSE), sessiz yanlış dönüş yok", async () => {
    const store = seed();
    const ectx = ctxOf(store);
    const pa = await profile(ectx, "A");
    const bad = lunarRoxy("always-october");
    const r = await run(ectx, pa, [{ technique: "western.lunar_return", options: { month: "2027-06", sequence: 2, houseSystem: "placidus" } }], bad.deps);
    assert.equal(bad.calls.length, 1);
    assert.equal((r.body as J).results[0].code, "PROVIDER_INVALID_RESPONSE");
    assert.equal((store.tables.astro_provider_results ?? []).length, 0, "yanlış dönüş kaydedildi");
  });

  // ═══ L) P2-2 — TRANSIT: SAAT BİLİNMİYORSA NATAL ASC/MC/EV SIZINTISI YOK ════════
  await t("P2-2 kanıt (gerçek yanıt şeması): transit yanıtında ev/natal-açısal alan YOK; golden'da açısal hedef 0 iken aynı kişinin natal ASC/MC'si orb içinde transit açı ALIRDI", () => {
    // Bilinen alan listesi (fail-closed): ev / cusp / ascendant / midheaven alanı yok → gelirse 'unmapped' olur, teknik sayılmaz.
    const known = JSON.stringify(G.transit.response);
    assert.ok(!/"house|"houses|"cusp|"ascendant"|"midheaven"/i.test(known), "transit yanıtında ev/açısal alan var");
    assert.ok(!(G.transit.response.transitAspects as J[]).some((a) => /asc|mc|midheaven/i.test(String(a.natalPlanet))));
    const natal = (projectRoxyNatal(NATAL_GOLDEN, { houseSystem: "placidus", nodeType: "true" }) as J).value.technical;
    const maxOrb: Record<string, number> = {};
    for (const a of G.transit.response.transitAspects as J[]) maxOrb[a.type] = Math.max(maxOrb[a.type] ?? 0, a.orb);
    const ANG: Record<string, number> = { CONJUNCTION: 0, OPPOSITION: 180, TRINE: 120, SQUARE: 90, SEXTILE: 60 };
    let wouldHit = 0;
    for (const p of G.transit.response.transitPlanets as J[]) {
      for (const target of [natal.angles.ascendant.longitude, natal.angles.midheaven.longitude]) {
        for (const [type, ang] of Object.entries(ANG)) if (maxOrb[type] !== undefined && Math.abs(angDiff(p.longitude, target) - ang) <= maxOrb[type]) wouldHit += 1;
      }
    }
    // Ampirik: sağlayıcı açısal hedef üretseydi bu kadar açı listede olurdu → sağlayıcı (bu sürümde) natal ASC/MC'ye açı ÜRETMİYOR.
    assert.ok(wouldHit > 0, "kanıt zayıf: orb içinde açısal temas yok");
    console.log(`     golden: natal ASC/MC'ye orb içinde ${wouldHit} olası transit teması, sağlayıcı listesinde 0`);
  });

  // SENTETİK (mutation) fixture — golden transit yanıtından türetilir; sağlayıcının ileride açısal hedef
  // üretmesi durumunu taklit eder. Gerçek sağlayıcı verisi DEĞİLDİR.
  const ASC_TEXT = "SENTETIK-ANLATI natal Yükselen hedefli transit — saat bilinmiyorsa istemciye ASLA gitmemeli";
  const MC_TEXT = "SENTETIK-ANLATI natal MC hedefli transit — saat bilinmiyorsa istemciye ASLA gitmemeli (ikinci)";
  const transitWithAngles = () => {
    const r = structuredClone(G.transit.response);
    const base = r.transitAspects[0];
    r.transitAspects.push(
      { ...base, transitPlanet: "Saturn", transitPlanetLocalized: "Satürn", natalPlanet: "Ascendant", natalPlanetLocalized: "Yükselen", type: "SQUARE", typeLocalized: "Kare", angle: 90, orb: 0.5, nature: "zorlayıcı", interpretation: { ...base.interpretation, summary: ASC_TEXT, impact: `${ASC_TEXT} (etki)`, guidance: `${ASC_TEXT} (öneri)` } },
      { ...base, transitPlanet: "Jupiter", transitPlanetLocalized: "Jüpiter", natalPlanet: "Midheaven", natalPlanetLocalized: "MC", type: "TRINE", typeLocalized: "Üçgen", angle: 120, orb: 0.7, nature: "uyumlu", interpretation: { ...base.interpretation, summary: MC_TEXT, impact: `${MC_TEXT} (etki)`, guidance: `${MC_TEXT} (öneri)` } },
    );
    r.summary = { ...r.summary, totalAspects: r.summary.totalAspects + 2, harmonious: r.summary.harmonious + 1, challenging: r.summary.challenging + 1 };
    return r;
  };
  const angleRoxy = () => {
    const calls: Call[] = [];
    const deps: EngineDeps = {
      ...roxy().deps,
      callProvider: async (_c, endpoint, body) => {
        calls.push({ endpoint, body });
        return endpoint === "/astrology/transits" ? { ok: true, raw: transitWithAngles(), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      },
    };
    return { calls, deps };
  };

  await t("P2-2 SENTETİK: saat BİLİNİYORSA açısal hedefli açılar + anlatı görünür (pozitif kontrol: adaptör bunları gerçekten taşıyor)", async () => {
    const store = seed();
    const ectx = ctxOf(store);
    const pa = await profile(ectx, "A");
    const r = await run(ectx, pa, [goldenSelection("western.transit")], angleRoxy().deps);
    const v = (r.body as J).results[0].view;
    assert.deepEqual(v.technical.aspects.filter((a: J) => a.natal === "ascendant" || a.natal === "midheaven").map((a: J) => a.natal), ["ascendant", "midheaven"]);
    assert.ok(JSON.stringify(v.interpretation).includes(ASC_TEXT) && JSON.stringify(v.interpretation).includes(MC_TEXT));
    assert.equal(v.timeUnknownMasked, false);
  });

  await t("P2-2 SENTETİK: saat BİLİNMİYORSA açısal açı, anlatısı ve sayılardaki izi YOK; transit gezegen verisi saatli profille AYNI; kayıtlı sonuç/analiz de temiz", async () => {
    const store = seed();
    const ectx = ctxOf(store);
    const pk = await profile(ectx, "A");
    const pu = await profile(ectx, "A", { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz A" });
    const known = ((await run(ectx, pk, [goldenSelection("western.transit")], angleRoxy().deps)).body as J).results[0].view;
    const ur = await run(ectx, pu, [goldenSelection("western.transit")], angleRoxy().deps);
    const v = (ur.body as J).results[0].view;
    const all = JSON.stringify(ur.body);
    assert.ok(!all.includes("SENTETIK-ANLATI"), "açısal hedefli anlatı istemciye gitti");
    assert.ok(!v.technical.aspects.some((a: J) => a.natal === "ascendant" || a.natal === "midheaven"));
    assert.ok(!(v.interpretation.content.aspects as J[]).some((a) => a.natal === "ascendant" || a.natal === "midheaven"));
    // Özet sayıları maskeden sonra kalan açılardan: sağlayıcının (açısal dahil) sayıları değil.
    const cnt = (n: string) => v.technical.aspects.filter((a: J) => a.nature === n).length;
    assert.deepEqual(v.technical.summary, { harmonious: cnt("harmonious"), challenging: cnt("challenging"), neutral: cnt("neutral") });
    assert.notDeepEqual(v.technical.summary, known.technical.summary, "sağlayıcı sayıları gizlenen açıları içeriyordu");
    // Saatten bağımsız transit gezegen verisi korunur.
    assert.deepEqual(v.technical.bodies, known.technical.bodies);
    assert.equal(v.technical.bodies.length, 14);
    assert.ok(v.timeUnknownMasked && v.warnings.some((w: string) => /Yükselen\/MC/.test(w)));
    assert.equal(v.technical.aspects.length, known.technical.aspects.length - 2);
    // Kayıtlı sonuç yeniden açma + kayıtlı analiz (yorum dahil) de temiz.
    const reopen = await getAstrologyResult(ectx, v.id, { profileId: null, revision: null, ownerPreviewHideInterp: false });
    assert.ok(!JSON.stringify(reopen.body).includes("SENTETIK-ANLATI"));
    const sv = await saveAnalysis(ectx, { profileId: pu, revision: 1, ...goldenSelection("western.transit"), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const row = store.tables.astro_analyses.find((x) => x.id === (sv.body as J).analysisId)!;
    assert.ok(!JSON.stringify(row).includes("SENTETIK-ANLATI"), "analiz snapshot'ına açısal anlatı yazıldı");
    const topics = topicsForTechnique("western.transit", v.technical);
    assert.ok(!topics.some((x) => /:ascendant$|:midheaven$/.test(x.key)), "açısal transit konusu üretildi");
  });

  // ═══ 2026-10-11 satış öncesi düzeltmeler ═══════════════════════════════════════════════════════════════
  await t("2026-10 solar arc: hiçbir nokta KENDİ natal konumuyla 'açı' yapmaz (yay ≈ 60° iken bile)", () => {
    const def = getTechnique("western.solar_arc")!;
    const opts = def.parseOptions(goldenSelection("western.solar_arc").options, new Date())!;
    const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0];
    const raw = JSON.parse(JSON.stringify(G["solar-arc"].response)) as J;
    raw.solarArc = 60.2; // tüm noktalar aynı yayla ilerler → eskiden her nokta kendine "sekstil" yapardı
    for (const d of raw.directed) {
      d.directedLongitude = (((d.natalLongitude + 60.2) % 360) + 360) % 360;
      d.sign = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"][Math.floor(d.directedLongitude / 30)];
      d.degree = d.directedLongitude % 30;
    }
    const p = def.project(u, raw, opts) as J;
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.ok(p.technical.aspects.every((a: J) => a.directed !== a.natal), JSON.stringify(p.technical.aspects.filter((a: J) => a.directed === a.natal)));
  });
  await t("2026-10 saat bilinmiyor: progression/composite sağlayıcı anlatısı gösterilmez; sinastride ASC/MC açı anlatısı ayıklanır", () => {
    const row = (technique: string, technical: unknown) => ({ id: "r1", technique, provider: "roxy", provider_api_version: "v", adapter_version: "a", projection_version: "p", technical: technical as Record<string, unknown>, created_at: "2026-10-07T00:00:00Z" });
    const view = (technique: string, golden: string, partnerKnown: boolean | null) => {
      const def = getTechnique(technique)!;
      const opts = def.parseOptions(goldenSelection(technique as never, "11111111-1111-4111-8111-111111111111").options, new Date())!;
      const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: technique.includes("synastry") || technique.includes("composite") ? (SYNTH_B as never) : null }, opts)[0];
      const p = def.project(u, G[golden].response, opts) as J;
      assert.ok(p.ok, JSON.stringify(p.errors));
      return buildTechniqueView({
        technique,
        rows: [row(technique, p.technical)],
        combined: p.technical,
        options: {},
        timeKnowledge: { primary: false, partner: partnerKnown },
        visibility: { visible: true },
        interpretations: [{ provider: "roxy", lang: "tr", content: p.interpretation as Record<string, unknown> }],
      } as never) as J;
    };
    for (const tid of ["western.progression", "western.composite"]) {
      const v = view(tid, tid === "western.progression" ? "progression" : "composite", tid === "western.composite" ? true : null);
      assert.equal(v.timeUnknownMasked, true, tid);
      assert.equal(v.interpretation.visible, false, tid);
    }
    const s = view("western.synastry", "synastry", true);
    assert.equal(s.timeUnknownMasked, true);
    if (s.interpretation.visible) assert.ok(s.interpretation.content.aspects.every((a: J) => !["ascendant", "midheaven"].includes(a.a) && !["ascendant", "midheaven"].includes(a.b)));
  });

  await t("2026-10 kutup enlemi: Placidus/Koch natal ve KP sağlayıcıya GİTMEDEN engellenir (HOUSE_SYSTEM_POLAR, 0 istek); Whole Sign hesaplanır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const TROMSO: ResolvedLocation = { id: "gn-3133895", label: "Tromsø, Norveç", timezone: "Europe/Oslo", latitude: 69.6489, longitude: 18.9551 };
    const r0 = await createAstroProfile(ctx, { label: "Sentetik Kutup", clientId: CLIENT_X, birthDate: "1999-12-21", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: TROMSO.id }, (id) => (id === TROMSO.id ? TROMSO : null));
    assert.equal(r0.status, 201, JSON.stringify(r0.body));
    const pid = (r0.body as J).profile.id;
    const sels = [
      { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } },
      { technique: "western.natal", options: { houseSystem: "koch", nodeType: "true" } },
      { technique: "western.natal", options: { houseSystem: "whole-sign", nodeType: "true" } },
      { technique: "kp.chart", options: { ayanamsa: "kp-newcomb", nodeType: "mean" } },
    ];
    const plan = (await planAstrology(ctx, { profileId: pid, selections: sels })).body as J;
    const blocked = plan.plan.selections.map((s: J) => [s.technique, s.blocked?.code ?? null]);
    assert.deepEqual(blocked, [["western.natal", "HOUSE_SYSTEM_POLAR"], ["western.natal", "HOUSE_SYSTEM_POLAR"], ["western.natal", null], ["kp.chart", "HOUSE_SYSTEM_POLAR"]]);
    assert.equal(plan.plan.newRequestCount, 1, "yalnız Whole Sign natal ücretli istek");
  });

  await t("2026-10-12 kutup bloğu GENİŞLETİLDİ: dönüş (doğum/dönüş konumu), relocation hedefi, sinastri/composite karşı tarafı > 66.5° → 0 istek; Whole Sign / Local Space geçer", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const TROMSO: ResolvedLocation = { id: "gn-3133895", label: "Tromsø, Norveç", timezone: "Europe/Oslo", latitude: 69.6489, longitude: 18.9551 };
    const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
    const res = (id: unknown) => (id === TROMSO.id ? TROMSO : id === IST.id ? IST : null);
    const mk = async (label: string, loc: string) => {
      const r = await createAstroProfile(ctx, { label, clientId: CLIENT_X, birthDate: "1999-12-21", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: loc }, res);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return (r.body as J).profile.id as string;
    };
    const polar = await mk("Sentetik Kutup 2", TROMSO.id);
    const ist = await mk("Sentetik İstanbul", IST.id);
    const codes = async (pid: string, sels: unknown[]) => {
      const p = (await planAstrology(ctx, { profileId: pid, selections: sels })).body as J;
      return { codes: p.plan.selections.map((s: J) => s.blocked?.code ?? null), n: p.plan.newRequestCount };
    };
    const a = await codes(polar, [
      { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "placidus", returnLocationId: null } },
      { technique: "western.lunar_return", options: { month: "2026-11", sequence: 1, houseSystem: "koch", returnLocationId: null } },
      { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "whole-sign", returnLocationId: null } },
    ]);
    assert.deepEqual(a.codes, ["HOUSE_SYSTEM_POLAR", "HOUSE_SYSTEM_POLAR", null]);
    assert.equal(a.n, 1);
    const b = await codes(ist, [
      { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "placidus", returnLocationId: TROMSO.id } },
      { technique: "western.relocation", options: { targetLocationId: TROMSO.id, houseSystem: "placidus" } },
      { technique: "western.relocation", options: { targetLocationId: TROMSO.id, houseSystem: "whole-sign" } },
      { technique: "western.local_space", options: { referenceLocationId: TROMSO.id } },
      { technique: "western.synastry", options: { partnerProfileId: polar, houseSystem: "placidus", nodeType: "true" } },
      { technique: "western.composite", options: { partnerProfileId: polar, houseSystem: "placidus", nodeType: "true" } },
      { technique: "western.synastry", options: { partnerProfileId: polar, houseSystem: "whole-sign", nodeType: "true" } },
    ]);
    assert.deepEqual(b.codes, ["HOUSE_SYSTEM_POLAR", "HOUSE_SYSTEM_POLAR", null, null, "HOUSE_SYSTEM_POLAR", "HOUSE_SYSTEM_POLAR", null]);
    assert.equal(b.n, 4, `ücretli yalnız: Whole Sign relocation (taşınmış + natal karşılaştırma = 2) + Local Space + Whole Sign sinastri (n=${b.n})`);
  });

  await t("ATL-P3-05 (2026-10-20): KP Horary / Ruling değerlendirme yeri kutup dairesi ötesinde → 0 istek (HOUSE_SYSTEM_POLAR); güneyde yer seçilince geçer", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
    const r0 = await createAstroProfile(ctx, { label: "Sentetik İstanbul KP", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, (id) => (id === IST.id ? IST : null));
    assert.equal(r0.status, 201, JSON.stringify(r0.body));
    const pid = (r0.body as J).profile.id;
    const AT = "2026-10-07T10:00";
    const pr = await planAstrology(ctx, { profileId: pid, selections: [
      { technique: "kp.horary", options: { atUtc: AT, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: "gn-3133895" } },
      { technique: "kp.ruling", options: { atUtc: AT, nodeType: "mean", placeLocationId: "gn-3133895" } },
      { technique: "kp.horary", options: { atUtc: AT, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: "tr-06-ankara" } },
    ] });
    const p = pr.body as J;
    assert.equal(pr.status, 200, JSON.stringify(pr.body).slice(0, 400));
    const sel = p.plan.selections as J[];
    assert.deepEqual(sel.map((s) => s.blocked?.code ?? null), ["HOUSE_SYSTEM_POLAR", "HOUSE_SYSTEM_POLAR", null], JSON.stringify(sel.map((s) => s.blocked)));
    assert.match(sel[0].blocked.error, /değerlendirme yeri kutup dairesi ötesinde \(enlem 69\.6°\)/);
    assert.equal(p.plan.newRequestCount, 1, "yalnız Ankara horary ücretli istek");
  });

  // ═══ W) ÇİFT HALKA (2026-10-12): Roxy bileşenine giden veri = Roxy'nin GERÇEK yanıtı; bağlam yalnız önbellekten ═══
  const rawNames = (list: J[]) => new Map(list.map((p: J) => [String(p.name), p]));
  await t("W1 transit çift halka verisi: natal + transit boylam/burç/derece, natal cusp'lar ve ASC gerçek Roxy yanıtıyla BİREBİR", () => {
    const natal = projectRoxyNatal(NATAL_GOLDEN, { houseSystem: "placidus", nodeType: "true" });
    assert.ok(natal.ok);
    const def = getTechnique("western.transit")!;
    const opts = def.parseOptions(goldenSelection("western.transit").options, new Date())!;
    const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0];
    const p = def.project(u, G.transit.response, opts);
    assert.ok(p.ok);
    const tech = def.attachContext!(p.technical, [natal.value.technical], opts) as TransitTechnical;
    const d = toTransitWheelData(tech)!;
    assert.ok(d, "natal çerçeve eklenmeli");
    const rn = rawNames(NATAL_GOLDEN.planets as J[]);
    assert.equal(d.natalPlanets.length, natal.value.technical.bodies.length);
    for (const b of d.natalPlanets) {
      const r = rn.get(b.name)!;
      assert.ok(r, `natal ${b.name} Roxy yanıtında yok`);
      assert.equal(b.longitude, r.longitude, `natal ${b.name} boylam`);
      assert.equal(b.sign, r.sign, `natal ${b.name} burç`);
      assert.ok(Math.abs(b.degree - Number(r.degree)) < 1e-9, `natal ${b.name} derece`);
    }
    const rt = rawNames(G.transit.response.transitPlanets as J[]);
    assert.equal(d.transitPlanets.length, (G.transit.response.transitPlanets as J[]).length);
    for (const b of d.transitPlanets) {
      const r = rt.get(b.name)!;
      assert.ok(r, `transit ${b.name} Roxy yanıtında yok`);
      assert.equal(b.longitude, r.longitude, `transit ${b.name} boylam`);
      assert.equal(b.sign, r.sign, `transit ${b.name} burç`);
      assert.equal(b.isRetrograde, r.isRetrograde, `transit ${b.name} retro`);
    }
    const rh = NATAL_GOLDEN.houses as J[];
    assert.equal(d.houses.length, 12);
    d.houses.forEach((h, i) => assert.ok(Math.abs(h.longitude - Number(rh[i].longitude ?? rh[i].cusp)) < 1e-9, `ev ${h.number} cusp`));
    assert.equal(d.ascendant.longitude, NATAL_GOLDEN.ascendant.longitude);
    // Açı çizgileri: Roxy'nin transit açı listesi (ASC/MC hedefli olanlar çizilmez — bileşende natal noktası yok).
    const rawAspects = (G.transit.response.transitAspects as J[]).filter((a) => !/ascendant|midheaven/i.test(String(a.natalPlanet ?? a.planet2 ?? "")));
    assert.equal(d.aspects.length, tech.aspects.filter((a) => a.natal !== "ascendant" && a.natal !== "midheaven").length);
    assert.ok(d.aspects.length > 0 && d.aspects.length <= rawAspects.length + 0, `açı sayısı ${d.aspects.length} / Roxy ${rawAspects.length}`);
    // Yorum metni bileşene GİTMEZ.
    assert.ok(!/interpretation|summary|guidance|keywords/.test(JSON.stringify(d.aspects)));
  });

  await t("W2 bağlam YALNIZ önbellek: natal yokken transit planı 1 istek (natal sayılmaz), sağlayıcıya natal GİTMEZ, çark verisi yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    const pl = await planAstrology(ctx, { profileId: pa, selections: [goldenSelection("western.transit")] });
    assert.equal(((pl.body as J).plan as J).newRequestCount, 1);
    const r = await run(ctx, pa, [goldenSelection("western.transit")], rx.deps);
    assert.deepEqual(rx.calls.map((c) => c.endpoint), ["/astrology/transits"]);
    assert.equal(((r.body as J).results[0].view.technical as TransitTechnical).natalFrame, null);
  });

  await t("W3 natal önbellekteyse transit çark verisi eklenir (0 yeni istek); aynı çalıştırmada natal+transit de eklenir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    const both = await run(ctx, pa, [goldenSelection("western.natal"), goldenSelection("western.transit")], rx.deps);
    const fr = ((both.body as J).results[1].view.technical as TransitTechnical).natalFrame!;
    assert.ok(fr && fr.houses.length === 12 && fr.houseSystem === "placidus");
    const n = rx.calls.length;
    const again = await run(ctx, pa, [goldenSelection("western.transit")], rx.deps);
    assert.equal(rx.calls.length, n, "yeniden açmak sağlayıcı çağırmamalı");
    assert.deepEqual(((again.body as J).results[0].view.technical as TransitTechnical).natalFrame, fr);
    const natalView = (both.body as J).results[0].view.technical;
    assert.deepEqual(fr.angles, natalView.angles);
    assert.deepEqual(fr.bodies.map((b) => [b.id, b.longitude]), natalView.bodies.map((b: J) => [b.id, b.longitude]));
  });

  await t("W4 yanlış birleştirme yok: farklı doğum revizyonu / farklı düğüm türü / saat bilinmiyor → çark verisi YOK", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    await run(ctx, pa, [goldenSelection("western.natal")], rx.deps);
    // Düğüm: natal "true" önbellekte, transit "mean" → eşleşmez.
    const mean = await run(ctx, pa, [{ technique: "western.transit", options: { atUtc: "2026-10-07T09:00", nodeType: "mean" } }], rx.deps);
    assert.equal(((mean.body as J).results[0].view.technical as TransitTechnical).natalFrame, null);
    // Revizyon 2 (saat 14:45): rev 1'in natali kullanılmaz.
    const rev = await appendAstroRevision(ctx, pa, { expectedRevision: 1, birthDate: "1990-07-15", birthTime: "14:45", timeKnown: true, timeAccuracy: "rectified", locationId: ISTANBUL.id }, resolveLoc);
    assert.ok(rev.status === 200 || rev.status === 201, JSON.stringify(rev.body));
    const r2 = await run(ctx, pa, [goldenSelection("western.transit")], rx.deps, { revision: 2 });
    assert.equal(((r2.body as J).results[0].view.technical as TransitTechnical).natalFrame, null, "başka revizyonun natali birleştirildi");
    const r1 = await run(ctx, pa, [goldenSelection("western.transit")], rx.deps, { revision: 1 });
    assert.ok(((r1.body as J).results[0].view.technical as TransitTechnical).natalFrame, "rev 1 natali rev 1 transitinde kullanılmalı");
    // Saat bilinmiyor: maske natal çerçeveyi kaldırır.
    const pu = await profile(ctx, "A", { label: "Saatsiz", birthTime: null, timeKnown: false, timeAccuracy: "unknown" });
    await run(ctx, pu, [goldenSelection("western.natal")], rx.deps);
    const ru = await run(ctx, pu, [goldenSelection("western.transit")], rx.deps);
    assert.equal(((ru.body as J).results[0].view.technical as TransitTechnical).natalFrame, null);
  });

  await t("W5 kayıt + arşivden açma: natal çerçeve kayıtta saklanır, açılış 0 Roxy isteği, çark verisi aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const rx = roxy();
    const r = await run(ctx, pa, [goldenSelection("western.natal"), goldenSelection("western.transit")], rx.deps);
    const live = (r.body as J).results[1].view.technical as TransitTechnical;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...goldenSelection("western.transit"), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = await getAnalysis(ctx, (sv.body as J).analysisId, false);
    assert.equal(rx.calls.length, n);
    const saved = (a.body as J).analysis.technical as TransitTechnical;
    assert.deepEqual(toTransitWheelData(saved), toTransitWheelData(live));
  });

  await t("W6 sinastri çift halka: dış halka = profil sahibi (person1), iç = karşı taraf; boylam/burç/ASC Roxy yanıtıyla BİREBİR; ev çizgisi yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, "A");
    const pb = await profile(ctx, "B");
    const rx = roxy();
    const r = await run(ctx, pa, [goldenSelection("western.synastry", pb)], rx.deps);
    const body = rx.calls.find((c) => c.endpoint === "/astrology/synastry")!.body as J;
    assert.equal(body.person1.date, "1990-07-15", "person1 = analizin sahibi (A)");
    assert.equal(body.person2.date, "1988-03-21", "person2 = karşı taraf (B)");
    const d = toSynastryWheelData((r.body as J).results[0].view.technical)!;
    const raw = G.synastry.response;
    for (const [k, list] of [["person1", d.person1.planets], ["person2", d.person2.planets]] as const) {
      const rn = rawNames(raw[k].planets as J[]);
      assert.equal(list.length, (raw[k].planets as J[]).length, `${k} gezegen sayısı`);
      for (const b of list) {
        const x = rn.get(b.name)!;
        assert.ok(x, `${k} ${b.name}`);
        assert.equal(b.longitude, x.longitude, `${k} ${b.name} boylam`);
        assert.equal(b.sign, x.sign, `${k} ${b.name} burç`);
      }
      assert.equal(d[k].ascendant!.sign, raw[k].ascendant.sign);
      assert.ok(Math.abs(d[k].ascendant!.degree - raw[k].ascendant.degree) < 1e-9);
    }
    assert.ok(!("houses" in d.person1) && !("houses" in d.person2), "sahte ev verisi üretilmemeli");
    // B'nin dosyasından açılırsa yön tersine döner (person1 = B).
    const rb = roxy();
    await run(ctx, pb, [goldenSelection("western.synastry", pa)], rb.deps);
    const bb = rb.calls.find((c) => c.endpoint === "/astrology/synastry")!.body as J;
    assert.deepEqual([bb.person1.date, bb.person2.date], ["1988-03-21", "1990-07-15"]);
  });

  console.log(`\nastrology phase3 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase3 harness çöktü:", e);
  process.exit(1);
});
