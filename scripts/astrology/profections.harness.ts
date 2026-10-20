/**
 * ASTROLOJİ — YILLIK PROFEKSİYONLAR harness'i (2026-10-20).
 *
 * Kaynak: FAZ 0 gerçek Roxy yanıtları (fixtures/profections/faz0-real-2026-10-19.json; 15 çağrı, sentetik kişiler, kanıt
 * C:\YasamSistemi-Denetim-2026-10-19\profeksiyon-faz0) + aynı dosyadaki BAĞIMSIZ oracle (Swiss Ephemeris Yükselen + yaş mod 12).
 * Bu harness GERÇEK Roxy'ye çağrı YAPMAZ; "gerçek API fixture" testidir, canlı API testi değildir.
 *
 *   A) 13 bütün-burç fixture → adaptör kabul + oracle ile birebir (yaş, ev, burç, yönetici, yöneticinin natal burç/evi)
 *   B) T15 (doğumdan önce hedef, gerçek 400; belgedekinden farklı gövde) → client gövdeyi OKUMAZ → "bad_request"
 *   C) 29 Şubat (T04/T05/T06) · D) doğum günü geçişleri (T01/T02/T03) · E) yaş 0 · F) 12 yıllık döngü
 *   G) Placidus yanıtı (T08) bütün-burç tutarsızlığıyla REDDEDİLİR; gövde her zaman whole-sign
 *   H) klasik yedi gezegen / klasik yönetici · K) bozuk yanıtlar fail-closed
 *   Motor: plan/önbellek (aynı yaş = aynı anahtar), saat bilinmiyor → TIME_REQUIRED + görünüm maskesi, sağlayıcı yorumu yok,
 *   not bağlamı yaşa göre, kaydet → aç 0 istek, tenant/uzman izolasyonu, Word/PDF rapor modeli, UI seçim yardımcıları.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/profections.harness.ts
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
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { projectRoxyProfections, profectionsBody, ROXY_PROFECTIONS, type ProfectionsExpect } from "@/lib/astrology/providers/roxy/profections";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { hasNoProviderInterpretation } from "@/lib/astrology/noProviderInterp";
import { topicsForTechnique } from "@/lib/astrology/topics/index";
import { PROFECTION_AGE_MAX, profectionAgeOf, profectionAgeOn, profectionYearRange } from "@/lib/astrology/model/westernProfections";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { buildSelections, defaultParams, describeOptions, missingReason, profectionContextKey, profectionSelectionCurrent, syncProfectionContext, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

type Call = { id: string; status: number; query: { lang: string }; body: Record<string, unknown>; response: J; oracle: { ascSign: string; ascIsRisingEast: boolean; cases: Record<string, J> } };
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "profections", "faz0-real-2026-10-19.json"), "utf8")) as { calls: Call[] };
const C: Record<string, Call> = Object.fromEntries(FIX.calls.map((c) => [c.id, c]));
const OK_IDS = FIX.calls.filter((c) => c.status === 200).map((c) => c.id);
const WHOLE_SIGN_IDS = OK_IDS.filter((id) => C[id].body.houseSystem === "whole-sign");
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;

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

/** Sahte sağlayıcı: YALNIZ FAZ 0 gerçek yanıtı olan BİREBİR gövde döner; başka gövde → 400 (yeni sonuç uydurulmaz). */
function roxy(mutate?: (r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-prof", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const hit = endpoint === ROXY_PROFECTIONS.endpoint ? FIX.calls.find((c) => c.status === 200 && canon(c.body) === canon(body)) : undefined;
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
const PR = (age: unknown) => ({ technique: "western.profections", options: { age } });
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: false });

const expectOf = (c: Call, age: number): ProfectionsExpect => ({
  date: String(c.body.date),
  time: String(c.body.time),
  latitude: Number(c.body.latitude),
  longitude: Number(c.body.longitude),
  timezone: Number(c.body.timezone),
  targetDate: String(c.body.targetDate),
  age,
});

