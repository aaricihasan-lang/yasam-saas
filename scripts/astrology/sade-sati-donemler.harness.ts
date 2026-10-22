/**
 * ATLAS — SADE SATI DÖNEM TARİHLERİ (Draft, bayrak ASTROLOGY_SADE_SATI_PERIODS) harness'i. Gerçek sağlayıcı / DB YOK.
 *   A katalog bütünlüğü (sıra, burç sürekliliği, sabit olay özeti) · B bağımsız JPL Horizons noktaları
 *   C kişi A dönemleri (K1 / K2a / K2b; önceki bağımsız araştırma değerleri) · D 12 Janma Rashi tutarlılığı (aylık örnekleme)
 *   E sınır durumları (Ay sınırı, 2041 duraklama, kapsam dışı, saat dilimi) · F sağlayıcı uyumu (fail-closed)
 *   G bayrak KAPALI → teknik veri / anahtar birebir · H bayrak AÇIK → çalıştır → kaydet → aç (0 istek) → Word/PDF metni
 *   I deterministik + süre
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/sade-sati-donemler.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { SATURN_CATALOG_META, SATURN_INGRESSES, SATURN_SIGN_BEFORE_FIRST } from "@/lib/astrology/sadeSati/saturnCatalog";
import { SADE_SATI_PERIODS_METHOD, SADE_SATI_SIGNS, providerAgrees, sadeSatiPeriods, sadeSatiStatusAt } from "@/lib/astrology/sadeSati/periods";
import { attachSadeSatiPeriods, isSadeSatiPeriodsEnabled } from "@/lib/astrology/sadeSati/attach";
import { ssIstanbul } from "@/lib/astrology/sadeSati/labels";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const GDIR = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) as { endpoint: string; body: Record<string, unknown>; response: J };
const SS = G("vedic-sadhesati");
const D1 = G("vedic-d1");
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
const ms = (s: string) => Date.parse(s);
const minDiff = (a: string, b: string) => Math.abs(ms(a) - ms(b)) / 60_000;

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL });
function roxy(mutate?: (endpoint: string, r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-ss", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const hit = [SS, D1].find((f) => f.endpoint === endpoint && canon(f.body) === canon(body));
      if (!hit) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(hit.response);
      mutate?.(endpoint, r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profileA(ctx: EngineCtx): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const SADE = { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } };
const D1SEL = { technique: "vedic.d1", options: { ayanamsa: "lahiri" } };
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: false });
function withFlag<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ASTROLOGY_SADE_SATI_PERIODS;
  if (on) process.env.ASTROLOGY_SADE_SATI_PERIODS = "true";
  else delete process.env.ASTROLOGY_SADE_SATI_PERIODS;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.ASTROLOGY_SADE_SATI_PERIODS;
    else process.env.ASTROLOGY_SADE_SATI_PERIODS = prev;
  });
}
/** Golden günü sağlayıcı "doruk" der; testler bugünün tarihiyle (asOf) çalışır → bugün de doruk olmalı (2025-03-29 → 2027-06-02). */
const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  delete process.env.ASTROLOGY_SADE_SATI_PERIODS;

  await t("A: katalog — sıralı, burç sürekliliği (from = önceki to, komşu burç), yön, kapsam, sabit olay özeti (SHA-256)", () => {
    assert.equal(SATURN_INGRESSES.length, 176);
    assert.equal(SATURN_INGRESSES[0].from, SATURN_SIGN_BEFORE_FIRST);
    for (let i = 0; i < SATURN_INGRESSES.length; i++) {
      const e = SATURN_INGRESSES[i];
      if (i > 0) {
        assert.ok(ms(e.utc) > ms(SATURN_INGRESSES[i - 1].utc), `sıra ${e.utc}`);
        assert.equal(e.from, SATURN_INGRESSES[i - 1].to, `süreklilik ${e.utc}`);
      }
      const d = (SADE_SATI_SIGNS.indexOf(e.to) - SADE_SATI_SIGNS.indexOf(e.from) + 12) % 12;
      assert.equal(d, e.motion === "direct" ? 1 : 11, `komşu burç + yön ${e.utc}`);
    }
    assert.ok(ms(SATURN_INGRESSES[0].utc) < ms(SATURN_CATALOG_META.coverageFromUtc) && ms(SATURN_INGRESSES.at(-1)!.utc) > ms(SATURN_CATALOG_META.coverageToUtc), "tarama kapsamı aşıyor");
    const c = SATURN_INGRESSES.map((e) => `${e.utc}|${e.from}|${e.to}|${e.motion}`).join("\n");
    assert.equal(createHash("sha256").update(c).digest("hex"), "56502676287a2c06e0a1e4932635e0003a58806ad6d81a883796124a9d2ce587", "olay listesi değişmiş (yeni katalog = yeni sürüm + yeni damga)");
    assert.equal(SATURN_CATALOG_META.ayanamsa, "lahiri");
    assert.ok(SADE_SATI_PERIODS_METHOD.includes(`v${SATURN_CATALOG_META.version}`));
  });

  await t("B: bağımsız — NASA/JPL Horizons (DE441) ile bulunan 5 geçiş anı katalogla ±2 dk (ham/katalog/jpl_dogrulama.json; 176/176, medyan 0,33 dk)", () => {
    // Horizons anı = katalog anı + Horizons farkı (dk); doğrulama betiğinin çıktısından sabitlenmiş bağımsız referans.
    const REF: [string, number][] = [["1902-11-05T18:29:42Z", 1.48], ["1944-04-23T09:32:10Z", 0.39], ["1993-11-09T23:36:51Z", -0.16], ["2041-01-27T21:40:10Z", -0.59], ["2087-02-08T03:06:38Z", -0.53]];
    for (const [utc, d] of REF) {
      const e = SATURN_INGRESSES.find((x) => x.utc === utc);
      assert.ok(e, utc);
      assert.ok(Math.abs(d) <= 2, `${utc} Horizons farkı ${d} dk`);
    }
  });

  await t("C: kişi A (Janma Balık) — güncel dönem 2022-04-29 → 2030-04-17, iki kesinti; geçmiş 1993–2000; gelecek 2052–2059 (önceki bağımsız araştırma ±1 dk)", () => {
    const p = sadeSatiPeriods({ janmaRashi: "pisces", asOfUtc: "2026-10-22T12:00:00Z", birthUtc: "1990-07-15T11:30:00Z", moonDegreeInRashi: 29.236 });
    assert.deepEqual(p.statusAtAsOf, { state: "phase", phase: "peak" });
    assert.deepEqual(p.cycles.map((c) => c.relation), ["past", "active", "future", "future"]);
    const [past, act, fut] = p.cycles;
    const REF: [string | null, string][] = [
      [past.start, "1993-03-05T13:02:00Z"], [past.end, "2000-06-06T19:29:00Z"],
      [act.start, "2022-04-29T02:24:00Z"], [act.end, "2030-04-17T03:38:00Z"],
      [fut.start, "2052-02-24T22:33:00Z"], [fut.end, "2059-05-27T18:19:00Z"],
    ];
    for (const [a, b] of REF) assert.ok(a && minDiff(a, b) <= 1, `${a} ≠ ${b}`);
    assert.deepEqual(act.interruptions.map((x) => [x.start.slice(0, 10), x.end.slice(0, 10), x.sign]), [["2022-07-12", "2023-01-17", "capricorn"], ["2029-08-08", "2029-10-05", "taurus"]]);
    assert.deepEqual(act.segments.map((s) => s.phase), ["rising", "rising", "peak", "setting", "peak", "setting", "setting"]);
    assert.equal(act.segments[4].start!.motion, "retrograde", "2027-10-20 Balık'a geri dönüş ayrı satır");
    assert.ok(minDiff(act.k2a.peak.start!, "2025-03-29T16:15:00Z") <= 1 && minDiff(act.k2a.setting.start!, "2027-06-02T23:58:00Z") <= 1, "K2a ilk giriş");
    assert.ok(minDiff(act.k2b.rising.start!, "2023-01-17T12:34:00Z") <= 1 && minDiff(act.k2b.setting.start!, "2028-02-23T13:54:00Z") <= 1, "K2b kalıcı giriş");
    assert.equal(past.beginsBeforeBirth, false);
    assert.ok(!p.cycles.some((c) => c.end && ms(c.end) < ms("1990-07-15T11:30:00Z")), "doğumdan önce biten dönem listelenmez (1964–1971)");
    assert.equal(fut.interruptions.length, 0);
  });

  await t("D: 12 Janma Rashi — dönemler kronolojik, örtüşmez, zarf 6–9 yıl; aylık örnekleme 1900–2100 durumla ve doğrudan burç sınıflamasıyla tutarlı", () => {
    for (const janma of SADE_SATI_SIGNS) {
      const p = sadeSatiPeriods({ janmaRashi: janma, asOfUtc: "1900-01-02T00:00:00Z", birthUtc: null, moonDegreeInRashi: 15 });
      const all = p.cycles.filter((c) => c.start && c.end);
      for (let i = 0; i < all.length; i++) {
        const yrs = (ms(all[i].end!) - ms(all[i].start!)) / (365.25 * 86_400_000);
        assert.ok(yrs > 6 && yrs < 9, `${janma} zarf ${yrs.toFixed(2)} yıl`);
        if (i > 0) assert.ok(ms(all[i].start!) > ms(all[i - 1].end!), `${janma} örtüşme`);
        for (const s of all[i].segments) assert.ok([SADE_SATI_SIGNS[(SADE_SATI_SIGNS.indexOf(janma) + 11) % 12], janma, SADE_SATI_SIGNS[(SADE_SATI_SIGNS.indexOf(janma) + 1) % 12]].includes(s.sign));
      }
      const signAt = (tm: number) => {
        let sgn = SATURN_SIGN_BEFORE_FIRST;
        for (const e of SATURN_INGRESSES) if (ms(e.utc) <= tm) sgn = e.to;
        return sgn;
      };
      for (let tm = ms("1900-01-15T00:00:00Z"); tm < ms("2100-12-01T00:00:00Z"); tm += 30.4 * 86_400_000) {
        const st = sadeSatiStatusAt(janma, tm)!;
        const off = (SADE_SATI_SIGNS.indexOf(signAt(tm)) - SADE_SATI_SIGNS.indexOf(janma) + 12) % 12;
        const exp = off === 11 ? "rising" : off === 0 ? "peak" : off === 1 ? "setting" : null;
        assert.equal(st.state === "phase" ? st.phase : null, exp, `${janma} ${new Date(tm).toISOString()}`);
      }
    }
  });

  await t("E1: Ay burç sınırı — 29,236° (≈83 dk) ve 0,1° uyarı; 15° uyarı yok; 0,25° önerisi sabit kesinlik eşiği DEĞİL (dakikaya çevrilen bilgilendirme)", () => {
    const f = (deg: number) => sadeSatiPeriods({ janmaRashi: "pisces", asOfUtc: "2026-10-22T12:00:00Z", birthUtc: null, moonDegreeInRashi: deg }).moonBoundary!;
    assert.deepEqual([f(29.236).warn, f(29.236).approxMinutes], [true, 83]);
    assert.equal(f(0.1).warn, true);
    assert.equal(f(15).warn, false);
    assert.deepEqual([f(0).warn, f(0).degreesToBoundary], [true, 0], "tam 0° sınır");
    assert.equal(f(29.75).approxMinutes, 27, "0,25° ≈ 27 dk Ay hareketi");
    assert.equal(sadeSatiPeriods({ janmaRashi: "pisces", asOfUtc: "2026-10-22T12:00:00Z", birthUtc: null, moonDegreeInRashi: null }).moonBoundary, null);
  });

  await t("E2: 2041 — Satürn Terazi sınırında duraklarken 9,5 günlük giriş: iki ayrı satır, 'duraklamaya yakın' işaretli (Janma Akrep → Terazi 12.)", () => {
    const p = sadeSatiPeriods({ janmaRashi: "scorpio", asOfUtc: "2040-01-01T00:00:00Z", birthUtc: null, moonDegreeInRashi: 10 });
    const c = p.cycles.find((x) => x.start?.startsWith("2041"))!;
    assert.ok(c, "2041 dönemi");
    assert.equal(c.segments[0].start!.utc, "2041-01-27T21:40:10Z");
    assert.equal(c.segments[0].start!.nearStation, true);
    assert.equal(c.segments[0].end!.nearStation, true);
    assert.equal(c.interruptions[0].sign, "virgo");
    assert.ok(minDiff(c.interruptions[0].start, "2041-02-06T09:23:55Z") < 1);
  });

  await t("E3: kapsam — 1900 öncesi / 2100 sonrası durum null; sınırı aşan dönem 'kısmi' ve dış ucu null (tarih uydurulmaz)", () => {
    assert.equal(sadeSatiStatusAt("pisces", ms("1899-06-01T00:00:00Z")), null);
    assert.equal(sadeSatiStatusAt("pisces", ms("2101-06-01T00:00:00Z")), null);
    assert.equal(providerAgrees("pisces", "2101-03-01", { present: false, phase: null }), null);
    let partial = 0;
    for (const janma of SADE_SATI_SIGNS) {
      for (const asOf of ["1900-01-02T00:00:00Z", "2099-06-01T00:00:00Z"]) {
        for (const c of sadeSatiPeriods({ janmaRashi: janma, asOfUtc: asOf, birthUtc: null, moonDegreeInRashi: 15 }).cycles) {
          if (c.partial) {
            partial++;
            assert.ok(c.start === null || c.end === null);
            for (const s of c.segments) for (const e of [s.start, s.end]) if (e) assert.ok(ms(e.utc) >= ms(SATURN_CATALOG_META.coverageFromUtc) && ms(e.utc) <= ms(SATURN_CATALOG_META.coverageToUtc));
          }
        }
      }
    }
    assert.ok(partial >= 1, "en az bir sınır dönemi kısmi");
  });

  await t("E4: saat dilimi — Türkiye saati tarihsel kuralla (1993-11-09 23:36 UTC → 10.11.1993 GMT+2; 2022 → GMT+3); UTC esas", () => {
    const a = ssIstanbul("1993-11-09T23:36:51Z");
    assert.ok(a.includes("10.11.1993") && a.includes("01:36") && a.includes("GMT+2"), a);
    const b = ssIstanbul("2022-04-29T02:23:42Z");
    assert.ok(b.includes("29.04.2022") && b.includes("05:23") && b.includes("GMT+3"), b);
  });

  await t("F: sağlayıcı uyumu — golden günü 'doruk' = katalog; ters durum ve farklı evre REDDEDİLİR; geçiş gününde gün başı/sonu kabul", () => {
    assert.equal(providerAgrees("pisces", "2026-10-21", { present: true, phase: "peak" }), true);
    assert.equal(providerAgrees("pisces", "2026-10-21", { present: true, phase: "rising" }), false);
    assert.equal(providerAgrees("pisces", "2026-10-21", { present: false, phase: null }), false);
    assert.equal(providerAgrees("pisces", "2025-03-29", { present: true, phase: "rising" }), true, "geçiş günü (16:15 UTC) gün başı");
    assert.equal(providerAgrees("pisces", "2025-03-29", { present: true, phase: "peak" }), true, "geçiş günü gün sonu");
    assert.equal(providerAgrees("pisces", "2022-08-01", { present: false, phase: null }), true, "kesinti = etkin değil");
    const base = { present: true, phase: "rising" as const, asOf: "2026-10-21", frame: { ayanamsa: "lahiri" } };
    const r = attachSadeSatiPeriods(base, D1.response && { schema: "astro.vedic.d1.v1", frame: { ayanamsa: "lahiri" }, grahas: [{ id: "moon", rashi: "pisces", degreeInRashi: 29.2 }] }, null);
    assert.deepEqual(r.periodsStatus, { state: "blocked", reason: "PROVIDER_MISMATCH" });
    assert.equal(r.periods, undefined, "uyuşmazlıkta tarih yok");
    const noD1 = attachSadeSatiPeriods({ ...base, phase: "peak" }, null, null);
    assert.deepEqual(noD1.periodsStatus, { state: "unavailable", reason: "D1_REQUIRED" });
    const raman = attachSadeSatiPeriods({ ...base, phase: "peak", frame: { ayanamsa: "raman" } }, null, null);
    assert.deepEqual(raman.periodsStatus, { state: "unavailable", reason: "AYANAMSA_UNSUPPORTED" });
    const d1Raman = attachSadeSatiPeriods({ ...base, phase: "peak" }, { schema: "astro.vedic.d1.v1", frame: { ayanamsa: "raman" }, grahas: [{ id: "moon", rashi: "pisces", degreeInRashi: 29.2 }] }, null);
    assert.deepEqual(d1Raman.periodsStatus, { state: "unavailable", reason: "D1_REQUIRED" }, "D1 farklı ayanamsa → kullanılmaz");
  });

  await t("G: bayrak KAPALI (varsayılan) — Sade Sati teknik verisinde dönem alanı YOK; plan / istek gövdesi / anahtar bayrak açıkla aynı; rapor bölümü yok", async () => {
    assert.equal(isSadeSatiPeriodsEnabled({} as NodeJS.ProcessEnv), false);
    assert.equal(isSadeSatiPeriodsEnabled({ ASTROLOGY_SADE_SATI_PERIODS: "1" } as unknown as NodeJS.ProcessEnv), false, "yalnız tam 'true'");
    const off = await withFlag(false, async () => {
      const store = seed();
      const ctx = ctxOf(store);
      const pa = await profileA(ctx);
      const rx = roxy();
      await run(ctx, pa, [D1SEL], rx.deps);
      const plan = (await planAstrology(ctx, { profileId: pa, selections: [SADE] })).body as J;
      const r = (await run(ctx, pa, [SADE], rx.deps)).body as J;
      return { plan, tech: r.results[0].view.technical, calls: rx.calls };
    });
    const on = await withFlag(true, async () => {
      const store = seed();
      const ctx = ctxOf(store);
      const pa = await profileA(ctx);
      const rx = roxy();
      await run(ctx, pa, [D1SEL], rx.deps);
      const plan = (await planAstrology(ctx, { profileId: pa, selections: [SADE] })).body as J;
      const r = (await run(ctx, pa, [SADE], rx.deps)).body as J;
      return { plan, tech: r.results[0].view.technical, calls: rx.calls };
    });
    assert.equal("periods" in off.tech || "periodsStatus" in off.tech, false, "bayrak kapalı → alan yok");
    assert.equal(canon(off.calls), canon(on.calls), "istek gövdeleri aynı (yeni ücretli istek yok)");
    assert.equal(canon(off.plan.plan.units.map((u: J) => u.inputHash)), canon(on.plan.plan.units.map((u: J) => u.inputHash)), "önbellek anahtarı aynı");
    const { periods: _p, periodsStatus: _s, ...rest } = on.tech;
    assert.equal(canon(rest), canon(off.tech), "bayrak açıkken yalnız iki alan eklenir");
    const rep = reportTexts(buildAstroReport({ id: "x", title: "x", technique: "vedic.sade_sati", analysisAt: "2026-10-22T00:00:00Z", technical: off.tech, params: SADE.options })).join("\n");
    assert.ok(!rep.includes("Sade Sati dönem tarihleri"));
  });

  await t("H: bayrak AÇIK — çalıştır (D1 önbellekte) → dönemler + damga; kaydet → aç 0 istek; bayrak sonra kapatılsa da arşiv aynı; Word/PDF metni; sağlayıcı adı yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    const saved = await withFlag(true, async () => {
      await run(ctx, pa, [D1SEL], rx.deps);
      const r = (await run(ctx, pa, [SADE], rx.deps)).body as J;
      const tech = r.results[0].view.technical;
      assert.deepEqual(tech.periodsStatus, { state: "ok" }, JSON.stringify(tech.periodsStatus));
      assert.equal(tech.periods.method, SADE_SATI_PERIODS_METHOD);
      assert.equal(tech.periods.catalog.sha256, SATURN_CATALOG_META.sha256);
      assert.ok(tech.periods.cycles.some((c: J) => c.relation === "active" && c.start.startsWith("2022-04-29")), "etkin dönem");
      assert.equal(tech.periods.moonBoundary.warn, true, "kişi A Ay'ı Balık 29°14′ → uyarı");
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SADE, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, JSON.stringify(sv.body));
      return (sv.body as J).analysisId as string;
    });
    const before = rx.calls.length;
    const a = await withFlag(false, async () => ((await getAnalysis(ctx, saved, false)).body as J).analysis);
    assert.equal(rx.calls.length, before, "arşivden açma 0 istek");
    assert.equal(a.technical.periods.method, SADE_SATI_PERIODS_METHOD, "damga arşivde; bayrak kapalıyken de kayıt aynen");
    const s = reportTexts(buildAstroReport(a)).join("\n");
    for (const want of ["Sade Sati dönem tarihleri", "Etkin dönem: 29.04.2022", "Kesinti: Satürn Oğlak burcunda", "K2a (ilk giriş)", "K2b (kalıcı giriş)", "Janma Rashi uyarısı", "Metodoloji damgası: sade-sati-periods.k1.v1", "Türkiye saati"])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["Roxy", "roxy", "undefined", "NaN", "[object Object]"]) assert.ok(!s.includes(bad), `rapor: "${bad}"`);
  });

  await t("I: deterministik + süre — aynı girdi aynı JSON; 12 burç × 100 hesap < 2 sn (katalog okuma; efemeris yok)", () => {
    const a = canon(sadeSatiPeriods({ janmaRashi: "leo", asOfUtc: "2030-01-01T00:00:00Z", birthUtc: "1980-01-01T00:00:00Z", moonDegreeInRashi: 3 }));
    const b = canon(sadeSatiPeriods({ janmaRashi: "leo", asOfUtc: "2030-01-01T00:00:00Z", birthUtc: "1980-01-01T00:00:00Z", moonDegreeInRashi: 3 }));
    assert.equal(a, b);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) for (const j of SADE_SATI_SIGNS) sadeSatiPeriods({ janmaRashi: j, asOfUtc: `20${10 + (i % 80)}-06-01T00:00:00Z`, birthUtc: null, moonDegreeInRashi: 12 });
    const dt = performance.now() - t0;
    console.log(`     1200 hesap: ${dt.toFixed(0)} ms`);
    assert.ok(dt < 2000, `${dt} ms`);
  });

  console.log(`\nsade-sati-donemler harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
