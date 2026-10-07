/**
 * ASTROLOJİ AŞAMA 4.1 harness'i — Relocated Solar Return + Relocated Lunar Return.
 *
 *   • Gerçek golden (sentetik A; Londra) ↔ Aşama 3 İstanbul golden'ı: dönüş anı/natal nokta/gezegen
 *     boylamları AYNI, ASC/MC/evler FARKLI (bağımsız formülle doğrulanır).
 *   • Varsayılan (doğum yeri) gövde/anahtar Aşama 3 ile birebir · aynı ayda iki lunar return + konum ·
 *     konum çözümü sunucuda · önbellek · not bağlamı · Analizi Kaydet · yorum/ham sızıntı · tenant · saat.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase41.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlan41, RETURN_TARGET } from "./golden/phase41-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { getAstrologyResult, planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { lunarReturnsInMonth, natalMoonLongitude } from "@/lib/astrology/engine/lunarReturnDate";
import { getAnalysis, getWorkspace, locationContextKey, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { projectRoxyReturn } from "@/lib/astrology/providers/roxy/timing";
import { localTimeIn, returnUtcIso } from "@/app/admin/astroloji/_components/TimingPanels";
import { describeOptions } from "@/app/admin/astroloji/_lib/techniques";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const SR_IST = load("solar-return");
const SR_LON = load("solar-return-london");
const LR_IST = load("lunar-return");
const LR_LON = load("lunar-return-london");

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

const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

type Call = { endpoint: string; body: Record<string, unknown> };
/**
 * Sahte Roxy: istenen konum İstanbul ise İstanbul golden'ı, Londra ise Londra golden'ı (GERÇEK yanıtlar).
 * Diğer konumlar (Berlin) için SENTETİK: Londra golden'ı + istenen konum yankısı (yalnız önbellek/plan testleri).
 * Lunar'da başka gün istenirse dönüş anı istenen dönüşe kaydırılır (Aşama 3 testleriyle aynı yöntem).
 */
function roxy(opts: { wrongLocation?: boolean } = {}) {
  const calls: Call[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-41", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const solar = endpoint === "/astrology/solar-return";
      const ist = near(Number(body.latitude), ISTANBUL.latitude) && near(Number(body.longitude), ISTANBUL.longitude);
      const lon = near(Number(body.latitude), RETURN_TARGET.latitude) && near(Number(body.longitude), RETURN_TARGET.longitude);
      const base = solar ? (ist || opts.wrongLocation ? SR_IST : SR_LON) : ist || opts.wrongLocation ? LR_IST : LR_LON;
      const r = structuredClone(base.response);
      if (!ist && !lon && !opts.wrongLocation) r.location = { ...r.location, latitude: body.latitude, longitude: body.longitude };
      if (!solar && body.returnDate !== base.body.returnDate) {
        const m = natalMoonLongitude(SYNTH_A.utc);
        const month = String(body.returnDate).slice(0, 7);
        const c = lunarReturnsInMonth(m, month).find((x) => x.requestDate === body.returnDate)!;
        r.lunarReturnDate = new Date(Date.parse(`${c.approxUtc}:00Z`) + 3 * 3600_000).toISOString().slice(0, 19);
      }
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
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, preview = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: preview });
const SR = (loc: string | null = null, extra: Record<string, unknown> = {}) => ({ technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "placidus", returnLocationId: loc, ...extra } });
const LR = (loc: string | null = null, month = "2026-10", sequence = 1) => ({ technique: "western.lunar_return", options: { month, sequence, houseSystem: "placidus", returnLocationId: loc } });

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
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Bağımsız ASC/MC (astronomy-engine yıldız zamanı + standart formül). */
function ascMc(utcIso: string, lat: number, lon: number) {
  const tm = Astronomy.MakeTime(new Date(utcIso));
  const r = Math.PI / 180;
  const lst = (Astronomy.SiderealTime(tm) * 15 + lon + 360) % 360;
  const eps = 23.4393 - 0.0000004 * tm.tt;
  const mc = (Math.atan2(Math.sin(lst * r), Math.cos(lst * r) * Math.cos(eps * r)) / r + 360) % 360;
  const asc = (Math.atan2(Math.cos(lst * r), -(Math.sin(lst * r) * Math.cos(eps * r) + Math.tan(lat * r) * Math.sin(eps * r))) / r + 360) % 360;
  return { asc, mc };
}