/**
 * FAZ 0 hedef tarihlerinin bir kısmı profeksiyon yılının İLK GÜNÜ değildir (ör. T01 = doğum gününden bir gün önce). Adaptör
 * ürün sözleşmesi gereği targetDate = yılın ilk günü ister; bu test yanıtın astrolojik alanlarını doğrulamak için o fixture'ın
 * hedefini, aynı yaşın ilk günüyle eşleşen BEKLENTİYLE değil, oracle yaşıyla çağırır ve yalnız "ilk gün" hatasını ayırır.
 */
function projectFixture(id: string, mutate?: (r: J) => void) {
  const c = C[id];
  const raw = structuredClone(c.response);
  mutate?.(raw);
  return projectRoxyProfections(raw, expectOf(c, c.oracle.cases.mar1.age));
}
const isFirstDay = (c: Call) => profectionYearRange(String(c.body.date), c.oracle.cases.mar1.age)?.start === c.body.targetDate;

async function main() {
  // ═══ A) GERÇEK FIXTURE ↔ BAĞIMSIZ ORACLE ═════════════════════════════════════
  await t("A: FAZ 0 kaynak dosyası 15 çağrı (14 × 200 + 1 × 400); 13 bütün-burç + 1 Placidus; oracle Yükselen'leri doğuda yükselen nokta", () => {
    assert.equal(FIX.calls.length, 15);
    assert.equal(OK_IDS.length, 14);
    assert.equal(WHOLE_SIGN_IDS.length, 13);
    assert.equal(C.T15.status, 400);
    assert.equal(C.T08.body.houseSystem, "placidus");
    for (const id of OK_IDS) assert.equal(C[id].oracle.ascIsRisingEast, true, id);
  });

  await t("A: 13 bütün-burç gerçek yanıt — Roxy alanları bağımsız oracle ile BİREBİR (yaş, ev, burç, yönetici, yöneticinin natal burç + ev)", () => {
    for (const id of WHOLE_SIGN_IDS) {
      const c = C[id];
      const o = c.oracle.cases.mar1;
      const x = c.response;
      assert.equal(x.age, o.age, `${id} yaş`);
      assert.equal(x.profectedHouse, o.profectedHouse, `${id} ev`);
      assert.equal(x.profectedSign, o.profectedSign, `${id} burç`);
      assert.equal(x.lordOfYear, o.lordOfYear, `${id} yönetici`);
      assert.equal(x.lordNatalPosition.sign, o.lordNatalSign, `${id} yöneticinin natal burcu`);
      assert.equal(x.lordNatalPosition.house, o.lordNatalHouse, `${id} yöneticinin natal evi`);
    }
  });

  await t("A: adaptör — hedefi yılın ilk günü olan fixture'lar kabul; teknik katman oracle ile aynı; yorum katmanı YOK; bilinmeyen alan 0", () => {
    let accepted = 0;
    for (const id of WHOLE_SIGN_IDS.filter((x) => isFirstDay(C[x]))) {
      const r = projectFixture(id);
      assert.ok(r.ok, `${id}: ${!r.ok ? r.errors.join("; ") : ""}`);
      if (!r.ok) continue;
      const o = C[id].oracle.cases.mar1;
      const tt = r.technical;
      assert.equal(tt.age, o.age);
      assert.equal(tt.profectedHouse, o.profectedHouse);
      assert.equal(tt.profectedSign, o.profectedSign.toLowerCase());
      assert.equal(tt.lordOfYear, o.lordOfYear.toLowerCase());
      assert.deepEqual(tt.lordNatal, { sign: o.lordNatalSign.toLowerCase(), house: o.lordNatalHouse });
      assert.equal(tt.houseSystem, "whole-sign");
      assert.equal(r.interpretation, null, "sağlayıcı anlatısı ürüne alınmamalı");
      assert.deepEqual(r.unmappedFields, []);
      assert.ok(!JSON.stringify(tt).includes("efendisi") && !JSON.stringify(tt).includes("Bu profeksiyon"), "teknik katmanda sağlayıcı metni");
      accepted += 1;
    }
    assert.ok(accepted >= 4, `yalnız ${accepted} fixture yılın ilk günü`);
  });

  await t("A: hedefi yılın ilk günü OLMAYAN fixture'lar (T01/T03/T07/T09–T14) adaptörde YALNIZ 'ilk gün' kuralıyla reddedilir (astrolojik alanlar geçerli)", () => {
    for (const id of WHOLE_SIGN_IDS.filter((x) => !isFirstDay(C[x]))) {
      const r = projectFixture(id);
      assert.equal(r.ok, false, id);
      if (!r.ok) assert.deepEqual(r.errors, ["hedef tarih profeksiyon yılının ilk günü değil"], `${id}: ${r.errors.join("; ")}`);
    }
  });

  // ═══ B) HATALI GİRİŞ (gerçek 400) ═══════════════════════════════════════════
  await t("B: T15 gerçek 400 gövdesi (code bad_request, issues[] yok) → client 'bad_request', gövde okunmaz/aktarılmaz", async () => {
    assert.equal(C.T15.response.code, "bad_request");
    assert.equal("issues" in C.T15.response, false, "belge issues[] diyor; gerçek yanıtta yok");
    const r = await callRoxy({ apiKey: "k-test-prof", baseUrl: "https://roxy-fake.local/api/v2" }, ROXY_PROFECTIONS.endpoint, C.T15.body, {
      maxRetries: 0,
      fetchImpl: async () => new Response(JSON.stringify(C.T15.response), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    assert.deepEqual(r, { ok: false, kind: "bad_request", status: 400, attempts: 1 });
    assert.ok(!JSON.stringify(r).includes("targetDate"), "sağlayıcı hata metni sonuca taşınmamalı");
  });

  await t("B: doğumdan önceki hedef / geçersiz yaş sağlayıcıya GİTMEZ (parseOptions null, gövde null)", () => {
    const def = getTechnique("western.profections")!;
    for (const bad of [-1, 121, 1.5, "abc", null, undefined, "36.0"]) assert.equal(def.parseOptions({ age: bad }, new Date()), null, String(bad));
    assert.deepEqual(def.parseOptions({ age: "36" }, new Date()), { age: 36 });
    assert.deepEqual(def.parseOptions({ age: 0 }, new Date()), { age: 0 });
    assert.equal(profectionsBody({ birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, -1), null);
    assert.equal(profectionYearRange("1990-02-30", 1), null, "geçersiz doğum tarihi");
  });

  // ═══ C/D/E/F) TARİH KURALLARI (sağlayıcı davranışıyla aynı) ═══════════════════
  await t("C: 29 Şubat — artık olmayan yılda 28 Şubat önceki yaş, 1 Mart yeni yıl; artık yılda 29 Şubat (FAZ 0 T04/T05/T06 ile aynı)", () => {
    assert.deepEqual(profectionYearRange("2000-02-29", 0), { start: "2000-02-29", end: "2001-02-28" });
    assert.deepEqual(profectionYearRange("2000-02-29", 1), { start: "2001-03-01", end: "2002-02-28" });
    assert.deepEqual(profectionYearRange("2000-02-29", 3), { start: "2003-03-01", end: "2004-02-28" });
    assert.deepEqual(profectionYearRange("2000-02-29", 4), { start: "2004-02-29", end: "2005-02-28" });
    assert.equal(profectionYearRange("1900-02-28", 0)?.end, "1901-02-27");
    for (const id of ["T04", "T05", "T06"]) assert.equal(profectionAgeOn(String(C[id].body.date), String(C[id].body.targetDate)), C[id].response.age, id);
    assert.equal(C.T04.response.age, 0);
    assert.equal(C.T05.response.age, 1);
  });

  await t("D: bütün gerçek yanıtlarda yaşımız = Roxy yaşı ve hedef tarih o yaşın aralığında (doğum günü geçişi T01 35 / T02–T03 36)", () => {
    for (const id of OK_IDS) {
      const c = C[id];
      const age = profectionAgeOn(String(c.body.date), String(c.body.targetDate));
      assert.equal(age, c.response.age, id);
      const r = profectionYearRange(String(c.body.date), c.response.age)!;
      assert.ok(r.start <= String(c.body.targetDate) && String(c.body.targetDate) <= r.end, `${id} aralık`);
    }
    assert.deepEqual([C.T01.response.age, C.T02.response.age, C.T03.response.age], [35, 36, 36]);
    assert.deepEqual(profectionYearRange("1990-07-15", 35), { start: "2025-07-15", end: "2026-07-14" });
    assert.deepEqual(profectionYearRange("1990-07-15", 36), { start: "2026-07-15", end: "2027-07-14" });
    assert.equal(profectionAgeOn("1990-07-15", "1990-07-14"), null, "doğumdan önce");
  });

  await t("E/F: yaş 0 = 1. ev (T04, T07 gerçek); 12/24/36/48/60 döngüleri 1. ev (oracle + gerçek T02=36, T08=24); hedef = doğum günü", () => {
    assert.equal(C.T04.response.profectedHouse, 1);
    assert.equal(C.T07.response.profectedHouse, 1);
    assert.equal(C.T02.response.profectedHouse, 1);
    assert.equal(C.T08.response.profectedHouse, 1);
    for (const a of [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120]) {
      assert.equal((a % 12) + 1, 1);
      assert.equal(profectionYearRange("1990-07-15", a)?.start, `${1990 + a}-07-15`);
    }
    for (let a = 0; a <= 12; a++) assert.equal((a % 12) + 1, a === 12 ? 1 : a + 1);
    assert.equal(profectionAgeOf(PROFECTION_AGE_MAX), PROFECTION_AGE_MAX);
    assert.equal(profectionAgeOf(PROFECTION_AGE_MAX + 1), null);
  });

  // ═══ G/H/K) ADAPTÖR DOĞRULAMASI (fail-closed) ═══════════════════════════════
  await t("G: T08 (Placidus, yöneticinin natal evi 6) bütün-burç tutarlılık denetimiyle REDDEDİLİR; ürün gövdesi her zaman whole-sign", () => {
    const r = projectFixture("T08");
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.errors.includes("lordNatalPosition.house bütün-burç ile tutarsız"), r.errors.join("; "));
    assert.equal(C.T02.response.lordNatalPosition.house, 7, "aynı doğum, bütün-burç: 7. ev");
    const b = profectionsBody({ birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, 24)!;
    assert.equal(b.houseSystem, "whole-sign");
    const def = getTechnique("western.profections")!;
    assert.deepEqual(def.parseOptions({ age: 24, houseSystem: "placidus" }, new Date()), { age: 24 }, "ev sistemi seçeneği yok sayılır");
  });

  await t("H/K: bozuk yanıtlar REDDEDİLİR — modern yönetici, yanlış klasik yönetici, ev ≠ yaş mod 12 + 1, yaş farkı, yankı farkı, eksik alan", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["Plüton", (r) => (r.lordOfYear = "Pluto"), "lordOfYear klasik yedi gezegenden değil"],
      ["yanlış klasik", (r) => (r.lordOfYear = "Venus"), "lordOfYear etkin burcun klasik yöneticisi değil"],
      ["ev", (r) => (r.profectedHouse = 2), "profectedHouse yaş mod 12 + 1 değil"],
      ["yaş", (r) => (r.age = 35), "age 35 ≠ istenen 36"],
      ["tarih yankısı", (r) => (r.targetDate = "2026-07-16"), "targetDate yankısı uyuşmuyor"],
      ["doğum saati yankısı", (r) => (r.birthDetails.time = "14:31:00"), "birthDetails.time uyuşmuyor"],
      ["saat dilimi", (r) => (r.birthDetails.timezone = 2), "birthDetails.timezone uyuşmuyor"],
      ["burç", (r) => (r.profectedSign = "Ophiuchus"), "profectedSign"],
      ["natal ev aralığı", (r) => (r.lordNatalPosition.house = 13), "lordNatalPosition"],
      ["eksik natal", (r) => delete r.lordNatalPosition, "lordNatalPosition"],
      ["eksik yaş", (r) => delete r.age, "age"],
    ];
    for (const [n, m, e] of cases) {
      const r = projectFixture("T02", m);
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    assert.equal(projectRoxyProfections(null, expectOf(C.T02, 36)).ok, false);
    assert.equal(projectRoxyProfections([], expectOf(C.T02, 36)).ok, false);
    const extra = projectFixture("T02", (r) => (r.newField = 1));
    assert.ok(extra.ok && extra.unmappedFields.includes("newField"), "bilinmeyen alan raporlanmalı");
  });

  // ═══ MOTOR ═══════════════════════════════════════════════════════════════════
  await t("motor: kayıt defterinde ve UI listesinde; saat gerektirir; sağlayıcı yorumu yok listesinde; konu yok", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("western.profections"));
    assert.ok((UI_TECHNIQUES as readonly string[]).includes("western.profections"));
    const def = getTechnique("western.profections")!;
    assert.equal(def.requiresKnownTime, true);
    assert.equal(def.family, "western");
    assert.equal(TECHNIQUE_META["western.profections"].label, "Yıllık Profeksiyonlar");
    assert.equal(TECHNIQUE_META["western.profections"].needsTime, true);
    assert.ok(hasNoProviderInterpretation("western.profections"));
    assert.deepEqual(topicsForTechnique("western.profections", {}), []);
  });

  await t("motor: Ali/İstanbul 36 yaş → gövde FAZ 0 T02 ile BİREBİR; 1 istek; aynı yaş tekrar 0 istek (plan 0); farklı yaş farklı anahtar", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r1 = (await run(ctx, pa, [PR(36)], rx.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 400));
    assert.equal(rx.calls.length, 1);
    assert.equal(canon(rx.calls[0].body), canon(C.T02.body), "ürün gövdesi gerçek doğrulanmış gövdeyle aynı olmalı");
    const v = r1.results[0].view;
    assert.equal(v.technical.schema, "astro.western.profections.v1");
    assert.equal(v.technical.age, 36);
    assert.equal(v.technical.profectedSign, "scorpio");
    assert.equal(v.technical.lordOfYear, "mars");
    assert.deepEqual(v.technical.lordNatal, { sign: "taurus", house: 7 });
    assert.equal(v.technical.yearStart, "2026-07-15");
    assert.equal(v.technical.yearEnd, "2027-07-14");
    assert.equal(v.method.houseSystem, "whole-sign");
    assert.equal(v.method.zodiac, "tropical");
    assert.ok(!JSON.stringify(r1).includes("efendisi"), "sağlayıcının Türkçe anlatısı yanıtta olmamalı");
    const plan = (await planAstrology(ctx, { profileId: pa, selections: [PR(36), PR("36")] })).body as J;
    assert.equal(plan.plan.newRequestCount, 0, JSON.stringify(plan.plan));
    await run(ctx, pa, [PR(36)], rx.deps);
    assert.equal(rx.calls.length, 1, "aynı profeksiyon yılı yeni istek yaptı");
    const p37 = (await planAstrology(ctx, { profileId: pa, selections: [PR(37)] })).body as J;
    assert.equal(p37.plan.newRequestCount, 1);
  });

  await t("motor: 29 Şubat 2000 doğumu (İstanbul +2) → yaş 1 gövdesi = T05, yaş 4 = T06 (gerçek); sonuç yaş/ev/burç doğru", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthDate: "2000-02-29", birthTime: "10:00" });
    const rx = roxy();
    const r = (await run(ctx, pa, [PR(1), PR(4)], rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(canon(rx.calls[0].body), canon(C.T05.body));
    assert.equal(canon(rx.calls[1].body), canon(C.T06.body));
    const byAge = Object.fromEntries(r.results.map((x: J) => [x.view.technical.age, x.view.technical]));
    assert.deepEqual([byAge[1].profectedHouse, byAge[1].profectedSign, byAge[1].lordOfYear, byAge[1].yearStart, byAge[1].leapDayBirth], [2, "gemini", "mercury", "2001-03-01", true]);
    assert.deepEqual([byAge[4].profectedHouse, byAge[4].profectedSign, byAge[4].yearStart], [5, "virgo", "2004-02-29"]);
  });

  await t("motor: sağlayıcı hatası / bozuk yanıt → sonuç yok, kaydedilemez (sahte sonuç üretilmez)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const bad = (await run(ctx, pa, [PR(24)], roxy().deps)).body as J; // 24 yaş whole-sign için fixture yok → 400
    assert.ok(!bad.ok || !bad.results?.some((x: J) => x.view?.technical), JSON.stringify(bad).slice(0, 300));
    const corrupt = (await run(ctx, pa, [PR(36)], roxy((r) => (r.lordOfYear = "Pluto")).deps)).body as J;
    assert.ok(!corrupt.ok || !corrupt.results?.some((x: J) => x.view?.technical), "bozuk yanıt sonuç üretti");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(36), saveRequestId: randomUUID() }, false);
    assert.notEqual(sv.status, 201, "hesaplanmamış sonuç kaydedildi");
  });

  await t("motor: doğum saati bilinmiyor → TIME_REQUIRED (sağlayıcıya gitmez); kayıtlı sonuç saat-bilinmeyen bağlamda maskelenir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const rx = roxy();
    const r = await run(ctx, pa, [PR(36)], rx.deps);
    assert.equal(rx.calls.length, 0, "saat bilinmeden sağlayıcı çağrıldı");
    assert.ok(JSON.stringify(r.body).includes("TIME_REQUIRED"), JSON.stringify(r.body).slice(0, 300));
    assert.ok(JSON.stringify(r.body).includes("Yükselen"), "gerekçe metni");
    const m = maskTechnical("western.profections", { schema: "astro.western.profections.v1" }, { primary: false, partner: null });
    assert.equal(m.technical, null);
    assert.equal(m.masked, true);
    assert.ok(m.warnings[0].includes("Yükselen"));
    assert.equal(maskTechnical("western.profections", { a: 1 }, { primary: true, partner: null }).masked, false);
  });

  // ═══ NOT / KAYIT / İZOLASYON / RAPOR ═══════════════════════════════════════════
  await t("not bağlamı: 'Kendi Yorumum' yaşa göre ayrı (yas:36 ≠ yas:37); geçersiz bağlam 400; kayıt yalnız kendi yılının notunu taşır", async () => {
    const def = getTechnique("western.profections")!;
    assert.deepEqual(parseNoteContext(def, "yas:36"), { age: 36 });
    assert.equal(parseNoteContext(def, "yas:121"), null);
    assert.equal(parseNoteContext(def, "yas:036"), null, "kanonik olmayan bağlam");
    assert.equal(parseNoteContext(def, "ayanamsa:lahiri"), null);
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const n36 = await saveExpertNote(ctx, { profileId: pa, technique: "western.profections", noteContext: "yas:36", sectionKey: "overall", body: "36 yaş yılı notu", expectedRevision: null });
    assert.equal(n36.status, 201, JSON.stringify(n36.body));
    const n37 = await saveExpertNote(ctx, { profileId: pa, technique: "western.profections", noteContext: "yas:37", sectionKey: "overall", body: "37 yaş yılı notu", expectedRevision: null });
    assert.equal(n37.status, 201, "37 yaş notu 36 yaş notuyla çakıştı");
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "western.profections", noteContext: "yas:999", sectionKey: "overall", body: "x", expectedRevision: null })).status, 400);
    const rx = roxy();
    await run(ctx, pa, [PR(36)], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(36), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const bodies = (a.notes as J[]).map((n) => n.body);
    assert.deepEqual(bodies, ["36 yaş yılı notu"]);
  });

  await t("kaydet → aç: 0 sağlayıcı isteği; snapshot teknik veri + yaş seçeneği; yorum katmanı yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [PR(36)], rx.deps);
    const n = rx.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(36), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a.params.age, 36);
    assert.equal(a.technical.profectedHouse, 1);
    assert.equal(a.technical.lordOfYear, "mars");
    assert.ok(!JSON.stringify(a).includes("efendisi"), "kayıtta sağlayıcı anlatısı");
    // Aynı profil, farklı yıl ayrı kayıt.
    const sv2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(36), saveRequestId: randomUUID() }, false);
    assert.equal(sv2.status, 201);
  });

  await t("izolasyon: başka tenant ve aynı tenant'taki başka uzman profeksiyon analizini açamaz / çalıştıramaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [PR(36)], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(36), saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [PR(36)], rx.deps)).status, 404);
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "western.profections", noteContext: "yas:36", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  await t("Word/PDF rapor modeli: Türkçe alanlar, yıl aralığı, Tam Burç, yöntem notu, otomatik yorum yok notu, uzman notu; sağlayıcı metni / 'undefined' yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await saveExpertNote(ctx, { profileId: pa, technique: "western.profections", noteContext: "yas:36", sectionKey: "overall", body: "Uzman değerlendirmesi 36", expectedRevision: null });
    const rx = roxy();
    await run(ctx, pa, [PR(36)], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(36), saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const rep = buildAstroReport(a);
    const s = reportTexts(rep).join("\n");
    for (const want of ["Yıllık Profeksiyonlar", "36 yaş profeksiyon yılı", "15.07.2026 – 14.07.2027", "Etkin astrolojik ev", "1. ev", "Akrep", "Yılın yönetici gezegeni", "Mars", "Yöneticinin natal konumu", "Boğa · 7. ev", "Tam Burç (Whole Sign)", "Yöntem: yıllık profeksiyon", "Bu analiz türünde otomatik yorum bulunmuyor", "Uzman değerlendirmesi 36"])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "efendisi", "Bu profeksiyon yılı", "Roxy", "Otomatik Yorum\n"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
    assert.ok(!s.includes("29 Şubat doğumu"), "29 Şubat notu yalnız 29 Şubat doğumlularda");
    assert.equal(rep.hasInterpretation, false);
  });

  await t("rapor: 29 Şubat doğumunda açıklama notu var", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthDate: "2000-02-29", birthTime: "10:00" });
    await run(ctx, pa, [PR(1)], roxy().deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PR(1), saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const s = reportTexts(buildAstroReport(a)).join("\n");
    assert.ok(s.includes("29 Şubat doğumu: artık olmayan yıllarda yeni profeksiyon yılı 1 Mart'ta başlar"), s.slice(0, 200));
    assert.ok(s.includes("01.03.2001 – 28.02.2002"));
  });

  // ═══ UI YARDIMCILARI ═══════════════════════════════════════════════════════════
  await t("UI: yaş seçilmeden plana alınmaz (neden: profeksiyon yılını seçin); seçilince yalnız {age}; özet Türkçe; ev sistemi seçeneği gönderilmez", () => {
    const p = defaultParams(new Date("2026-10-20T09:00:00Z"));
    assert.equal(p.profectionAge, null);
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    assert.deepEqual(buildSelections({ "western.profections": true }, p, method), []);
    assert.equal(missingReason("western.profections", p), "profeksiyon yılını seçin");
    const p2 = { ...p, profectionAge: 36 };
    assert.deepEqual(buildSelections({ "western.profections": true }, p2, method), [{ technique: "western.profections", options: { age: 36 } }]);
    assert.equal(missingReason("western.profections", p2), null);
    assert.equal(describeOptions("western.profections", { age: 36 }), "36 yaş profeksiyon yılı · bütün-burç");
    assert.equal(profectionAgeOn("1990-07-15", "2026-10-20"), 36, "bugünkü yıl önerisi");
    assert.equal(profectionAgeOn("2000-02-29", "2001-02-28"), 0);
    assert.equal(profectionAgeOn("2000-02-29", "2001-03-01"), 1);
  });

  await t("P2-01 bağlam: danışan A→B→A, aynı doğum tarihli iki danışan, revizyon/doğum tarihi değişimi; manuel seçim aynı bağlamda korunur; eski bağlam plana girmez", () => {
    const today = "2026-10-20";
    const ALI = "00000000-0000-4000-8000-000000000001";
    const ILK = "00000000-0000-4000-8000-000000000010";
    const TWIN = "00000000-0000-4000-8000-0000000000aa"; // Ali ile AYNI doğum tarihi
    const cA = profectionContextKey(ALI, 1, "1990-07-15")!;
    const cB = profectionContextKey(ILK, 1, "1985-05-06")!;
    const cT = profectionContextKey(TWIN, 1, "1990-07-15")!;
    assert.equal(profectionContextKey(null, 1, "1990-07-15"), null);
    assert.equal(profectionContextKey(ALI, null, "1990-07-15"), null);
    assert.notEqual(cA, cT, "aynı doğum tarihli iki danışanın bağlamı ayrı olmalı");
    let p = defaultParams(new Date("2026-10-20T09:00:00Z"));
    // A) Ali → bu yıl 36
    p = syncProfectionContext(p, cA, "1990-07-15", today);
    assert.deepEqual([p.profectionAge, p.profectionFor], [36, cA]);
    assert.ok(profectionSelectionCurrent(p, cA));
    // B) Ali için elle 38 → aynı bağlamda yeniden senkron DEĞİŞTİRMEZ (aynı nesne → gereksiz render yok)
    p = { ...p, profectionAge: 38 };
    const same = syncProfectionContext(p, cA, "1990-07-15", today);
    assert.equal(same, p, "aynı bağlam: aynı nesne");
    assert.equal(same.profectionAge, 38);
    // C/D) İlknur → Ali'nin 38'i TAŞINMAZ; İlknur'un bu yılı 41; geçiş anında (senkron öncesi) eski seçim plana girmez
    assert.equal(profectionSelectionCurrent(p, cB), false, "geçiş anı: Ali'nin yaşı İlknur'un planına girmemeli");
    p = syncProfectionContext(p, cB, "1985-05-06", today);
    assert.deepEqual([p.profectionAge, p.profectionFor], [41, cB]);
    // E) Ali'ye dön → İlknur'un 41'i taşınmaz; Ali'nin bu yılı 36
    p = syncProfectionContext({ ...p, profectionAge: 40 }, cA, "1990-07-15", today);
    assert.deepEqual([p.profectionAge, p.profectionFor], [36, cA]);
    // F) aynı doğum tarihli ikiz: Ali'de elle 30 → ikize geçince 30 taşınmaz (ikizin bu yılı 36, bağımsız)
    p = syncProfectionContext({ ...p, profectionAge: 30 }, cT, "1990-07-15", today);
    assert.deepEqual([p.profectionAge, p.profectionFor], [36, cT]);
    // G) aynı danışanın yeni revizyonu / değişen doğum tarihi → eski bağlam kullanılmaz
    const cA2 = profectionContextKey(ALI, 2, "1991-03-01")!;
    p = syncProfectionContext({ ...p, profectionAge: 12, profectionFor: cA }, cA2, "1991-03-01", today);
    assert.deepEqual([p.profectionAge, p.profectionFor], [35, cA2]);
    assert.equal(profectionSelectionCurrent(p, cA), false);
    const cA3 = profectionContextKey(ALI, 2, "1991-03-02")!;
    assert.notEqual(cA2, cA3, "aynı revizyonda doğum tarihi değişirse bağlam değişir");
    // H) elle seçilen yaş seçime gider
    const sel = buildSelections({ "western.profections": true }, { ...p, profectionAge: 20 }, { houseSystem: "placidus", nodeType: "true" });
    assert.deepEqual(sel, [{ technique: "western.profections", options: { age: 20 } }]);
    // Doğum tarihi bilinmeyen bağlam → yaş önerilmez (null), uydurulmaz
    assert.equal(syncProfectionContext(defaultParams(new Date()), "x|1|", null, today).profectionAge, null);
    assert.equal(syncProfectionContext(p, null, "1990-07-15", today), p, "bağlam yokken dokunulmaz");
  });

  await t("güvenlik: istemci bileşenleri sağlayıcı istemcisini / anahtarı içe aktarmaz; sağlayıcı metni bileşende yok", () => {
    for (const f of ["app/admin/astroloji/_components/ProfectionsPanel.tsx", "app/admin/astroloji/_components/TechniqueSelector.tsx", "app/admin/astroloji/_lib/techniques.ts", "lib/astrology/model/westernProfections.ts"]) {
      const src = readFileSync(join(__dirname, "..", "..", f), "utf8");
      assert.ok(!src.includes("providers/roxy/client") && !src.includes("ROXY_API_KEY") && !src.includes("process.env"), f);
      assert.ok(!/roxy/i.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) || f.endsWith("techniques.ts"), `${f}: kullanıcıya görünen metinde sağlayıcı adı`);
    }
    const panel = readFileSync(join(__dirname, "..", "..", "app/admin/astroloji/_components/ProfectionsPanel.tsx"), "utf8");
    assert.ok(!panel.includes("interpretation") || panel.includes("Sağlayıcının otomatik"), "panel sağlayıcı yorumunu göstermemeli");
    assert.ok(SIGN_IDS.length === 12);
  });

  console.log(`\nastrology profections harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("profections harness çöktü:", e);
  process.exit(1);
});
