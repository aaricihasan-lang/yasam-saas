/**
 * TRANSİT-03 harness'i (2026-10-17) — KP Transit ZAMAN ARALIĞI (Sub-Lord / Rasi geçişleri, KP konum tablosu).
 *
 * ÖNEMLİ: Bu üç sağlayıcı ucu için GERÇEK golden yanıt henüz YOK (ücretli çağrı owner onayı bekliyor). Uçtan uca testler
 * SENTETİK yanıtla (scripts/astrology/syntheticKpTiming.ts — bağımsız astronomi + bağımsız KP tablosu; gerçek golden KP
 * konumlarına ≤0,01° sabitlenmiş) yapılır. Bu, sağlayıcının doğruluğunu DEĞİL, bizim boru hattımızı kanıtlar.
 *
 *   A) Seçenekler + maliyet: tek-an kipi BİREBİR eski (gövde = golden); aralık kanonik; sınırlar; birim (istek) sayısı.
 *   B) Adaptörler fail-closed: yankı, sayım, komşuluk, KP tablosu, zincir, pencere, sıra, satır sınırı, biçim.
 *   C) Sentetik üretici doğrulaması (golden KP konumları; geçiş anlarında KP no / burç değişimi).
 *   D) Uçtan uca: plan → çalıştır → birleşik teknik; kısmi hata AÇIKÇA listelenir; kaydet → yeniden aç 0 istek;
 *      Word + PDF tabloları; harita/"çizilemedi" yok; yorum yok notu.
 *   E) Boyut: 92 gün Ay Sub-Lord ≈ 830 satır; teknik katman < 1 MB; 2001 satır → reddedilir (kırpılmaz).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/transit03.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { kpNewcombApprox, siderealLon, syntheticPlanetsInterval, syntheticRasiChanges, syntheticSublordChanges } from "./syntheticKpTiming";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, KP_POSITIONS_INTERVALS as S_IV, KP_POSITIONS_MAX_DAYS as S_PMAX, KP_TIMING_MAX_DAYS as S_MAX } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { buildAstroReport } from "@/lib/astrology/report/model";
import { KP_TIMING_MAX_ROWS, projectRoxyKpPlanetsRange, projectRoxyKpRasiChanges, projectRoxyKpSublordChanges } from "@/lib/astrology/providers/roxy/kp";
import { kpTable } from "@/lib/astrology/verify/kpSub";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import type { KpTimingTechnical } from "@/lib/astrology/model/kp";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { KP_POSITIONS_INTERVALS as C_IV, KP_POSITIONS_MAX_DAYS as C_PMAX, KP_TIMING_MAX_DAYS as C_MAX, describeOptions, kpRangeRequestCount, kpRangeOptions, defaultParams } from "@/app/admin/astroloji/_lib/techniques";

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

const KPG = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "kp-planets-at.json"), "utf8"));
const TR = getTechnique("kp.transit")!;
const NOW = new Date("2026-10-07T09:41:00Z");
const BIRTH = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 } as never;
const UCTX = { birth: BIRTH, birthUtc: "1990-07-15T11:30:00Z", partner: null } as never;
const RANGE = { startDate: "2026-10-07", days: 3, planets: ["moon", "sun"], kinds: ["rasi", "sublord"] };
const base = { ayanamsa: "kp-newcomb", nodeType: "mean" };

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const ctxOf = (store: FakeStore): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL });

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
async function pdfInfo(buf: Uint8Array): Promise<{ text: string; pages: number }> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text: String(text).replace(/\s+/g, " "), pages: totalPages };
}

async function main() {
  // ═══ A) Seçenekler + maliyet ══════════════════════════════════════════════════
  await t("A1 tek-an kipi BİREBİR eski: seçenek nesnesi + istek gövdesi = golden kp-planets-at", () => {
    const o = TR.parseOptions({ atUtc: "2026-10-07T09:00", ...base }, NOW)!;
    assert.deepEqual(o, { atUtc: "2026-10-07T09:00", ayanamsa: "kp-newcomb", nodeType: "mean" });
    const u = TR.units(UCTX, o);
    assert.equal(u.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(u[0].body)), KPG.body);
  });
  await t("A2 aralık: kanonik (gezegen/tür sırası farklı → aynı seçenek + aynı önbellek anahtarları); idempotent", () => {
    const a = TR.parseOptions({ range: RANGE, ...base }, NOW)!;
    const b = TR.parseOptions({ range: { ...RANGE, planets: ["sun", "moon"], kinds: ["sublord", "rasi"] }, ...base }, NOW)!;
    assert.deepEqual(a, b);
    assert.deepEqual((a.range as J).planets, ["sun", "moon"]);
    assert.deepEqual((a.range as J).kinds, ["sublord", "rasi"]);
    assert.deepEqual(TR.parseOptions(a, NOW), a);
    assert.deepEqual(TR.units(UCTX, a).map((u) => u.inputHash), TR.units(UCTX, b).map((u) => u.inputHash));
  });
  await t("A3 sınırlar: >92 gün, konum tablosu >7 gün, izinsiz aralık (15 dk), Rahu, bilinmeyen tür, tekrar, boş gezegen → RED", () => {
    const bad = [
      { ...RANGE, days: 93 },
      { ...RANGE, days: 0 },
      { ...RANGE, kinds: ["positions"], intervalMinutes: 360, days: 8 },
      { ...RANGE, kinds: ["positions"], intervalMinutes: 15, days: 1 },
      { ...RANGE, kinds: ["positions"], days: 1 },
      { ...RANGE, planets: ["rahu"] },
      { ...RANGE, kinds: ["sublord", "aspects"] },
      { ...RANGE, kinds: ["sublord", "sublord"] },
      { ...RANGE, planets: [] },
      { ...RANGE, startDate: "2700-01-01" },
      { ...RANGE, intervalMinutes: 60 },
    ];
    for (const r of bad) assert.equal(TR.parseOptions({ range: r, ...base }, NOW), null, JSON.stringify(r));
    assert.equal(TR.parseOptions({ range: RANGE, ayanamsa: "lahiri", nodeType: "mean" }, NOW), null, "KP dışı ayanamsa");
    assert.equal(TR.parseOptions({ range: RANGE, ...base, displayTz: "Mars/X" }, NOW), null);
  });
  await t("A4 maliyet: birim sayısı = gezegen × tür + konum tablosu (istemci tahmini ile aynı); gövdeler UTC, bitiş = başlangıç + gün − 1", () => {
    const o = TR.parseOptions({ range: { startDate: "2026-10-07", days: 7, planets: ["sun", "moon", "mars"], kinds: ["sublord", "rasi", "positions"], intervalMinutes: 360 }, ...base }, NOW)!;
    const u = TR.units(UCTX, o);
    assert.equal(u.length, 3 * 2 + 1);
    const p = { ...defaultParams(NOW), kpRangePlanets: ["sun", "moon", "mars"], kpRangeKinds: ["sublord", "rasi", "positions"] };
    assert.equal(kpRangeRequestCount(p), 7);
    for (const x of u.filter((y) => y.endpoint !== "/vedic-astrology/kp/planets-interval")) {
      assert.equal(x.body.timezone, 0);
      assert.equal(x.body.startDate, "2026-10-07");
      assert.equal(x.body.endDate, "2026-10-13");
    }
    const pos = u.find((y) => y.endpoint === "/vedic-astrology/kp/planets-interval")!;
    assert.equal(pos.body.startDatetime, "2026-10-07T00:00:00");
    assert.equal(pos.body.endDatetime, "2026-10-13T18:00:00");
    assert.equal(pos.body.timezone, 0);
    assert.notEqual(pos.inputHash, TR.units(UCTX, TR.parseOptions({ atUtc: "2026-10-07T00:00", ...base }, NOW)!)[0].inputHash, "tek-an anahtarıyla çakışmaz");
  });
  await t("A5 istemci ↔ sunucu sınırları aynı; istemci seçimi sunucuda geçerli; seçenek etiketi", () => {
    assert.equal(C_MAX, S_MAX);
    assert.equal(C_PMAX, S_PMAX);
    assert.deepEqual([...C_IV], [...S_IV]);
    const p = defaultParams(NOW);
    assert.ok(TR.parseOptions({ range: kpRangeOptions(p), ...base, displayTz: p.kpRangeTz }, NOW));
    assert.match(describeOptions("kp.transit", { range: RANGE, ...base }), /^aralık 07\.10\.2026 \+ 3 gün · Rasi \+ Sub-Lord · Ay, Güneş · KP-Newcomb$/);
    assert.match(describeOptions("kp.transit", { atUtc: "2026-10-07T09:00", ...base }), /07\.10\.2026 09:00 UTC · KP-Newcomb/);
  });

  // ═══ B) Adaptörler fail-closed ════════════════════════════════════════════════
  const ex = { planet: "moon" as const, startDate: "2026-10-07", endDate: "2026-10-08" };
  const sub = syntheticSublordChanges({ planet: "Moon", startDate: ex.startDate, endDate: ex.endDate });
  const ras = syntheticRasiChanges({ planet: "Moon", startDate: "2026-10-01", endDate: "2026-10-31" });
  await t("B1 geçerli sentetik sub-lord + rasi yanıtı kabul edilir; Ay ≈ 9 sub-lord/gün, ≈ 2,3 günde bir rasi", () => {
    const r = projectRoxyKpSublordChanges(sub, ex);
    assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
    if (r.ok) assert.ok(r.part.changes.length >= 14 && r.part.changes.length <= 22, String(r.part.changes.length));
    const q = projectRoxyKpRasiChanges(ras, { planet: "moon", startDate: "2026-10-01", endDate: "2026-10-31" });
    assert.ok(q.ok, q.ok ? "" : q.errors.join("; "));
    if (q.ok) assert.ok(q.part.changes.length >= 12 && q.part.changes.length <= 15, String(q.part.changes.length));
  });
  const mutate = (fn: (r: J) => void, src: J = sub) => {
    const r = structuredClone(src);
    fn(r);
    return r;
  };
  await t("B2 sub-lord REDDİ: yanlış gezegen yankısı, sayım, KP komşuluğu, KP tablosu (sub/yıldız), zincir, pencere, sıra, biçim, satır sınırı", () => {
    const cases: [string, J][] = [
      ["gezegen", mutate((r) => (r.planet = "Sun"))],
      ["sayım", mutate((r) => (r.totalChanges += 1))],
      ["komşuluk", mutate((r) => (r.changes[0].toKp = (r.changes[0].fromKp % 249) + 3))],
      ["tablo sub", mutate((r) => (r.changes[1].toSublord = r.changes[1].toSublord === "Venus" ? "Mars" : "Venus"))],
      ["tablo yıldız", mutate((r) => (r.changes[1].toNakshatraLord = r.changes[1].toNakshatraLord === "Ketu" ? "Rahu" : "Ketu"))],
      ["zincir", mutate((r) => r.changes.splice(2, 1) && (r.totalChanges -= 1))],
      ["pencere", mutate((r) => (r.changes[r.changes.length - 1].datetime = "2026-10-09T01:00:00") && (r.changes[r.changes.length - 1].date = "2026-10-09") && (r.changes[r.changes.length - 1].time = "01:00"))],
      ["sıra", mutate((r) => ([r.changes[3].datetime, r.changes[4].datetime] = [r.changes[4].datetime, r.changes[3].datetime]))],
      ["biçim", mutate((r) => (r.changes[0].datetime = "07/10/2026 03:00"))],
      ["date↔datetime", mutate((r) => (r.changes[0].date = "2026-10-01"))],
    ];
    for (const [name, raw] of cases) {
      const r = projectRoxyKpSublordChanges(raw, ex);
      assert.equal(r.ok, false, `${name} kabul edildi`);
    }
    const huge = mutate((r) => {
      r.changes = Array.from({ length: KP_TIMING_MAX_ROWS + 1 }, () => r.changes[0]);
      r.totalChanges = r.changes.length;
    });
    const h = projectRoxyKpSublordChanges(huge, ex);
    assert.ok(!h.ok && h.errors.some((e) => /satır sınırı/.test(e)), "satır sınırı mesajı");
  });
  await t("B3 rasi REDDİ: komşu olmayan burç, yanlış burç yöneticisi, zincir", () => {
    const exR = { planet: "moon" as const, startDate: "2026-10-01", endDate: "2026-10-31" };
    for (const [name, raw] of [
      ["komşu değil", mutate((r) => (r.changes[0].toSign = "Pisces") && (r.changes[0].toSignLord = "Jupiter"), ras)],
      ["yönetici", mutate((r) => (r.changes[0].toSignLord = "Sun"), ras)],
      ["zincir", mutate((r) => r.changes.splice(1, 1) && (r.totalChanges -= 1), ras)],
    ] as [string, J][])
      assert.equal(projectRoxyKpRasiChanges(raw, exR).ok, false, name);
  });
  await t("B4 konum aralığı: geçerli kabul; nokta sayısı / an / KP lordu / ayanamsa yankısı bozuksa RED", () => {
    const body = { startDatetime: "2026-10-07T00:00:00", endDatetime: "2026-10-07T18:00:00", intervalMinutes: 360, ayanamsa: "kp-newcomb" };
    const syn = syntheticPlanetsInterval(body);
    const exP = { startUtc: body.startDatetime, endUtc: body.endDatetime, intervalMinutes: 360, ayanamsa: "kp-newcomb" as const };
    const ok = projectRoxyKpPlanetsRange(syn, exP);
    assert.ok(ok.ok, ok.ok ? "" : ok.errors.join("; "));
    if (ok.ok) assert.equal(ok.part.rows.length, 4);
    const m2 = (fn: (r: J) => void) => {
      const r = structuredClone(syn) as J;
      fn(r);
      return projectRoxyKpPlanetsRange(r, exP).ok;
    };
    assert.equal(m2((r) => r.intervals.pop()), false);
    assert.equal(m2((r) => (r.intervals[1].datetime = "2026-10-07T07:00:00")), false);
    assert.equal(m2((r) => (r.intervals[0].planets.Moon.sublord = r.intervals[0].planets.Moon.sublord === "Venus" ? "Mars" : "Venus")), false);
    assert.equal(m2((r) => (r.ayanamsa = "lahiri")), false);
  });

  // ═══ C) Sentetik üretici doğrulaması ═══════════════════════════════════════════
  await t("C1 sentetik konumlar gerçek golden KP konumlarıyla ≤0,01° ve KP numaraları birebir (9 graha)", () => {
    const s = syntheticPlanetsInterval({ startDatetime: "2026-10-07T09:00:00", endDatetime: "2026-10-07T09:00:00", intervalMinutes: 60, ayanamsa: "kp-newcomb" });
    for (const [n, p] of Object.entries(KPG.response.intervals[0].planets as Record<string, J>)) {
      const q = (s.intervals[0].planets as Record<string, J>)[n];
      assert.ok(Math.abs(q.longitude - p.longitude) <= 0.01, `${n} ${q.longitude} vs ${p.longitude}`);
      assert.equal(q.kpNumber, p.kpNumber, n);
    }
    assert.ok(Math.abs(kpNewcombApprox(Date.parse("2026-10-07T09:00:00Z")) - KPG.response.ayanamsaValue) < 1e-9);
  });
  await t("C2 sentetik geçiş anları: anın 30 sn öncesi önceki KP / burç, 30 sn sonrası yeni KP / burç (bağımsız tablo)", () => {
    const tbl = kpTable();
    const kpAt = (ms: number) => tbl.find((r) => siderealLon("moon", ms) >= r.start && siderealLon("moon", ms) < r.end)!.kp;
    for (const c of sub.changes as J[]) {
      const ms = Date.parse(`${c.datetime}Z`);
      assert.equal(kpAt(ms - 30_000), c.fromKp);
      assert.equal(kpAt(ms + 30_000), c.toKp);
    }
    for (const c of ras.changes as J[]) {
      const ms = Date.parse(`${c.datetime}Z`);
      assert.equal(SIGN_IDS[Math.floor(siderealLon("moon", ms + 30_000) / 30)], String(c.toSign).toLowerCase());
    }
  });

  // ═══ D) Uçtan uca ══════════════════════════════════════════════════════════════
  const store = createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
  const ctx = ctxOf(store);
  const pr = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  const pid = (pr.body as J).profile.id;
  const calls: string[] = [];
  let failRasiSun = false;
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push(`${endpoint}:${String(body.planet ?? "")}`);
      if (failRasiSun && endpoint.endsWith("rasi-changes") && body.planet === "Sun") return { ok: false, kind: "server_error", status: 500, attempts: 1 };
      if (endpoint.endsWith("sublord-changes")) return { ok: true, raw: syntheticSublordChanges(body as J), attempts: 1 };
      if (endpoint.endsWith("rasi-changes")) return { ok: true, raw: syntheticRasiChanges(body as J), attempts: 1 };
      if (endpoint.endsWith("planets-interval")) return { ok: true, raw: syntheticPlanetsInterval(body as J), attempts: 1 };
      return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => NOW,
  };
  const SEL = { technique: "kp.transit", options: { range: { startDate: "2026-10-07", days: 3, planets: ["sun", "moon"], kinds: ["sublord", "rasi", "positions"], intervalMinutes: 360 }, ...base, displayTz: "Europe/Istanbul" } };
  let savedId = "";
  await t("D1 plan ücretsiz: 5 yeni istek (2 gezegen × 2 tür + konum); onay eşiği altında", async () => {
    const r = await planAstrology(ctx, { profileId: pid, selections: [SEL] });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    assert.equal((r.body as J).plan.newRequestCount, 5);
    assert.equal(calls.length, 0);
  });
  await t("D2 kısmi hata: Güneş rasi 500 → diğer 4 parça kaydedilir, eksik parça ADIYLA listelenir (sessiz düşürme yok)", async () => {
    failRasiSun = true;
    const r = await runAstrology(ctx, { profileId: pid, selections: [SEL] }, deps, { ownerPreviewHideInterp: false });
    failRasiSun = false;
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const it = (r.body as J).results[0];
    assert.ok(it.ok && it.partial);
    const tech = it.view.technical as KpTimingTechnical;
    assert.deepEqual(tech.missing, ["rasi:sun"]);
    assert.ok(it.view.warnings.some((w: string) => /KP zaman aralığı parçası hesaplanamadı/.test(w)));
  });
  await t("D3 yeniden çalıştır: yalnız eksik parça istenir (1 istek); birleşik teknik tam", async () => {
    const before = calls.length;
    const r = await runAstrology(ctx, { profileId: pid, selections: [SEL] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(calls.length - before, 1);
    const tech = (r.body as J).results[0].view.technical as KpTimingTechnical;
    assert.deepEqual(tech.missing, []);
    assert.equal(tech.sublord.length, 2);
    assert.equal(tech.rasi.length, 2);
    assert.equal(tech.positions!.rows.length, 12);
    assert.ok(tech.frame.ayanamsaDegrees !== null);
  });
  await t("D4 kaydet → yeniden aç 0 istek, teknik birebir; seçenekte gösterim saat dilimi", async () => {
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    savedId = (sv.body as J).analysisId;
    const before = calls.length;
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    const b = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    assert.equal(JSON.stringify(a.technical), JSON.stringify(b.technical));
    assert.equal(a.params.displayTz, "Europe/Istanbul");
    assert.equal(calls.length, before);
  });
  await t("D5 Word + PDF: Sub-Lord / Rasi / konum tabloları, yerel saat + UTC, harita/'çizilemedi' YOK, 'otomatik yorum bulunmuyor' notu", async () => {
    const dx = await buildAnalysisReport(ctx, savedId, "docx", false);
    const px = await buildAnalysisReport(ctx, savedId, "pdf", false);
    assert.ok(dx.ok && px.ok);
    if (!dx.ok || !px.ok) return;
    assert.equal(dx.hasChart, false);
    const d = await docxText(dx.bytes);
    const p = await pdfInfo(px.bytes);
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis as J;
    const first = (a.technical as KpTimingTechnical).sublord[0].changes[0];
    for (const [label, txt] of [["docx", d], ["pdf", p.text]] as const) {
      for (const needle of ["Sub-Lord değişimleri", "Rasi (burç) geçişleri", "KP konum tablosu", "Europe/Istanbul", "UTC günleri", "Zaman aralığı", "otomatik yorum bulunmuyor", String(first.toKp)]) assert.ok(txt.includes(needle), `${label}: "${needle}" yok`);
      for (const bad of ["çizilemedi", "undefined", "NaN", "[object Object]"]) assert.ok(!txt.includes(bad), `${label}: ${bad}`);
    }
    const rep = buildAstroReport(a);
    for (const b of rep.blocks) if (b.kind === "table") for (const row of b.table.rows) assert.equal(row.length, b.table.columns.length, "satır/sütun uyumsuz");
  });

  // ═══ E) Boyut ═════════════════════════════════════════════════════════════════
  await t("E1 92 gün Ay Sub-Lord: satır < sınır, teknik katman < 1 MB; tek-an seçimleri etkilenmez", () => {
    const big = syntheticSublordChanges({ planet: "Moon", startDate: "2026-10-01", endDate: "2026-12-31" });
    const r = projectRoxyKpSublordChanges(big, { planet: "moon", startDate: "2026-10-01", endDate: "2026-12-31" });
    assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
    if (!r.ok) return;
    assert.ok(r.part.changes.length > 700 && r.part.changes.length < KP_TIMING_MAX_ROWS, String(r.part.changes.length));
    const bytes = Buffer.byteLength(JSON.stringify(r.part));
    assert.ok(bytes < 1_000_000, `${bytes} bayt`);
    console.log(`     (92 gün Ay: ${r.part.changes.length} geçiş, ${Math.round(bytes / 1024)} KB)`);
  });

  // ═══ G) GERÇEK golden (owner onaylı 3 çağrı) — varsa doğrula, yoksa AÇIKÇA ATLA ═════════════════════════════
  const G = (n: string) => {
    const p = join(__dirname, "fixtures", "golden", `${n}.json`);
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  const gs = G("kp-sublord-moon");
  const gr = G("kp-rasi-moon");
  const gp = G("kp-planets-range");
  let skip = 0;
  if (!gs || !gr || !gp) {
    skip = 3;
    console.log("SKIP G1–G3 gerçek sağlayıcı golden'ı yok (kp-sublord-moon / kp-rasi-moon / kp-planets-range) — owner onaylı 3 çağrı bekleniyor; bu üç uç GERÇEK yanıtla doğrulanmadı.");
  } else {
    await t("G1 gerçek sub-lord yanıtı adaptörden geçer; her geçiş bağımsız astronomiyle ±120 sn ve aynı KP numaraları", () => {
      const r = projectRoxyKpSublordChanges(gs.response, { planet: "moon", startDate: String(gs.body.startDate), endDate: String(gs.body.endDate) });
      assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
      if (!r.ok) return;
      const syn = syntheticSublordChanges(gs.body as J).changes as J[];
      assert.equal(r.part.changes.length, syn.length, "geçiş sayısı");
      r.part.changes.forEach((c, i) => {
        assert.equal(c.toKp, syn[i].toKp);
        assert.ok(Math.abs(Date.parse(c.atUtc) - Date.parse(`${syn[i].datetime}Z`)) <= 120_000, `${c.atUtc} vs ${syn[i].datetime}`);
      });
    });
    await t("G2 gerçek rasi yanıtı adaptörden geçer; geçişler bağımsız astronomiyle ±120 sn", () => {
      const r = projectRoxyKpRasiChanges(gr.response, { planet: "moon", startDate: String(gr.body.startDate), endDate: String(gr.body.endDate) });
      assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
      if (!r.ok) return;
      const syn = syntheticRasiChanges(gr.body as J).changes as J[];
      assert.equal(r.part.changes.length, syn.length);
      r.part.changes.forEach((c, i) => assert.ok(Math.abs(Date.parse(c.atUtc) - Date.parse(`${syn[i].datetime}Z`)) <= 120_000, `${c.atUtc} vs ${syn[i].datetime}`));
    });
    await t("G3 gerçek konum aralığı adaptörden geçer; 9 graha × 4 an bağımsız astronomiyle ≤0,01°", () => {
      const r = projectRoxyKpPlanetsRange(gp.response, { startUtc: String(gp.body.startDatetime), endUtc: String(gp.body.endDatetime), intervalMinutes: Number(gp.body.intervalMinutes), ayanamsa: "kp-newcomb" });
      assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
      if (!r.ok) return;
      for (const row of r.part.rows) for (const b of row.bodies) assert.ok(Math.abs(((b.longitude - siderealLon(b.id, Date.parse(row.atUtc)) + 540) % 360) - 180) <= 0.01, `${b.id} @ ${row.atUtc}`);
    });
  }

  console.log(`\nastrology transit03 harness: ${pass} PASS / ${fail} FAIL${skip ? ` / ${skip} SKIP (gerçek golden yok)` : ""}`);
  if (fail > 0) process.exit(1);
}

void main();