async function main() {
  // ═══ A) SAĞLAYICI SÖZLEŞMESİ (gerçek golden) ═══════════════════════════════════
  await t("golden: 2 yeni fixture = ürün gövdesi; İstanbul golden'ından TEK fark enlem/boylam (doğum anı/ofset/yıl/gün aynı)", () => {
    for (const g of goldenPlan41()) {
      const f = load(g.name);
      assert.deepEqual(f.body, JSON.parse(JSON.stringify(g.body)));
      assert.ok(!/api[_-]?key|x-api-key|Bearer /i.test(JSON.stringify(f)));
    }
    for (const [a, b] of [[SR_IST, SR_LON], [LR_IST, LR_LON]]) {
      const da = { ...a.body, latitude: 0, longitude: 0 };
      const db = { ...b.body, latitude: 0, longitude: 0 };
      assert.deepEqual(da, db, "konum dışında gövde farkı var");
      assert.equal(b.body.timezone, 3, "doğum ofseti yerine hedef saat dilimi gönderilmiş");
      assert.deepEqual([b.body.latitude, b.body.longitude], [RETURN_TARGET.latitude, RETURN_TARGET.longitude]);
    }
  });

  await t("golden kanıt: Londra'da dönüş ANI, natal nokta ve 14 gezegen boylamı İstanbul ile AYNI; konum yankısı Londra; ASC/MC + 12 ev FARKLI", () => {
    for (const [a, b, dk, nk] of [[SR_IST, SR_LON, "solarReturnDate", "natalSunPosition"], [LR_IST, LR_LON, "lunarReturnDate", "natalMoonPosition"]] as const) {
      const ra = a.response;
      const rb = b.response;
      assert.equal(rb[dk], ra[dk], `${dk}: konumla kaydı`);
      assert.equal(rb[nk].longitude, ra[nk].longitude);
      for (const p of ra.chart.planets) assert.equal(rb.chart.planets.find((q: J) => q.name === p.name).longitude, p.longitude, `${p.name} boylamı değişti`);
      assert.deepEqual([rb.location.latitude, rb.location.longitude], [RETURN_TARGET.latitude, RETURN_TARGET.longitude]);
      assert.ok(angDiff(rb.chart.ascendant.longitude, ra.chart.ascendant.longitude) > 5, "ASC değişmeli");
      assert.ok(angDiff(rb.chart.midheaven.longitude, ra.chart.midheaven.longitude) > 5, "MC değişmeli");
      assert.equal(ra.chart.houses.filter((h: J, i: number) => Math.abs(h.longitude - rb.chart.houses[i].longitude) > 0.01).length, 12);
    }
  });

  await t("astronomi: Londra dönüş haritalarının ASC/MC'si (aynı UTC an, Londra koordinatı) astronomy-engine ile ≤ 0.01°; Güneş/Ay = natal nokta", () => {
    const msgs: string[] = [];
    for (const [g, kind] of [[SR_LON, "solar"], [LR_LON, "lunar"]] as const) {
      const tech = (projectRoxyReturn(g.response, kind, { houseSystem: "placidus", returnYear: kind === "solar" ? 2026 : null, returnDate: kind === "lunar" ? g.body.returnDate : null, expectedLocation: RETURN_TARGET }) as J).technical;
      const utc = returnUtcIso(tech)!;
      const { asc, mc } = ascMc(utc, RETURN_TARGET.latitude, RETURN_TARGET.longitude);
      const dAsc = angDiff(tech.chart.angles.ascendant.longitude, asc);
      const dMc = angDiff(tech.chart.angles.midheaven.longitude, mc);
      assert.ok(dAsc < 0.01 && dMc < 0.01, `${kind}: ASC ${dAsc} MC ${dMc}`);
      const body = kind === "solar" ? Astronomy.Body.Sun : Astronomy.Body.Moon;
      const lonAt = Astronomy.Ecliptic(Astronomy.GeoVector(body, Astronomy.MakeTime(new Date(utc)), true)).elon;
      assert.ok(angDiff(lonAt, tech.natalPoint.longitude) < 0.01, `${kind}: dönüş anında ${kind === "solar" ? "Güneş" : "Ay"} natal noktada değil`);
      msgs.push(`${kind} ASC ${(dAsc * 3600).toFixed(1)}″ MC ${(dMc * 3600).toFixed(1)}″`);
    }
    console.log(`     ${msgs.join(" · ")}`);
  });

  // ═══ B) GERİYE UYUM ════════════════════════════════════════════════════════════
  await t("1+2) varsayılan (doğum yeri) Solar/Lunar gövdesi ve anahtarı Aşama 3 ile BİREBİR; sırasız/konumsuz eski seçenek = aynı anahtar", () => {
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null };
    const sr = getTechnique("western.solar_return")!;
    const oldOpt = sr.parseOptions({ returnYear: 2026, houseSystem: "placidus" }, new Date())!;
    const newOpt = sr.parseOptions({ returnYear: 2026, houseSystem: "placidus", returnLocationId: null }, new Date())!;
    assert.equal(oldOpt.returnLocationId, null);
    const u0 = sr.units(ctx, oldOpt)[0];
    assert.deepEqual(JSON.parse(JSON.stringify(u0.body)), SR_IST.body);
    assert.equal(u0.inputHash, sr.units(ctx, newOpt)[0].inputHash);
    const lr = getTechnique("western.lunar_return")!;
    const lo = lr.parseOptions({ month: "2026-10", houseSystem: "placidus" }, new Date())!;
    assert.deepEqual(JSON.parse(JSON.stringify(lr.units(ctx, lo)[0].body)), LR_IST.body);
    assert.equal(sr.parseOptions({ returnYear: 2026, returnLocationId: "bad id!" }, new Date()), null, "geçersiz konum kimliği kabul edildi");
  });

  // ═══ C) KONUM DAVRANIŞI ════════════════════════════════════════════════════════
  await t("4+6) Solar İstanbul vs Londra: 2 ayrı istek/anahtar; dönüş anı ve gezegenler aynı, ASC/MC farklı; görünüm konumu açıkça taşır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SR(), SR("gb-london")], rx.deps)).body as J;
    assert.equal(rx.calls.length, 2);
    const [ist, lon] = r.results.map((x: J) => x.view);
    assert.notEqual(ist.id, lon.id);
    assert.equal(ist.technical.returnLocal, lon.technical.returnLocal, "dönüş anı konumla kaydı");
    assert.deepEqual(ist.technical.chart.bodies.map((b: J) => b.longitude), lon.technical.chart.bodies.map((b: J) => b.longitude));
    assert.ok(angDiff(ist.technical.chart.angles.ascendant.longitude, lon.technical.chart.angles.ascendant.longitude) > 5);
    assert.equal(lon.options.returnLocation.locationId, "gb-london");
    assert.equal(lon.options.returnLocation.timezone, "Europe/London");
    assert.equal(ist.options.returnLocation.locationId, null);
    assert.ok(describeOptions("western.solar_return", lon.options).includes("London"), describeOptions("western.solar_return", lon.options));
    assert.ok(describeOptions("western.solar_return", ist.options).includes("doğum yeri"));
    assert.equal(rx.calls[1].body.timezone, 3, "hedef saat dilimi hesaba girdi");
  });

  await t("3+5) Lunar: aynı ayda 1. ve 2. dönüş + Londra → 2 istek, sıralar korunur, konum sırayı/anı değiştirmez; İstanbul vs Londra ayrı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const sels = [LR("gb-london", "2027-06", 1), LR("gb-london", "2027-06", 2), LR(null, "2027-06", 2)];
    const p = (await planAstrology(ctx, { profileId: pa, selections: sels })).body as J;
    assert.deepEqual(p.plan.selections.map((s: J) => s.newRequests), [1, 1, 1]);
    assert.deepEqual(p.plan.selections[0].info.lunarReturns.map((x: J) => x.sequence), [1, 2]);
    const r = (await run(ctx, pa, sels, rx.deps)).body as J;
    assert.equal(rx.calls.length, 3);
    const v = r.results.map((x: J) => x.view);
    assert.deepEqual(v.map((x: J) => x.technical.requested.sequence), [1, 2, 2]);
    const jun = lunarReturnsInMonth(natalMoonLongitude(SYNTH_A.utc), "2027-06");
    assert.equal(v[1].technical.requested.expectedUtc, jun[1].approxUtc);
    assert.equal(v[1].technical.returnLocal, v[2].technical.returnLocal, "Londra ve doğum yeri 2. dönüşü aynı anda olmalı");
    assert.equal(rx.calls[0].body.returnDate, jun[0].requestDate);
    assert.equal(rx.calls[1].body.returnDate, jun[1].requestDate);
    assert.deepEqual([rx.calls[1].body.latitude, rx.calls[2].body.latitude], [RETURN_TARGET.latitude, ISTANBUL.latitude]);
  });

  await t("7) yanlış konum → LOCATION_NOT_FOUND, 0 istek; istemci koordinatı yok sayılır; sağlayıcı başka konumu hesaplarsa kaydedilmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SR("xx-yok"), LR("xx-yok")], rx.deps)).body as J;
    assert.equal(rx.calls.length, 0);
    assert.deepEqual(r.results.map((x: J) => x.code), ["LOCATION_NOT_FOUND", "LOCATION_NOT_FOUND"]);
    await run(ctx, pa, [SR("gb-london", { returnLocation: { latitude: 1, longitude: 2 }, latitude: 1 })], rx.deps);
    assert.equal(rx.calls[0].body.latitude, RETURN_TARGET.latitude, "istemci koordinatı kullanıldı");
    const store2 = seed();
    const ctx2 = ctxOf(store2);
    const pb = await profile(ctx2);
    const bad = roxy({ wrongLocation: true });
    const r2 = (await run(ctx2, pb, [SR("gb-london"), LR("gb-london")], bad.deps)).body as J;
    assert.deepEqual(r2.results.map((x: J) => x.code), ["PROVIDER_INVALID_RESPONSE", "PROVIDER_INVALID_RESPONSE"]);
    assert.equal((store2.tables.astro_provider_results ?? []).length, 0);
  });

  await t("8+9) önbellek: aynı konum 0 istek; Londra vs Berlin vs doğum yeri ayrı anahtar; konum kimliği aynı koordinatsa (İstanbul) doğum yeri hesabını paylaşır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [SR(), SR("gb-london"), LR("gb-london")], rx.deps);
    assert.equal(rx.calls.length, 3);
    await run(ctx, pa, [SR(), SR("gb-london"), LR("gb-london")], rx.deps);
    assert.equal(rx.calls.length, 3, "tekrar istek yapıldı");
    const p = (await planAstrology(ctx, { profileId: pa, selections: [SR("de-berlin"), SR("gb-london"), SR(), SR("tr-34-istanbul")] })).body as J;
    assert.deepEqual(p.plan.selections.map((s: J) => s.newRequests), [1, 0, 0, 0]);
    assert.equal(p.plan.selections[0].options.returnLocation.latitude, BERLIN.lat);
  });

  // ═══ D) KAYITLI ANALİZ + NOTLAR ════════════════════════════════════════════════
  await t("10) eski (Aşama 3 biçimli) Solar/Lunar analizleri açılır; parametrelerde konum yoksa 'doğum yeri' sayılır, içerik değişmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [SR(), LR()], rx.deps);
    const ids: string[] = [];
    for (const s of [SR(), LR()]) {
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...s, saveRequestId: randomUUID() }, false);
      ids.push((sv.body as J).analysisId);
    }
    // Aşama 3'te kaydedilmiş satırı taklit et: technique_params'ta returnLocation/returnLocationId YOK.
    for (const id of ids) {
      const row = store.tables.astro_analyses.find((x) => x.id === id)!;
      const tp = row.technique_params as Record<string, unknown>;
      delete tp.returnLocation;
      delete tp.returnLocationId;
      const ms = row.method_snapshot as Record<string, unknown>;
      delete (ms.options as Record<string, unknown>).returnLocation;
    }
    const before = JSON.stringify(store.tables.astro_analyses);
    for (const id of ids) {
      const a = (await getAnalysis(ctx, id, false)).body as J;
      assert.equal(a.ok, true);
      assert.ok(a.analysis.technical.chart.bodies.length >= 10);
      assert.ok(!describeOptions(a.analysis.technique, a.analysis.params).includes("konum:"));
    }
    assert.equal(JSON.stringify(store.tables.astro_analyses), before, "açmak kaydı değiştirdi");
  });

  await t("11) yeni relocated analiz: snapshot konum (etiket/enlem/boylam/tz) + teknik konum + sıra + sürüm; açmak 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [SR("gb-london"), LR("gb-london", "2027-06", 2)], rx.deps);
    const n = rx.calls.length;
    const sv1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SR("gb-london"), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    const sv2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...LR("gb-london", "2027-06", 2), saveRequestId: randomUUID() }, false);
    assert.deepEqual([sv1.status, sv2.status], [201, 201]);
    const before = store.log.length;
    const a1 = ((await getAnalysis(ctx, (sv1.body as J).analysisId, false)).body as J).analysis;
    const a2 = ((await getAnalysis(ctx, (sv2.body as J).analysisId, false)).body as J).analysis;
    assert.deepEqual([a1.params.returnLocation.label.includes("London"), a1.params.returnLocation.latitude, a1.params.returnLocation.timezone], [true, RETURN_TARGET.latitude, "Europe/London"]);
    assert.deepEqual([a1.technical.location.latitude, a1.technical.location.longitude], [RETURN_TARGET.latitude, RETURN_TARGET.longitude]);
    assert.ok(a1.title.includes("London"), a1.title);
    assert.equal(a1.versions.adapterVersion, "astro-roxy-solar-return-1");
    assert.deepEqual([a2.params.sequence, a2.technical.requested.sequence, a2.params.month], [2, 2, "2027-06"]);
    assert.equal(rx.calls.length, n, "açmak istek yaptı");
    assert.ok(!store.log.slice(before).some((l) => l.table === "astro_provider_results" || l.table === "astro_provider_interpretations"));
  });

  await t("12) uzman notları: Londra Solar notu ≠ doğum yeri Solar notu; doğum yeri bağlamı eski ('') bağlamla aynı; sahte bağlam reddedilir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [SR(), SR("gb-london")], rx.deps);
    const note = async (o: J, status = 201) => {
      const r = await saveExpertNote(ctx, { profileId: pa, technique: "western.solar_return", sectionKey: "overall", expectedRevision: null, ...o });
      assert.equal(r.status, status, JSON.stringify(r.body));
    };
    await note({ body: "İstanbul SR notu" });
    await note({ contextLocationId: "gb-london", body: "Londra SR notu" });
    await note({ contextLocationId: "gb-london", contextKey: randomUUID(), body: "sahte" }, 400);
    const ws = async (s: J) => ((await getWorkspace(ctx, { profileId: pa, revision: 1, ...s })).body as J);
    const wi = await ws(SR());
    const wl = await ws(SR("gb-london"));
    assert.deepEqual(wi.notes.map((n: J) => n.body), ["İstanbul SR notu"]);
    assert.deepEqual(wl.notes.map((n: J) => n.body), ["Londra SR notu"]);
    assert.equal(wi.contextKey, "");
    assert.equal(wl.contextKey, locationContextKey("western.solar_return", "gb-london"));
    // Genel KB eşleşmesi konu anahtarına göre devam eder (solar_return_* bağlamı; konumdan bağımsız taksonomi).
    assert.ok(wl.topics.every((x: J) => x.key.startsWith("solar_return_")));
  });

  // ═══ E) GÜVENLİK ═══════════════════════════════════════════════════════════════
  await t("13+14) yorum kapalı/önizlemede Londra anlatısı yok; yetkilide var; ham alan/anahtar hiçbir yanıtta yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const sels = [SR("gb-london"), LR("gb-london")];
    const vis = (await run(ctx, pa, sels, rx.deps)).body as J;
    const hid = (await run(ctxOf(store, { entitlements: NO_INTERP }), pa, sels, rx.deps)).body as J;
    const pre = (await run(ctx, pa, sels, rx.deps, true)).body as J;
    const narr = [...narratives(SR_LON.response), ...narratives(LR_LON.response)];
    assert.ok(narr.some((x) => JSON.stringify(vis).includes(x)), "yetkili yorumu görmeli");
    for (const b of [hid, pre]) assert.ok(!narr.some((x) => JSON.stringify(b).includes(x)), "anlatı sızdı");
    for (const b of [vis, hid, pre]) for (const m of ["natalSunPosition", "solarReturnDate", "lunarReturnDate", "raw_response", "input_hash", "k-test-41", "signLocalized"]) assert.ok(!JSON.stringify(b).includes(m), m);
  });

  await t("15) tenant izolasyonu: başka tenant relocated return sonucu/analizi/çalışma alanı/notu için 404", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SR("gb-london")], rx.deps)).body as J;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SR("gb-london"), saveRequestId: randomUUID() }, false);
    const ctxB = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    assert.equal((await getAstrologyResult(ctxB, r.results[0].view.id, { profileId: null, revision: null, ownerPreviewHideInterp: false })).status, 404);
    assert.equal((await getAnalysis(ctxB, (sv.body as J).analysisId, false)).status, 404);
    assert.equal((await getWorkspace(ctxB, { profileId: pa, revision: 1, ...SR("gb-london") })).status, 404);
    assert.equal((await saveExpertNote(ctxB, { profileId: pa, technique: "western.solar_return", contextLocationId: "gb-london", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  await t("16) saat bilinmiyor: konum seçilse de Solar/Lunar TIME_REQUIRED, 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const rx = roxy();
    const r = (await run(ctx, pu, [SR("gb-london"), LR("gb-london")], rx.deps)).body as J;
    assert.equal(rx.calls.length, 0);
    assert.deepEqual(r.results.map((x: J) => x.code), ["TIME_REQUIRED", "TIME_REQUIRED"]);
  });

  await t("saat gösterimi: UTC an = sağlayıcı yerel − ofset; Londra yerel saati IANA ile (BST); dilim yoksa/geçersizse tahmin YOK", () => {
    const utc = returnUtcIso({ returnLocal: "2026-07-15T07:19:56", returnOffsetHours: 3 });
    assert.equal(utc, "2026-07-15T04:19:56.000Z");
    const lon = localTimeIn(utc!, "Europe/London")!;
    assert.ok(lon.includes("05:19"), lon);
    assert.equal(localTimeIn(utc!, null), null);
    assert.equal(localTimeIn(utc!, "Not/AZone"), null);
    assert.equal(returnUtcIso({ returnLocal: "bozuk", returnOffsetHours: 3 }), null);
  });

  console.log(`\nastrology phase4.1 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase4.1 harness çöktü:", e);
  process.exit(1);
});
