/**
 * ASTROLOJİ — GEZEGEN DÖNÜŞLERİ harness'i (2026-10-22; western.planetary_return, POST /astrology/planetary-returns).
 *
 * Kaynak: 4 GERÇEK sağlayıcı yanıtı (fixtures/golden/pr-*.json; sentetik kişi A 1990-07-15 14:30 İstanbul +3) + BAĞIMSIZ
 * astronomy-engine doğrulaması. Bu harness gerçek sağlayıcıya çağrı YAPMAZ.
 *
 *   A) golden ↔ projeksiyon (yorum ayrı katman, bilinmeyen alan 0, approximateCycle yok sayılır)
 *   B) bağımsız doğrulama: dönüş anında transit boylam = natal boylam (±0,01°), natal boylam doğum anıyla (±0,01°), seçilen
 *      kavuşumla zaman farkı; retro döngüsü (Jüpiter 2025–26, 3 kavuşum; sağlayıcı SEÇİLEN 2. geri kavuşumu verdi);
 *      Merkür geosantrik ~yıllık (belgedeki "~88 gün" değil); Satürn ~29,5 / Jüpiter ~11,9 yıl aralık mantığı
 *   C) fail-closed (bozuk / başka kavuşum / tutarsız boylam / yankı farkı / eksik alan)
 *   D) motor: plan (1 yeni istek) → çalıştır (gövde golden ile BİREBİR) → önbellek (0 istek; farklı hedef tarih aynı kavuşum = aynı
 *      anahtar) · kavuşum seçimi (planInfo) · olmayan kavuşum → NO_UNIT · saat yok → TIME_REQUIRED · relocated (Londra)
 *   E) kaydet → aç (0 istek) · Word/PDF rapor metni · yetki (başka tenant / uzman 404; yorum kapısı + sızma) · not bağlamı · konu
 *   F) mevcut tekniklerin girdi özeti DEĞİŞMEDİ (sabit hash) · UI yardımcıları
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/planetary-return.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, parseNoteContext, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, getWorkspace, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { planetaryReturnBody, projectRoxyPlanetaryReturn, ROXY_PLANETARY_RETURN, type PlanetaryReturnExpect } from "@/lib/astrology/providers/roxy/planetaryReturn";
import { natalPlanetLongitude, planetaryReturnCluster, planetaryReturnNeighbors, planetLongitudeAt, type PlanetaryReturnPlanet } from "@/lib/astrology/engine/planetaryReturnDate";
import { localizePlanetNamesTr } from "@/lib/astrology/model/westernPlanetaryReturn";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { topicsForTechnique, isSectionKeyForTechnique } from "@/lib/astrology/topics/index";
import { buildSelections, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import { solarReturnBody, lunarReturnBody, type BirthPoint } from "@/lib/astrology/providers/roxy/requests";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const GDIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) as { endpoint: string; body: Record<string, unknown>; selection: { natalLongitude: number; cluster: J[]; crossing: number }; response: J };
const G = { saturn: load("pr-saturn-next"), jupiter: load("pr-jupiter-retro"), mars: load("pr-mars-london"), mercury: load("pr-mercury-ws") };
const NAMES = Object.keys(G) as (keyof typeof G)[];
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
const BIRTH_UTC = "1990-07-15T11:30:00.000Z";
const A: BirthPoint = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };
const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

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
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

/** Sahte sağlayıcı: YALNIZ gerçek golden'ı olan BİREBİR gövde döner; başka gövde → 400 (yeni sonuç uydurulmaz). */
function roxy(mutate?: (r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-pr", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const hit = Object.values(G).find((g) => g.endpoint === endpoint && canon(g.body) === canon(body));
      if (!hit) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(hit.response);
      mutate?.(r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}

async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const PR = (planet: string, approxDate: string, crossing = 1, houseSystem = "placidus", returnLocationId: string | null = null) => ({ technique: "western.planetary_return", options: { planet, approxDate, crossing, houseSystem, returnLocationId } });
const SEL = {
  saturn: PR("saturn", "2049-02-01"),
  jupiter: PR("jupiter", "2025-12-01", 2),
  mars: PR("mars", "2028-05-01", 1, "placidus", "gb-london"),
  mercury: PR("mercury", "2026-08-01", 1, "whole-sign"),
};
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, hide = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: hide });

function expectOf(name: keyof typeof G, over: Partial<PlanetaryReturnExpect> = {}): PlanetaryReturnExpect {
  const g = G[name];
  const pick = g.selection.cluster.find((c: J) => c.crossing === g.selection.crossing);
  return {
    planet: String(g.body.planet).toLowerCase() as PlanetaryReturnPlanet,
    houseSystem: g.body.houseSystem as J,
    birthDate: String(g.body.birthDate),
    approximateDate: String(g.body.approximateDate),
    crossing: pick.crossing,
    of: pick.of,
    motion: pick.motion,
    expectedUtc: pick.approxUtc,
    toleranceMinutes: pick.toleranceMinutes,
    location: { latitude: Number(g.body.latitude), longitude: Number(g.body.longitude) },
    natalLongitude: g.selection.natalLongitude,
    ...over,
  };
}
const proj = (name: keyof typeof G, mutate?: (r: J) => void, over: Partial<PlanetaryReturnExpect> = {}) => {
  const raw = structuredClone(G[name].response);
  mutate?.(raw);
  return projectRoxyPlanetaryReturn(raw, expectOf(name, over));
};
const providerUtc = (r: J) => Date.parse(`${r.returnDate}Z`) - r.location.timezone * 3600_000;

