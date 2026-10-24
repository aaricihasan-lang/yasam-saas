/**
 * ASTROLOJİ — ASTEROİT TARİH SINIRI harness'i (2026-10-24, owner kararı madde 3).
 *
 * Kanıt: gerçek sağlayıcı çağrıları (fixtures/asteroit-tarih-siniri/sinir-kayitlari.json; QA 43 + 52 defterleri + tur 1):
 * üst 2500-12-29T23:15Z KABUL (son doğrulanan) · 23:59Z ve sonrası HTTP 400; alt 1599-12-30T10:04:08Z KABUL (ilk doğrulanan) ·
 * 1575-06-15 ve 1550-01-01 (ürün profil tabanı) HTTP 400. Bu harness sağlayıcıya ÇAĞRI YAPMAZ (sahte sağlayıcı istekleri kaydeder).
 *
 *   A) sınır kayıtları ↔ ön engel kararı (OK → istenir, 400 → istenmez; zaman aşımı kanıt sayılmaz)
 *   B) yalnız asteroit bölümü atlanır: lot + Lilith birimleri ve gövdeleri birebir aynı
 *   C) saat dilimi / UTC dönüşümü / saat bilinmiyor / LMT / yarım saat ofseti / gün dönümü
 *   D) motor: plan (yeni istek sayısı, skippedSections gerekçesi), yalnız asteroit → NO_UNIT, çalıştırmada asteroit isteği YOK,
 *      kutup ev sistemi ön engeliyle birlikte
 *   E) kullanıcıya bilgi: plan önizlemesi (Teknik ekle penceresi), ekran paneli ve Word/PDF notu; marka adı yok
 *   F) tamamen engelli seçimde gerekçe gösterimi: her gerekçe bir kez + bölüm adları; kısmi/başka engelde metin aynen
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/asteroit-tarih-siniri.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, type UnitContext } from "@/lib/astrology/engine/techniques";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import { asteroidsBody, extraSectionBody, ROXY_EXTRA_POINTS } from "@/lib/astrology/providers/roxy/extraPoints";
import { ASTEROID_DATE_SKIP_REASON, ASTEROID_FIRST_VERIFIED_UTC_MS, ASTEROID_LAST_VERIFIED_UTC_MS, ASTEROID_MISSING_NOTE, asteroidBodyOutOfRange, bodyInstantUtcMs } from "@/lib/astrology/model/asteroidDateLimit";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExtraPointsPanel } from "@/app/admin/astroloji/_components/ExtraPointsPanels";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { randomUUID } from "node:crypto";
import { compactBlocked, groupSkipped } from "@/app/admin/astroloji/_components/atlas/skippedSections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

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

const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "asteroit-tarih-siniri", "sinir-kayitlari.json"), "utf8")) as {
  kayitlar: { kaynak: string; date: string; time: string; timezone: number; latitude: number; longitude: number; sonuc: "OK" | "400" | "timeout" }[];
};
const AST_EP = ROXY_EXTRA_POINTS.asteroids.endpoint;
const def = getTechnique("western.extra_points")!;
const opt3 = def.parseOptions({ sections: ["asteroids", "lots", "lilith"], houseSystem: "placidus" }, new Date())!;
const ctxOf = (date: string, time: string | null, tz = "Europe/Istanbul", lat = 41.0082, lon = 28.9784): UnitContext => {
  const r = resolveAstroBirthTime(date, time ?? "12:00", tz);
  if (r.kind !== "ok") throw new Error(`saat çözülemedi ${date} ${time} ${tz}`);
  return { birth: { birthDate: date, birthTime: time ? `${time}:00` : null, utcOffsetSeconds: r.offsetSeconds, latitude: lat, longitude: lon }, birthUtc: r.utcIso, partner: null };
};
const units = (ctx: UnitContext, opt: Record<string, unknown> = opt3) => def.units(ctx, opt);
const hasAst = (ctx: UnitContext, opt: Record<string, unknown> = opt3) => units(ctx, opt).some((u) => u.endpoint === AST_EP);
const nonAst = (ctx: UnitContext) => units(ctx).filter((u) => u.endpoint !== AST_EP).map((u) => ({ endpoint: u.endpoint, body: u.body, part: u.part }));

// Motor düzeyi yardımcılar (extra-points.harness ile aynı desen; sahte sağlayıcı sonuç UYDURMAZ → 400)
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const TROMSO: ResolvedLocation = { id: "no-tromso", label: "Tromsø, Norveç", timezone: "Europe/Oslo", latitude: 69.6492, longitude: 18.9553 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : id === TROMSO.id ? TROMSO : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const engCtx = (store: FakeStore): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL });
async function profile(ctx: EngineCtx, over: Record<string, unknown>): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik Z", clientId: CLIENT_X, birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
function roxy() {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-asteroit", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
const EP = (sections: string[], houseSystem = "placidus") => ({ technique: "western.extra_points", options: { sections, houseSystem } });

async function main() {
  // ═══ A) GERÇEK SINIR KAYITLARI ↔ ÖN ENGEL ═══════════════════════════════════════
  const evid = FIX.kayitlar.filter((k) => k.sonuc === "OK" || k.sonuc === "400");
  for (const k of evid) {
    await t(`A: ${k.kaynak} ${k.date} ${k.time} (ofset ${k.timezone}) sağlayıcı=${k.sonuc} → ön engel ${k.sonuc === "OK" ? "istemeli" : "engellemeli"}`, () => {
      const body = { date: k.date, time: k.time, timezone: k.timezone, latitude: k.latitude, longitude: k.longitude, nodeType: "true", houseSystem: "placidus" };
      assert.equal(asteroidBodyOutOfRange(body), k.sonuc === "400");
    });
  }
  await t("A: zaman aşımı kaydı (1) kanıt sayılmadı; ilk/son doğrulanan anlar kanıttaki en erken/en geç KABUL ile birebir", () => {
    assert.equal(FIX.kayitlar.filter((k) => k.sonuc === "timeout").length, 1);
    const okT = evid.filter((k) => k.sonuc === "OK").map((k) => bodyInstantUtcMs(k as J)!);
    const badT = evid.filter((k) => k.sonuc === "400").map((k) => bodyInstantUtcMs(k as J)!);
    assert.equal(Math.max(...okT), ASTEROID_LAST_VERIFIED_UTC_MS);
    assert.equal(Math.min(...okT), ASTEROID_FIRST_VERIFIED_UTC_MS);
    const badHigh = badT.filter((x) => x > ASTEROID_LAST_VERIFIED_UTC_MS), badLow = badT.filter((x) => x < ASTEROID_FIRST_VERIFIED_UTC_MS);
    assert.equal(badHigh.length + badLow.length, badT.length, "kapsam içinde 400 yok");
    assert.ok(Math.min(...badHigh) - ASTEROID_LAST_VERIFIED_UTC_MS <= 45 * 60e3, "üst sınır 45 dk içinde ölçüldü");
    assert.ok(badLow.some((x) => x < Date.parse("1550-01-01T12:00:00Z")), "ürün profil tabanı (1550) 400 kanıtlı");
  });

  // ═══ B) YALNIZ ASTEROİT ATLANIR ══════════════════════════════════════════════════
  const cases: [string, string, boolean][] = [
    ["2501-06-15", "12:00", false], ["2600-01-01", "08:00", false], ["2500-12-30", "12:00", false], ["2500-12-27", "12:00", true], ["2500-12-30", "02:15", true], ["2500-12-30", "03:00", false],
    ["2400-01-01", "12:00", true], ["1600-01-01", "00:30", true], ["1990-07-15", "14:30", true], ["2100-12-31", "23:59", true],
    ["1550-01-01", "12:00", false], ["1575-06-15", "12:00", false], ["1599-12-30", "12:00", true], ["1599-12-30", "11:00", false], ["1599-06-15", "12:00", false],
  ];
  for (const [d, tm, inRange] of cases) {
    await t(`B: ${d} ${tm} İstanbul → asteroit ${inRange ? "istenir" : "İSTENMEZ"}`, () => assert.equal(hasAst(ctxOf(d, tm)), inRange));
    await t(`B: ${d} ${tm} → lot + Lilith birimleri ve gövdeleri birebir (asteroit kararından bağımsız)`, () => {
      const c = ctxOf(d, tm);
      const want = (["lots", "lilith"] as const).map((s) => ({ endpoint: ROXY_EXTRA_POINTS[s].endpoint, body: extraSectionBody(s, c.birth, "placidus"), part: ["asteroids", "lots", "lilith"].indexOf(s) }));
      assert.deepEqual(nonAst(c), want);
    });
  }
  await t("B: sınır içinde asteroit gövdesi değişmedi (ürün gövdesiyle birebir)", () => {
    const c = ctxOf("1990-07-15", "14:30");
    assert.deepEqual(units(c).find((u) => u.endpoint === AST_EP)!.body, asteroidsBody(c.birth, "placidus"));
  });
  await t("B: planInfo.skippedSections yalnız asteroit (gerekçe metniyle); sınır içinde boş", () => {
    const out = def.planInfo!(ctxOf("2501-06-15", "12:00"), opt3) as J;
    assert.deepEqual(out.skippedSections.map((x: J) => x.section), ["asteroids"]);
    assert.equal(out.skippedSections[0].reason, ASTEROID_DATE_SKIP_REASON);
    assert.equal(def.planInfo!(ctxOf("1990-07-15", "14:30"), opt3), null);
  });
  await t("B: yalnız asteroit seçiliyse birim yok ve noUnitsReason açık gerekçe", () => {
    const o = def.parseOptions({ sections: ["asteroids"], houseSystem: "placidus" }, new Date())!;
    const c = ctxOf("2501-06-15", "12:00");
    assert.equal(def.units(c, o).length, 0);
    assert.equal(def.noUnitsReason!(c, o), ASTEROID_DATE_SKIP_REASON);
  });

  // ═══ C) SAAT DİLİMİ / UTC / SAAT BİLİNMİYOR ═════════════════════════════════════
  await t("C: saat bilinmiyor 2500-12-30 (gövde yerel 12:00 → 09:00Z) → istenmez", () => assert.equal(hasAst(ctxOf("2500-12-30", null)), false));
  await t("C: saat bilinmiyor 2500-12-29 (09:00Z) → istenir", () => assert.equal(hasAst(ctxOf("2500-12-29", null)), true));
  await t("C: saat bilinmiyor → gövde saati 12:00:00 (karar gövde anından)", () => assert.equal(units(ctxOf("2500-12-29", null)).find((u) => u.endpoint === AST_EP)!.body.time, "12:00:00"));
  await t("C: New York 2500-12-29 20:00 (30 Aralık 01:00Z) → istenmez", () => assert.equal(hasAst(ctxOf("2500-12-29", "20:00", "America/New_York", 40.7128, -74.006)), false));
  await t("C: Tokyo 2500-12-30 08:00 (29 Aralık 23:00Z) → istenir", () => assert.equal(hasAst(ctxOf("2500-12-30", "08:00", "Asia/Tokyo", 35.68, 139.69)), true));
  await t("C: Tokyo 2500-12-30 09:00 (30 Aralık 00:00Z) → istenmez", () => assert.equal(hasAst(ctxOf("2500-12-30", "09:00", "Asia/Tokyo", 35.68, 139.69)), false));
  await t("C: Delhi (+5:30) 2500-12-30 04:44 (29 Aralık 23:14Z) → istenir; 04:46 → istenmez", () => {
    assert.equal(hasAst(ctxOf("2500-12-30", "04:44", "Asia/Kolkata", 28.6139, 77.209)), true);
    assert.equal(hasAst(ctxOf("2500-12-30", "04:46", "Asia/Kolkata", 28.6139, 77.209)), false);
  });
  await t("C: Kiritimati (+14) 2500-12-30 13:15 (29 Aralık 23:15Z) → istenir (sınır anı dahil)", () => assert.equal(hasAst(ctxOf("2500-12-30", "13:15", "Pacific/Kiritimati", 1.87, -157.4)), true));
  await t("C: Honolulu (−10) 2500-12-29 13:16 (23:16Z) → istenmez", () => assert.equal(hasAst(ctxOf("2500-12-29", "13:16", "Pacific/Honolulu", 21.3, -157.86)), false));
  await t("C: LMT (1600 İstanbul, ofset +1:56:56 dakikaya yuvarlanır) → gövde anıyla karar; istenir", () => {
    const c = ctxOf("1600-01-01", "00:30");
    const b = asteroidsBody(c.birth, "placidus");
    assert.notEqual(c.birth.utcOffsetSeconds % 60, 0, "LMT ofseti saniyeli olmalı");
    assert.equal(asteroidBodyOutOfRange(b), false);
    assert.equal(hasAst(c), true);
  });
  await t("C: gövde anı = yerel − ofset (gün dönümü: 2500-12-30 00:30 İstanbul = 29 Aralık 21:30Z)", () => {
    assert.equal(bodyInstantUtcMs({ date: "2500-12-30", time: "00:30:00", timezone: 3 }), Date.parse("2500-12-29T21:30:00Z"));
    assert.equal(hasAst(ctxOf("2500-12-30", "00:30")), true);
  });
  await t("C: çözülemeyen gövde → fail-closed (istenmez)", () => {
    assert.equal(asteroidBodyOutOfRange({ date: "2500-12-29", time: "12:00:00" }), true);
    assert.equal(asteroidBodyOutOfRange({ date: "x", time: "12:00:00", timezone: 3 }), true);
  });

  // ═══ D) MOTOR: PLAN + ÇALIŞTIRMA ═════════════════════════════════════════════════
  // Ürün profil aralığı 1550–2100 (profileInput): kapsam dışı yalnız 1550-01-01 … 1599-12-30 ürün akışında erişilebilir.
  await t("D: ürün profil aralığı 1550–2100 — 2501 profili oluşturulamaz (üst ön engel savunma katmanıdır)", async () => {
    const ctx = engCtx(seed());
    const r = await createAstroProfile(ctx, { label: "Z", clientId: CLIENT_X, birthDate: "2501-06-15", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
    assert.equal(r.status, 422);
  });
  await t("D: 1560 profili — plan 3 bölümde 2 yeni istek (lot + Lilith), skippedSections = asteroit + gerekçe", async () => {
    const ctx = engCtx(seed());
    const pid = await profile(ctx, { birthDate: "1560-06-15" });
    const p = (await planAstrology(ctx, { profileId: pid, selections: [EP(["asteroids", "lots", "lilith"])] })).body as J;
    assert.equal(p.plan.newRequestCount, 2, JSON.stringify(p.plan).slice(0, 400));
    assert.ok(p.plan.units.every((u: J) => u.endpoint !== AST_EP));
    assert.equal(p.plan.selections[0].info.skippedSections[0].section, "asteroids");
    assert.equal(p.plan.selections[0].info.skippedSections[0].reason, ASTEROID_DATE_SKIP_REASON);
  });
  await t("D: 1550-01-01 profili — yalnız asteroit → NO_UNIT, gerekçe; 0 istek", async () => {
    const ctx = engCtx(seed());
    const pid = await profile(ctx, { birthDate: "1550-01-01" });
    const p = (await planAstrology(ctx, { profileId: pid, selections: [EP(["asteroids"])] })).body as J;
    assert.equal(p.plan.newRequestCount, 0);
    assert.equal(p.plan.selections[0].blocked.code, "NO_UNIT");
    assert.ok(p.plan.selections[0].blocked.error.includes("30 Aralık 1599"), JSON.stringify(p.plan.selections[0].blocked));
  });
  await t("D: 1560 profili — çalıştırmada asteroit ucuna İSTEK GİTMEZ (lot/Lilith istenir)", async () => {
    const ctx = engCtx(seed());
    const pid = await profile(ctx, { birthDate: "1560-06-15" });
    const rx = roxy();
    await runAstrology(ctx, { profileId: pid, selections: [EP(["asteroids", "lots", "lilith"])] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.ok(rx.calls.every((c) => c.endpoint !== AST_EP), JSON.stringify(rx.calls.map((c) => c.endpoint)));
    assert.deepEqual(rx.calls.map((c) => c.endpoint).sort(), [ROXY_EXTRA_POINTS.lots.endpoint, ROXY_EXTRA_POINTS.lilith.endpoint].sort());
  });
  await t("D: 1560 profili — kaydet + arşivden aç (0 istek) + Word/PDF modeli: asteroit yok notu, lot + Lilith tam; eksik parça sayılmaz", async () => {
    const store = seed();
    const ctx = engCtx(store);
    const pid = await profile(ctx, { birthDate: "1560-06-15" });
    // Test yapısı: gerçek golden yanıtının YAPISI, yankı alanları istenen gövdeye çekilir (yalnız akış/kayıt sınanır; konumlar golden'ındır).
    const GD = join(__dirname, "fixtures", "golden");
    const G = Object.fromEntries(["extra-lots", "extra-lilith"].map((n) => [n, JSON.parse(readFileSync(join(GD, `${n}.json`), "utf8"))]));
    const calls: string[] = [];
    const deps: EngineDeps = {
      config: { apiKey: "k-test-asteroit", baseUrl: "https://roxy-fake.local/api/v2" },
      callProvider: async (_c, endpoint, body) => {
        calls.push(endpoint);
        const g = Object.values(G).find((x: J) => x.endpoint === endpoint) as J;
        if (!g) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        const r = structuredClone(g.response);
        r.birthDetails = { ...r.birthDetails, date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
        return { ok: true, raw: r, attempts: 1 };
      },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      log: () => undefined,
    };
    const sel = EP(["asteroids", "lots", "lilith"]);
    const run = (await runAstrology(ctx, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run.results?.[0]?.ok, true, JSON.stringify(run).slice(0, 400));
    const v = run.results[0].view;
    assert.equal(v.technical.asteroids, null);
    assert.ok(v.technical.lots && v.technical.lilith, "lot + Lilith tam");
    assert.equal(v.missingParts, 0, "planlı atlama eksik parça sayılmaz");
    assert.ok(!calls.includes(AST_EP));
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 300));
    const n = calls.length;
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(calls.length, n, "arşivden açma sağlayıcı çağırdı");
    assert.equal(a.technical.asteroids, null);
    const txt = reportTexts(buildAstroReport(a)).join("\n");
    assert.ok(txt.includes(ASTEROID_MISSING_NOTE) && txt.includes("Hermetik lotlar") && !/roxy/i.test(txt));
  });
  await t("D: 1990 ve 2100 profilleri — üç bölüm de istenir (kapsam içi davranış değişmedi)", async () => {
    const ctx = engCtx(seed());
    for (const d of ["1990-07-15", "2100-06-15"]) {
    const pid = await profile(ctx, { birthDate: d });
    const p = (await planAstrology(ctx, { profileId: pid, selections: [EP(["asteroids", "lots", "lilith"])] })).body as J;
    assert.equal(p.plan.newRequestCount, 3);
    assert.equal(p.plan.selections[0].info, null);
    }
  });
  await t("D: Tromsø 1560 + Placidus → kutup ön engeli öncelikli (NO_UNIT, ev sistemi önerisi); Equal → yalnız Lilith", async () => {
    const ctx = engCtx(seed());
    const pid = await profile(ctx, { birthDate: "1560-06-15", locationId: TROMSO.id });
    const p = (await planAstrology(ctx, { profileId: pid, selections: [EP(["asteroids", "lots", "lilith"])] })).body as J;
    assert.equal(p.plan.newRequestCount, 0);
    assert.ok(JSON.stringify(p.plan.selections[0].blocked).includes("Whole Sign veya Equal"));
    const e = (await planAstrology(ctx, { profileId: pid, selections: [EP(["asteroids", "lots", "lilith"], "equal")] })).body as J;
    assert.equal(e.plan.newRequestCount, 1);
    assert.deepEqual(e.plan.selections[0].info.skippedSections.map((x: J) => x.section).sort(), ["asteroids", "lots"]);
  });

  // ═══ E) KULLANICIYA BİLGİ ═══════════════════════════════════════════════════════
  const root = join(__dirname, "..", "..");
  await t("E: hazırlık ekranı (teknik ayrıntısı) ve Teknik ekle penceresi plan önizlemesindeki atlanan bölümleri gerekçesiyle gösterir", () => {
    const add = readFileSync(join(root, "app/admin/astroloji/_components/atlas/AddTechniqueDialog.tsx"), "utf8");
    const prep = readFileSync(join(root, "app/admin/astroloji/_components/atlas/PrepCenter.tsx"), "utf8");
    assert.ok(add.includes('data-testid="atlas-add-skipped"') && add.includes("skippedSections"));
    assert.ok(prep.includes('data-testid="atlas-focus-skipped"') && prep.includes("skippedSections"));
  });
  await t("E: ekran paneli asteroit bölümü yoksa açıklama notunu gösterir", () => {
    const src = readFileSync(join(root, "app/admin/astroloji/_components/ExtraPointsPanels.tsx"), "utf8");
    assert.ok(src.includes("ASTEROID_MISSING_NOTE") && src.includes('data-testid="astro-extra-asteroid-missing"'));
  });
  await t("E: ekran paneli (SSR) — asteroit yoksa not görünür, varken görünmez; lot/Lilith bölümleri etkilenmez", () => {
    const base = { schema: "astro.western.extra_points.v1", zodiac: "tropical", houseSystem: "placidus", sections: ["asteroids", "lilith"], lots: null, natalFrame: null, natalCheck: null };
    const lil = { houseSystem: "placidus", mean: { variant: "mean", longitude: 10, sign: "aries", degreeInSign: 10, latitude: 0, house: 1, speed: 0.1, retrograde: false }, true: { variant: "true", longitude: 12, sign: "aries", degreeInSign: 12, latitude: 0, house: 1, speed: 0.1, retrograde: false } };
    const html = renderToStaticMarkup(createElement(ExtraPointsPanel, { t: { ...base, asteroids: null, lilith: lil } as J, timeUnknownMasked: false }));
    assert.ok(html.includes('data-testid="astro-extra-asteroid-missing"') && html.includes("29 Aralık 2500"), html.slice(0, 300));
    assert.ok(html.includes("data-lilith"), "Lilith tablosu görünmeli");
    const html2 = renderToStaticMarkup(createElement(ExtraPointsPanel, { t: { ...base, sections: ["lilith"], asteroids: null, lilith: lil } as J, timeUnknownMasked: false }));
    assert.ok(!html2.includes("astro-extra-asteroid-missing"), "asteroit seçilmemişse not çıkmamalı");
    assert.ok(!/roxy/i.test(html));
  });
  await t("E: Word/PDF modeli asteroit bölümü yoksa aynı notu yazar; bölüm varken yazmaz", () => {
    const mk = (asteroids: unknown) =>
      reportTexts(
        buildAstroReport({
          id: "a1",
          title: "Ek noktalar",
          technique: "western.extra_points",
          params: { sections: ["asteroids", "lilith"], houseSystem: "placidus" },
          analysisAt: "2026-10-24T10:00:00Z",
          method: { houseSystem: "placidus", nodeType: null, timeUnknownMasked: false, warnings: [] },
          technical: { schema: "astro.western.extra_points.v1", zodiac: "tropical", houseSystem: "placidus", sections: ["asteroids", "lilith"], asteroids, lots: null, lilith: null, natalFrame: null, natalCheck: null },
          interpretation: null,
          notes: [],
        }),
      ).join("\n");
    assert.ok(mk(null).includes(ASTEROID_MISSING_NOTE), "not yok");
    assert.ok(!mk({ houseSystem: "placidus", bodies: [] }).includes(ASTEROID_MISSING_NOTE));
  });
  await t("E: gerekçe ve not metinlerinde marka/uç adı yok; lot ve Lilith'in etkilenmediği yazılı", () => {
    for (const s of [ASTEROID_DATE_SKIP_REASON, ASTEROID_MISSING_NOTE]) assert.ok(!/roxy|\/astrology\//i.test(s), s);
    assert.ok(ASTEROID_DATE_SKIP_REASON.includes("Lot ve Lilith"));
  });

  await t("F: tamamen engelli seçim (kutup + Placidus) — engel metni her gerekçeyi bir kez ve bölüm adlarıyla yazar; hiçbiri kaybolmaz", () => {
    // Gerçek motor çıktısı: Tromsø 1990-05-10 12:00, üç bölüm, Placidus → NO_UNIT + üç atlanan bölüm.
    const ctx = ctxOf("1990-05-10", "12:00", "Europe/Oslo", 69.6492, 18.9553);
    assert.equal(units(ctx).length, 0, "kutup + Placidus birim üretmemeli");
    const info = def.planInfo!(ctx, opt3) as { skippedSections: { section: string; label: string; reason: string }[] };
    const blocked = { code: "NO_UNIT", error: `${def.label}: ${def.noUnitsReason!(ctx, opt3)}` };
    const c = compactBlocked(blocked, info.skippedSections)!;
    assert.equal(c.fullySkipped, true);
    for (const r of new Set(info.skippedSections.map((x) => x.reason))) assert.equal(c.text.split(r).length - 1, 1, `gerekçe tam bir kez: ${r}`);
    for (const x of info.skippedSections) assert.ok(c.text.includes(x.label), `bölüm adı: ${x.label}`);
    assert.ok(blocked.error.split(info.skippedSections[0].reason).length - 1 >= 2, "ham engel metni tekrar içeriyordu (önce durumu)");
    assert.equal(groupSkipped(info.skippedSections).length, new Set(info.skippedSections.map((x) => x.reason)).size);
  });
  await t("F: kısmi atlama, başka engel kodu veya eşleşmeyen metin → engel metni AYNEN (yeniden yazılmaz)", () => {
    const sk = [{ section: "asteroids", label: "Asteroitler", reason: ASTEROID_DATE_SKIP_REASON }];
    assert.equal(compactBlocked(null, sk), null);
    const tz = { code: "TZ_STALE", error: "Saat dilimi verisi güncel değil." };
    assert.deepEqual(compactBlocked(tz, sk), { text: tz.error, fullySkipped: false });
    const other = { code: "NO_UNIT", error: "Ek noktalar: hesap birimi oluşturulamadı." };
    assert.deepEqual(compactBlocked(other, sk), { text: other.error, fullySkipped: false });
    const only = { code: "NO_UNIT", error: `Ek noktalar: ${ASTEROID_DATE_SKIP_REASON}` };
    const c = compactBlocked(only, sk)!;
    assert.equal(c.fullySkipped, true);
    assert.ok(c.text.includes(ASTEROID_DATE_SKIP_REASON) && c.text.includes("Asteroitler"));
    assert.deepEqual(compactBlocked(only, []), { text: only.error, fullySkipped: false });
  });

  console.log(`\nastrology asteroit-tarih-siniri harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("asteroit-tarih-siniri harness çöktü:", e);
  process.exit(1);
});