async function main() {
  // ═══ A) GOLDEN ↔ PROJEKSİYON ═════════════════════════════════════════════════
  await t("A: 4 gerçek golden — gövde ürünün üreticisiyle aynı; projeksiyon kabul; bilinmeyen alan 0; düşen değer 0", () => {
    const birth = { ...A };
    assert.equal(canon(planetaryReturnBody(birth, "saturn", "2049-02-08", "placidus")), canon(G.saturn.body));
    assert.equal(canon(planetaryReturnBody(birth, "jupiter", "2025-12-22", "placidus")), canon(G.jupiter.body));
    assert.equal(canon(planetaryReturnBody(birth, "mars", "2028-04-30", "placidus", { latitude: 51.5074, longitude: -0.1278 })), canon(G.mars.body));
    assert.equal(canon(planetaryReturnBody(birth, "mercury", "2026-08-13", "whole-sign")), canon(G.mercury.body));
    assert.equal(G.mars.body.timezone, 3, "relocated: DOĞUM ofseti gönderilir");
    for (const n of NAMES) {
      const r = proj(n);
      assert.ok(r.ok, `${n}: ${!r.ok ? r.errors.join("; ") : ""}`);
      if (!r.ok) continue;
      assert.deepEqual(r.unmappedFields, [], n);
      assert.deepEqual(r.droppedValues, [], n);
      assert.equal(r.technical.schema, "astro.western.planetary_return.v1");
      assert.equal(r.technical.chart.bodies.length, 14, `${n}: 14 gök cismi`);
      assert.equal(r.technical.chart.houses.length, 12);
      assert.ok(r.technical.chart.aspects.length > 30, `${n}: açılar`);
      assert.ok(r.technical.chart.angles?.ascendant && r.technical.chart.angles?.midheaven, `${n}: ASC/MC`);
      assert.ok(r.technical.longitudeDelta <= 0.0001, `${n}: tutarlılık ${r.technical.longitudeDelta}`);
      assert.ok(!JSON.stringify(r.technical).includes("approximateCycle") && !JSON.stringify(r.technical).includes("~"), `${n}: approximateCycle teknik katmana girmemeli`);
      assert.ok(!JSON.stringify(r.technical).includes("döngünün"), `${n}: sağlayıcı metni teknik katmanda`);
      assert.deepEqual(r.interpretation, { schema: "astro.western.planetary_return.interp.v1", summary: G[n].response.interpretation.summary, keyThemes: G[n].response.interpretation.keyThemes }, n);
    }
  });

  await t("A: dönüş anı UTC = sağlayıcı yerel saati − doğum ofseti (+3); Londra'da da ofset +3 (doğum anı kaymaz)", () => {
    const r = proj("saturn");
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.technical.returnUtc, "2049-02-08T11:39:40Z");
    const m = proj("mars");
    assert.ok(m.ok);
    if (m.ok) {
      assert.equal(m.technical.returnUtc, "2028-04-30T11:55:57Z");
      assert.equal(m.technical.returnOffsetHours, 3);
      assert.deepEqual(m.technical.location, { latitude: 51.5074, longitude: -0.1278 });
    }
  });

  // ═══ B) BAĞIMSIZ DOĞRULAMA (astronomy-engine) ════════════════════════════════
  await t("B: bağımsız — natal boylam (doğum anı) ve dönüş anındaki transit boylam = sağlayıcı natal boylamı (±0,01°)", () => {
    for (const n of NAMES) {
      const r = G[n].response;
      const planet = String(G[n].body.planet).toLowerCase() as PlanetaryReturnPlanet;
      const natal = natalPlanetLongitude(planet, BIRTH_UTC);
      assert.ok(sep(natal, r.natalPlanetPosition.longitude) <= 0.01, `${n}: natal ${natal} ↔ ${r.natalPlanetPosition.longitude}`);
      const atReturn = planetLongitudeAt(planet, new Date(providerUtc(r)).toISOString());
      assert.ok(sep(atReturn, r.natalPlanetPosition.longitude) <= 0.01, `${n}: dönüş anı boylamı ${atReturn} ↔ natal ${r.natalPlanetPosition.longitude}`);
    }
  });

  await t("B: bağımsız — sağlayıcının anı seçilen kavuşumla aynı (hızlı gezegen ±2 dk; yavaş gezegen ±20 dk = boylamda < 0,002°)", () => {
    const lim: Record<string, number> = { saturn: 20, jupiter: 20, mars: 2, mercury: 2 };
    for (const n of NAMES) {
      const pick = G[n].selection.cluster.find((c: J) => c.crossing === G[n].selection.crossing);
      const dMin = Math.abs(providerUtc(G[n].response) - Date.parse(`${pick.approxUtc}:00Z`)) / 60_000;
      assert.ok(dMin <= lim[n], `${n}: ${dMin.toFixed(1)} dk`);
      const pl = G[n].response.chart.planets.find((p: J) => p.name === G[n].response.planet);
      assert.ok((dMin / 1440) * Math.abs(pl.speed) < 0.002, `${n}: zaman farkının boylam karşılığı`);
    }
  });

  await t("B: retro döngüsü — Jüpiter 2025–26 kümesinde 3 kavuşum (ileri / GERİ / ileri); sağlayıcı istenen 2. (geri) kavuşumu verdi (hız < 0)", () => {
    const cl = G.jupiter.selection.cluster;
    assert.deepEqual(cl.map((c: J) => [c.crossing, c.of, c.motion]), [[1, 3, "direct"], [2, 3, "retrograde"], [3, 3, "direct"]]);
    const pl = G.jupiter.response.chart.planets.find((p: J) => p.name === "Jupiter");
    assert.ok(pl.speed < 0 && pl.isRetrograde === true, "2. kavuşum geri hareketli olmalı");
    const r = proj("jupiter");
    assert.ok(r.ok && r.technical.requested.motion === "retrograde" && r.technical.returnPoint.retrograde === true);
    // Satürn 2049: 3 kavuşum; ürün 1.'yi istedi → sağlayıcı ileri hareketli 1. kavuşumu verdi.
    assert.equal(G.saturn.selection.cluster.length, 3);
    assert.ok(G.saturn.response.chart.planets.find((p: J) => p.name === "Saturn").speed > 0);
  });

  await t("B: Merkür geosantrik dönüşü ~yıllık (sağlayıcı metni '~88 days' yanıltıcı): ardışık dönüşler 300–420 gün arayla", () => {
    assert.equal(G.mercury.response.approximateCycle, "~88 days");
    const natal = natalPlanetLongitude("mercury", BIRTH_UTC);
    const a = planetaryReturnCluster("mercury", natal, "2026-08-13");
    const b = planetaryReturnCluster("mercury", natal, "2027-08-13");
    const gap = (Date.parse(`${b[0].approxUtc}:00Z`) - Date.parse(`${a[a.length - 1].approxUtc}:00Z`)) / 86_400_000;
    assert.ok(gap > 300 && gap < 420, `Merkür aralığı ${gap} gün`);
    assert.ok(Math.abs(providerUtc(G.mercury.response) - Date.parse("2026-08-13T15:20:00Z")) < 3 * 60_000);
  });

  await t("B: aralık mantığı — Satürn dönüşleri ~29,5 yıl (2020 → 2049), Jüpiter ~11,9 yıl (2014 → 2025), Mars ~1,9–2,2 yıl", () => {
    const yrs = (a: string, b: string) => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / (365.25 * 86_400_000);
    const sat = natalPlanetLongitude("saturn", BIRTH_UTC);
    const s1 = planetaryReturnCluster("saturn", sat, "2020-01-01");
    const s2 = planetaryReturnCluster("saturn", sat, "2049-02-01");
    assert.equal(s1.length, 1);
    const ys = yrs(s1[0].approxUtc, s2[0].approxUtc);
    assert.ok(ys > 28.5 && ys < 30.5, `Satürn ${ys}`);
    const jup = natalPlanetLongitude("jupiter", BIRTH_UTC);
    const j1 = planetaryReturnCluster("jupiter", jup, "2014-06-01");
    const j2 = planetaryReturnCluster("jupiter", jup, "2025-10-01");
    const yj = yrs(j1[0].approxUtc, j2[0].approxUtc);
    assert.ok(yj > 11 && yj < 12.5, `Jüpiter ${yj}`);
    const mars = natalPlanetLongitude("mars", BIRTH_UTC);
    const m1 = planetaryReturnCluster("mars", mars, "2026-05-01");
    const m2 = planetaryReturnCluster("mars", mars, "2028-05-01");
    const ym = yrs(m1[m1.length - 1].approxUtc, m2[0].approxUtc);
    assert.ok(ym > 1.7 && ym < 2.4, `Mars ${ym}`);
    // Satürn'ün İLK dönüşü (2020) doğumdan ~29,5 yıl sonra.
    const y0 = (Date.parse(`${s1[0].approxUtc}:00Z`) - Date.parse(BIRTH_UTC)) / (365.25 * 86_400_000);
    assert.ok(y0 > 28.5 && y0 < 30, `ilk Satürn dönüşü ${y0}`);
  });

  // ═══ C) FAIL-CLOSED ══════════════════════════════════════════════════════════
  await t("B: önceki / sonraki dönüş kısayolu — komşu kümenin İLK kavuşumu; o kümenin retro kavuşumları atlanmaz; zincir ileri-geri tutarlı", () => {
    const n = natalPlanetLongitude("saturn", BIRTH_UTC);
    const nb = planetaryReturnNeighbors("saturn", n, "2049-02-08");
    assert.deepEqual(nb, { previous: "2020-01-05", next: "2078-04-03" });
    assert.equal(planetaryReturnCluster("saturn", n, nb.next!).length, 3, "2078 kümesinin 3 kavuşumu listelenir");
    assert.equal(planetaryReturnNeighbors("saturn", n, "2020-01-05").next, "2049-02-08", "2020 → sonraki = 2049 kümesinin 1. kavuşumu");
    const nj = natalPlanetLongitude("jupiter", BIRTH_UTC);
    const j = planetaryReturnNeighbors("jupiter", nj, "2014-06-11");
    assert.equal(j.next, "2025-10-01", "Jüpiter 2014 → sonraki 2025-26 kümesinin 1. kavuşumu");
    assert.deepEqual(planetaryReturnCluster("jupiter", nj, j.next!).map((c) => c.motion), ["direct", "retrograde", "direct"], "retro kavuşum (2.) atlanmaz");
    for (const pl of ["mars", "venus", "mercury"] as PlanetaryReturnPlanet[]) {
      const np = natalPlanetLongitude(pl, BIRTH_UTC);
      let d = "2000-01-01";
      for (let k = 0; k < 12; k++) {
        const x = planetaryReturnNeighbors(pl, np, d);
        assert.ok(x.next && x.next > d, `${pl} ${d}: sonraki ileri`);
        assert.equal(planetaryReturnNeighbors(pl, np, x.next!).previous, planetaryReturnCluster(pl, np, d)[0].requestDate, `${pl} ${d}: geri dönüş aynı kümeye`);
        d = x.next!;
      }
    }
  });

  await t("F: Türkçe gezegen adı — yalnız tek başına geçen İngilizce ad değişir; ekli ad ve diğer metin aynen", () => {
    assert.equal(localizePlanetNamesTr("Bu Saturn dönüşü, Saturn tarafından yönetilen"), "Bu Satürn dönüşü, Satürn tarafından yönetilen");
    assert.equal(localizePlanetNamesTr("Mercury, Venus ve Jupiter; Mars"), "Merkür, Venüs ve Jüpiter; Mars");
    assert.equal(localizePlanetNamesTr("Saturn'un etkisi Saturnine"), "Saturn'un etkisi Saturnine", "ekli / bileşik sözcük dokunulmaz");
    for (const n of ["saturn", "jupiter", "mars", "mercury"] as const) {
      const out = localizePlanetNamesTr(G[n].response.interpretation.summary);
      assert.ok(!/(Saturn|Jupiter|Mercury|Venus)/.test(out), `${n}: İngilizce ad kalmamalı — ${out}`);
      assert.equal(out.replace(/Satürn|Jüpiter|Merkür|Venüs/g, "X"), G[n].response.interpretation.summary.replace(/Saturn|Jupiter|Mercury|Venus/g, "X"), `${n}: yalnız ad değişmeli`);
    }
  });

  await t("C: bozuk yanıtlar REDDEDİLİR — gezegen yankısı, başka kavuşum, tutarsız boylam, natal boylam, ev sistemi, konum, eksik alanlar, yön", () => {
    const cases: [keyof typeof G, string, (r: J) => void, string][] = [
      ["saturn", "planet", (r) => (r.planet = "Jupiter"), "planet yankısı uyuşmuyor"],
      ["saturn", "birthDate", (r) => (r.birthDate = "1990-07-16"), "birthDate yankısı uyuşmuyor"],
      ["saturn", "başka kavuşum (Ağustos 2049)", (r) => (r.returnDate = "2049-08-16T08:26:00"), "returnDate seçilen kavuşumla uyuşmuyor"],
      ["saturn", "returnDate biçimi", (r) => (r.returnDate = "08.02.2049"), "returnDate"],
      ["saturn", "dönüş boylamı", (r) => (r.chart.planets.find((p: J) => p.name === "Saturn").longitude += 0.2), "tutarlılık: dönüş anındaki gezegen boylamı natal boylama eşit değil"],
      ["saturn", "natal boylam", (r) => { r.natalPlanetPosition.longitude += 0.2; r.chart.planets.find((p: J) => p.name === "Saturn").longitude += 0.2; }, "tutarlılık: natal gezegen boylamı doğum anıyla uyuşmuyor"],
      ["saturn", "ev sistemi", (r) => (r.chart.houseSystem = "koch"), "chart.houseSystem uyuşmuyor"],
      ["mars", "konum", (r) => (r.location.latitude = 41.0082), "location: istenen dönüş konumuyla uyuşmuyor"],
      ["saturn", "eksik konum", (r) => delete r.location, "location"],
      ["saturn", "eksik natal", (r) => delete r.natalPlanetPosition, "natalPlanetPosition"],
      ["saturn", "eksik gezegen", (r) => (r.chart.planets = r.chart.planets.filter((p: J) => p.name !== "Saturn")), "chart.planets: dönüş gezegeni yok"],
      ["jupiter", "yön", (r) => (r.chart.planets.find((p: J) => p.name === "Jupiter").speed = 0.1), "returnDate: kavuşum yönü seçilen kavuşumla uyuşmuyor"],
    ];
    for (const [n, label, m, e] of cases) {
      const r = proj(n, m);
      assert.equal(r.ok, false, label);
      if (!r.ok) assert.ok(r.errors.includes(e), `${label}: ${r.errors.join("; ")}`);
    }
    assert.equal(projectRoxyPlanetaryReturn(null, expectOf("saturn")).ok, false);
    assert.equal(projectRoxyPlanetaryReturn([], expectOf("saturn")).ok, false);
    const noChart = proj("saturn", (r) => delete r.chart);
    assert.equal(noChart.ok, false);
    const extra = proj("saturn", (r) => (r.newField = 1));
    assert.ok(extra.ok && extra.unmappedFields.includes("newField"), "bilinmeyen alan raporlanmalı");
    const noInterp = proj("saturn", (r) => delete r.interpretation);
    assert.ok(noInterp.ok && noInterp.interpretation === null, "yorum yoksa teknik bozulmaz, yorum null");
  });

  // ═══ D) MOTOR ════════════════════════════════════════════════════════════════
  await t("D: kayıt defteri + UI listesi + saat zorunlu + aile + konu bağlamı", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("western.planetary_return"));
    assert.ok((UI_TECHNIQUES as readonly string[]).includes("western.planetary_return"));
    const def = getTechnique("western.planetary_return")!;
    assert.equal(def.requiresKnownTime, true);
    assert.equal(def.family, "western");
    assert.equal(TECHNIQUE_META["western.planetary_return"].label, "Gezegen dönüşleri");
    assert.equal(TECHNIQUE_META["western.planetary_return"].needsTime, true);
    assert.equal(ROXY_PLANETARY_RETURN.endpoint, "/astrology/planetary-returns");
    for (const bad of [{ planet: "pluto", approxDate: "2049-01-01" }, { planet: "saturn", approxDate: "2049-02-30" }, { planet: "saturn", approxDate: "1500-01-01" }, { planet: "saturn", approxDate: "2049-01-01", crossing: 4 }, { planet: "saturn", approxDate: "2049-01-01", houseSystem: "regio" }, { planet: "saturn", approxDate: "2049-01-01", returnLocationId: "../x" }])
      assert.equal(def.parseOptions(bad, new Date()), null, JSON.stringify(bad));
    assert.deepEqual(def.parseOptions({ planet: "saturn", approxDate: "2049-01-01" }, new Date()), { planet: "saturn", approxDate: "2049-01-01", crossing: 1, houseSystem: "placidus", returnLocationId: null });
  });

  await t("D: Satürn sonraki dönüş — plan 1 yeni istek + planInfo 3 kavuşum; çalıştır: gövde golden ile BİREBİR, 1 istek; tekrar 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const p1 = (await planAstrology(ctx, { profileId: pa, selections: [SEL.saturn] })).body as J;
    assert.equal(p1.plan.newRequestCount, 1, JSON.stringify(p1.plan).slice(0, 300));
    assert.deepEqual(p1.plan.selections[0].info.planetaryReturns.map((x: J) => [x.crossing, x.of, x.motion]), [[1, 3, "direct"], [2, 3, "retrograde"], [3, 3, "direct"]]);
    // 22.10 kısayol: plan bilgisi önceki (2020) / sonraki (2078) kümenin ilk kavuşum gününü taşır (ücretli istek sayısı değişmez).
    assert.deepEqual(p1.plan.selections[0].info.planetaryReturnNeighbors, { previous: "2020-01-05", next: "2078-04-03" });
    const info = JSON.stringify(p1.plan.selections[0].info);
    assert.ok(!info.includes("41.0082") && !info.includes("1990-07-15") && !info.includes("natal"), "plan bilgisi doğum verisi / natal boylam içermemeli");
    assert.ok(!JSON.stringify(p1.plan).includes("approximateDate"), "plan özeti istek gövdesi içermemeli");
    const rx = roxy();
    const r1 = (await run(ctx, pa, [SEL.saturn], rx.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 400));
    assert.equal(rx.calls.length, 1);
    assert.equal(rx.calls[0].endpoint, "/astrology/planetary-returns");
    assert.equal(canon(rx.calls[0].body), canon(G.saturn.body));
    const v = r1.results[0].view;
    assert.equal(v.technical.planet, "saturn");
    assert.equal(v.technical.returnUtc, "2049-02-08T11:39:40Z");
    assert.equal(v.method.houseSystem, "placidus");
    assert.equal(v.method.zodiac, "tropical");
    assert.equal(v.interpretation.visible, true);
    assert.equal(v.interpretation.content.schema, "astro.western.planetary_return.interp.v1");
    // Önbellek: aynı seçim 0 istek; FARKLI hedef tarih aynı kavuşuma düşüyorsa aynı anahtar (0 istek).
    const p2 = (await planAstrology(ctx, { profileId: pa, selections: [SEL.saturn, PR("saturn", "2049-03-15")] })).body as J;
    assert.equal(p2.plan.newRequestCount, 0, JSON.stringify(p2.plan).slice(0, 300));
    await run(ctx, pa, [PR("saturn", "2048-12-20")], rx.deps);
    assert.equal(rx.calls.length, 1, "aynı kavuşum yeni istek yaptı");
    // Aynı kümenin 2. kavuşumu = farklı gövde = 1 yeni istek.
    const p3 = (await planAstrology(ctx, { profileId: pa, selections: [PR("saturn", "2049-02-01", 2)] })).body as J;
    assert.equal(p3.plan.newRequestCount, 1);
  });

  await t("D: retro kavuşum seçimi (Jüpiter 2.) gövdesi golden ile aynı; olmayan kavuşum (Mars 3.) → NO_UNIT, istek yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SEL.jupiter], rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.equal(canon(rx.calls[0].body), canon(G.jupiter.body));
    assert.equal(r.results[0].view.technical.requested.crossing, 2);
    assert.equal(r.results[0].view.technical.requested.of, 3);
    const p = (await planAstrology(ctx, { profileId: pa, selections: [PR("mars", "2028-05-01", 3)] })).body as J;
    assert.equal(p.plan.newRequestCount, 0);
    assert.equal(p.plan.selections[0].blocked.code, "NO_UNIT");
    assert.ok(p.plan.selections[0].blocked.error.includes("1 kavuşum var"), p.plan.selections[0].blocked.error);
  });

  await t("D: relocated (Londra) — dönüş konumu sunucuda çözülür; gövde = Mars Londra golden'ı (doğum ofseti +3); seçenekte konum etiketi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SEL.mars, SEL.mercury], rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(canon(rx.calls[0].body), canon(G.mars.body));
    assert.equal(canon(rx.calls[1].body), canon(G.mercury.body));
    const mars = r.results.find((x: J) => x.view.technical.planet === "mars").view;
    assert.equal(mars.options.returnLocation.locationId, "gb-london");
    assert.equal(mars.options.returnLocation.timezone, "Europe/London");
    const mer = r.results.find((x: J) => x.view.technical.planet === "mercury").view;
    assert.equal(mer.method.houseSystem, "whole-sign");
    const bad = (await planAstrology(ctx, { profileId: pa, selections: [PR("mars", "2028-05-01", 1, "placidus", "yok-boyle-bir-yer")] })).body as J;
    assert.equal(bad.plan.selections[0].blocked.code, "LOCATION_NOT_FOUND");
  });

  await t("D: doğum saati bilinmiyor → TIME_REQUIRED (sağlayıcıya gitmez); kayıtlı sonuç saat-bilinmeyen bağlamda maskelenir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const rx = roxy();
    const r = await run(ctx, pa, [SEL.saturn], rx.deps);
    assert.equal(rx.calls.length, 0, "saat bilinmeden sağlayıcı çağrıldı");
    assert.ok(JSON.stringify(r.body).includes("TIME_REQUIRED"), JSON.stringify(r.body).slice(0, 300));
    const m = maskTechnical("western.planetary_return", { schema: "astro.western.planetary_return.v1" }, { primary: false, partner: null });
    assert.equal(m.technical, null);
    assert.equal(m.masked, true);
    assert.ok(m.warnings[0].includes("doğum saatine"));
  });

  await t("D: sağlayıcı hatası / bozuk yanıt → sonuç yok, kayıt yapılamaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const bad = (await run(ctx, pa, [PR("venus", "2026-05-01")], roxy().deps)).body as J; // golden yok → 400
    assert.ok(!bad.ok || !bad.results?.some((x: J) => x.view?.technical), JSON.stringify(bad).slice(0, 300));
    const corrupt = (await run(ctx, pa, [SEL.saturn], roxy((r) => (r.chart.planets.find((p: J) => p.name === "Saturn").longitude += 1)).deps)).body as J;
    assert.ok(!corrupt.ok || !corrupt.results?.some((x: J) => x.view?.technical), "bozuk yanıt sonuç üretti");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.saturn, saveRequestId: randomUUID() }, false);
    assert.notEqual(sv.status, 201, "hesaplanmamış sonuç kaydedildi");
  });

  // ═══ E) KAYIT / ARŞİV / RAPOR / YETKİ / NOT / KONU ════════════════════════════
  await t("E: kaydet → aç 0 istek; snapshot teknik veri + seçenekler + yorum; Word/PDF rapor metni (dönüş anı UTC + doğum yeri yerel saati, kavuşum, tutarlılık, tablolar)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await saveExpertNote(ctx, { profileId: pa, technique: "western.planetary_return", noteContext: "gezegen:jupiter", sectionKey: "overall", body: "Jüpiter dönüşü uzman notu", expectedRevision: null });
    const rx = roxy();
    await run(ctx, pa, [SEL.jupiter], rx.deps);
    const n = rx.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.jupiter, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a.technical.planet, "jupiter");
    assert.equal(a.params.crossing, 2);
    assert.equal(a.interpretation.visible, true);
    const s = reportTexts(buildAstroReport(a)).join("\n");
    for (const want of [
      "Gezegen dönüşleri",
      "Jüpiter dönüşü",
      "2. kavuşum / 3 (retro döngüsü)",
      "geri hareket (retro)",
      "Dönüş anı (UTC)",
      "22.12.2025 11:49 UTC",
      "Dönüş anı (doğum yeri yerel saati)",
      "22.12.2025 14:49",
      "Europe/Istanbul",
      "Natal Jüpiter",
      "Tutarlılık (|dönüş − natal|)",
      "eşik 0,05°",
      "Dönüş haritası gezegenleri",
      "Ev başlangıçları (cusp)",
      "Açılar",
      "Yöntem: gezegen dönüşü",
      "yaklaşık 11,9 yıl",
      localizePlanetNamesTr(G.jupiter.response.interpretation.summary),
      "Bu Jüpiter dönüşü, Jüpiter tarafından",
      G.jupiter.response.interpretation.keyThemes[0],
      "Jüpiter dönüşü uzman notu",
    ])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "~12 years", "approximateCycle", "planetary-returns", "Bu Jupiter", "Jupiter tarafından"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
    assert.equal(a.interpretation.content.summary, G.jupiter.response.interpretation.summary, "kayıtlı yorum metni değişmemeli (Türkçe ad yalnız gösterimde)");
    const rep = buildAstroReport(a);
    assert.ok(rep.blocks.some((b: J) => b.kind === "chart" && b.chart), "rapor çarkı");
  });

  await t("E: Merkür raporunda geosantrik dönüş aralığı notu var; Satürn'de yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await run(ctx, pa, [SEL.mercury, SEL.saturn], roxy().deps);
    const sm = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.mercury, saveRequestId: randomUUID() }, false);
    const ss = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.saturn, saveRequestId: randomUUID() }, false);
    const tm = reportTexts(buildAstroReport(((await getAnalysis(ctx, (sm.body as J).analysisId, false)).body as J).analysis)).join("\n");
    const ts = reportTexts(buildAstroReport(((await getAnalysis(ctx, (ss.body as J).analysisId, false)).body as J).analysis)).join("\n");
    assert.ok(tm.includes("geosantrik dönüşleri yaklaşık yılda birdir") && tm.includes("Tam Burç (Whole Sign)"), tm.slice(0, 200));
    assert.ok(!ts.includes("geosantrik dönüşleri yaklaşık yılda birdir"));
    assert.ok(ts.includes("1. kavuşum / 3 (retro döngüsü)") && ts.includes("08.02.2049 11:39 UTC"));
  });

  await t("E: yorum yetki kapısı — yetkisiz uzman / owner önizleme gizli: yorum metni yanıtta YOK (sızma yok); teknik aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: { ...FULL, providerInterpretations: false } });
    const pa = await profile(ctx);
    const body = (await run(ctx, pa, [SEL.saturn], roxy().deps)).body as J;
    assert.equal(body.results[0].view.interpretation.visible, false);
    const txt = JSON.stringify(body);
    assert.ok(!txt.includes("döngünün başlangıcını") && !txt.includes(G.saturn.response.interpretation.keyThemes[0]), "yetkisiz yanıtta sağlayıcı metni");
    assert.equal(body.results[0].view.technical.planet, "saturn");
    const store2 = seed();
    const ctx2 = ctxOf(store2);
    const pb = await profile(ctx2);
    const hidden = (await run(ctx2, pb, [SEL.saturn], roxy().deps, true)).body as J;
    assert.equal(hidden.results[0].view.interpretation.visible, false);
    assert.ok(!JSON.stringify(hidden).includes("döngünün başlangıcını"));
  });

  await t("E: izolasyon — başka tenant ve aynı tenant'taki başka uzman analizi açamaz / çalıştıramaz / not yazamaz (404)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [SEL.saturn], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.saturn, saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [SEL.saturn], rx.deps)).status, 404);
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "western.planetary_return", noteContext: "gezegen:saturn", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  await t("E: not bağlamı gezegene göre (gezegen:saturn ≠ gezegen:mars); geçersiz bağlam 400; çalışma alanı konuları 'Gezegen dönüşü' bağlamında", async () => {
    const def = getTechnique("western.planetary_return")!;
    assert.deepEqual(parseNoteContext(def, "gezegen:saturn"), { planet: "saturn" });
    assert.equal(parseNoteContext(def, "gezegen:pluto"), null);
    assert.equal(parseNoteContext(def, "yas:36"), null);
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "western.planetary_return", noteContext: "gezegen:saturn", sectionKey: "overall", body: "Satürn notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "western.planetary_return", noteContext: "gezegen:mars", sectionKey: "overall", body: "Mars notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "western.planetary_return", noteContext: "gezegen:xyz", sectionKey: "overall", body: "x", expectedRevision: null })).status, 400);
    await run(ctx, pa, [SEL.saturn], roxy().deps);
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...SEL.saturn })).body as J;
    assert.equal(ws.ok, true, JSON.stringify(ws).slice(0, 300));
    assert.equal(ws.noteContext, "gezegen:saturn");
    assert.deepEqual(ws.notes.map((x: J) => x.body), ["Satürn notu"]);
    assert.ok(ws.topics.length > 20 && ws.topics.every((x: J) => x.key.startsWith("planetary_return_")), "konular kendi bağlamında");
    assert.ok(ws.topics.some((x: J) => x.label.startsWith("Gezegen dönüşü: ")));
    assert.ok(isSectionKeyForTechnique("western.planetary_return", ws.topics[0].key));
    assert.equal(isSectionKeyForTechnique("western.solar_return", ws.topics[0].key), false, "solar return bağlamına karışmamalı");
    assert.equal(topicsForTechnique("western.planetary_return", null).length, 0);
  });

  // ═══ F) MEVCUT TEKNİKLER DEĞİŞMEDİ · UI ═══════════════════════════════════════
  await t("F: mevcut tekniklerin girdi özeti DEĞİŞMEDİ (sabit hash; Solar/Lunar Return golden gövdeleri aynen)", () => {
    const ctx = { birth: A, birthUtc: BIRTH_UTC, partner: null };
    const h = (id: string, opt: Record<string, unknown>) => getTechnique(id)!.units(ctx, getTechnique(id)!.parseOptions(opt, new Date("2026-10-22T09:00:00Z"))!).map((u) => u.inputHash).join(",");
    const FIXED: [string, Record<string, unknown>, string][] = [
      ["western.natal", { houseSystem: "placidus", nodeType: "true" }, NATAL_H],
      ["western.solar_return", { returnYear: 2026, houseSystem: "placidus" }, SR_H],
      ["western.solar_return", { returnYear: 2026, houseSystem: "whole-sign" }, SR_WS_H],
      ["western.lunar_return", { month: "2026-10", sequence: 1, houseSystem: "placidus" }, LR_H],
      ["western.profections", { age: 36 }, PROF_H],
      ["western.fixed_stars", { nodeType: "true", orb: 1, reportCatalog: false }, FS_H],
    ];
    for (const [id, opt, want] of FIXED) assert.equal(h(id, opt), want, `${id} ${JSON.stringify(opt)}`);
    assert.equal(canon(solarReturnBody(A, 2026, "placidus")), canon(load("solar-return").body));
    assert.equal(canon(lunarReturnBody(A, String(load("lunar-return").body.returnDate), "placidus")), canon(load("lunar-return").body));
    void calcInputHash;
  });

  await t("F: UI — seçim {planet, approxDate, crossing, houseSystem, returnLocationId}; özet Türkçe; eksik tarih plana girmez", () => {
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    assert.deepEqual(buildSelections({ "western.planetary_return": true }, p, method), [{ technique: "western.planetary_return", options: { planet: "saturn", approxDate: "2026-10-22", crossing: 1, houseSystem: "placidus", returnLocationId: null } }]);
    const p2 = { ...p, planetaryReturnPlanet: "jupiter" as const, planetaryReturnDate: "2025-12-01", planetaryReturnCrossing: 2 as const, planetaryReturnLocation: { id: "gb-london", label: "Londra" } };
    assert.deepEqual(buildSelections({ "western.planetary_return": true }, p2, { ...method, houseSystem: "whole-sign" }), [{ technique: "western.planetary_return", options: { planet: "jupiter", approxDate: "2025-12-01", crossing: 2, houseSystem: "whole-sign", returnLocationId: "gb-london" } }]);
    assert.equal(describeOptions("western.planetary_return", { planet: "jupiter", approxDate: "2025-12-01", crossing: 2, returnLocationId: null }), "Jüpiter dönüşü · hedef 01.12.2025 · 2. kavuşum · doğum yeri");
    const p3 = { ...p, planetaryReturnDate: "0002-10-17" };
    assert.deepEqual(buildSelections({ "western.planetary_return": true }, p3, method), []);
    assert.equal(missingReason("western.planetary_return", p3), "dönüş hedef tarihini tamamlayın");
    assert.equal(missingReason("western.planetary_return", p), null);
  });

  await t("güvenlik: istemci bileşenleri sağlayıcı istemcisini / anahtarı / astronomy-engine'i içe aktarmaz; kullanıcı metninde sağlayıcı adı yok", () => {
    for (const f of ["app/admin/astroloji/_components/PlanetaryReturnPanel.tsx", "lib/astrology/model/westernPlanetaryReturn.ts"]) {
      const src = readFileSync(join(__dirname, "..", "..", f), "utf8");
      assert.ok(!src.includes("providers/roxy") && !src.includes("ROXY_API_KEY") && !src.includes("process.env") && !src.includes("astronomy-engine") && !src.includes("engine/planetaryReturnDate"), f);
      assert.ok(!/roxy/i.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: sağlayıcı adı`);
    }
    const panel = readFileSync(join(__dirname, "..", "..", "app/admin/astroloji/_components/PlanetaryReturnPanel.tsx"), "utf8");
    assert.ok(!panel.includes("interpretation"), "teknik panel sağlayıcı yorumunu göstermemeli");
  });

  console.log(`\nastrology planetary-return harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

// Sabit girdi özetleri (taban 93b16b06 ile hesaplandı; mevcut tekniklerin gövde/adaptör/anahtarı değişirse test düşer).
const NATAL_H = "6ebb8ad39201c478fb7fee2cd6094fe4bfbb936c90701182ceb51c8a11a9a822";
const SR_H = "2985cb59dd678dd794449b33f3878f7beddaa55eae870ff3c4c390e80d86af34";
const SR_WS_H = "c7c04249ac13bfc8e0a29799fdd7e7ea5212d4e8c748f7412217a1d1ed262698";
const LR_H = "17c7a7a966a8a60c8ae73caa25681b41f33fbfcf130ec7db9cc28c7ca6f8f8fd";
const PROF_H = "a4f33b4952889bd07af8a606a723b5a75f4b99a2bfdd0155165105d7b7c62557";
const FS_H = "8366731cf72676685e614df23f7afda53ee52231ecde9b9fc7e2a81d07723855";

void main().catch((e) => {
  console.error("planetary-return harness çöktü:", e);
  process.exit(1);
});
