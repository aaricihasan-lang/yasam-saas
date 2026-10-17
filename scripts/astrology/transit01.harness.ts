/**
 * TRANSİT-01 harness'i (2026-10-17) — Batı Transit + Transit Takvimi profesyonel tamamlama.
 *
 *   A) Seçenekler: eski biçimler BİREBİR korunur; gösterim saat dilimi + takvim bağlantısı gövdeye/önbellek anahtarına girmez.
 *   B) Takvim → transit: yalnız-önbellek bağlam birimleri (forecast parçalarıyla AYNI anahtar); kesinleşme eşleşmesi;
 *      eksik parça → complete=false; düğüm/Lilith eşleştirilmez; saat bilinmiyorsa açısal hedefler gizli.
 *   C) Uçtan uca (sahte Roxy = golden): takvim → gün → transit 1 istek, takvim 0 ek istek; kaydet → kayıtlı analizde
 *      kesinleşme anları AYNEN; tekrar açma 0 istek; yorum kapalı uzmana yorum alanı yok; Word + PDF içerikleri.
 *   D) Saat dilimi / yaz saati: istemci ön izlemesi = sunucu normalizasyonu (İstanbul 2015 yaz/kış, New York geçişleri).
 *   E) Bağımsız astronomi: golden takvimin kesinleşme anları astronomy-engine ile (natal + transit boylamları) ≤ 0,02°.
 *   F) Yardımcılar: natal ev yerleşimi (360° sarması), en güçlü sıralaması, gün gruplaması, gün ortası UTC.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/transit01.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, normalizeTransitMoment } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { buildAstroReport } from "@/lib/astrology/report/model";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { forecastChunks } from "@/lib/astrology/providers/roxy/requests";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import type { ForecastTechnical, TransitTechnical } from "@/lib/astrology/model/westernTiming";
import {
  aspectTypeCounts,
  calendarExactFor,
  daysBetweenIso,
  addDaysIso,
  dateInputIssue,
  exactTimesOf,
  formatInZone,
  groupEventsByDay,
  localToUtcPreview,
  middayUtcOf,
  momentLabel,
  natalHouseOf,
  relativeTo,
  strongestTransits,
  timeInputIssue,
  transitNatalHouses,
} from "@/lib/astrology/transitDetail";
import { buildSelections, dateInputReason, defaultParams, describeOptions, missingReason } from "@/app/admin/astroloji/_lib/techniques";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const G = Object.fromEntries(["transit", "forecast"].map((n) => [n, JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"))])) as Record<string, { endpoint: string; body: Record<string, unknown>; response: J }>;
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const BY_ENDPOINT: Record<string, J> = { "/astrology/natal-chart": NATAL_GOLDEN, [G.transit.endpoint]: G.transit.response, [G.forecast.endpoint]: G.forecast.response };

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
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const OTHER = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

function roxy() {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const base = BY_ENDPOINT[endpoint];
      if (!base) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(base);
      if (endpoint === "/forecast/transits") {
        const s = String(body.startDate);
        const e = String(body.endDate);
        r.events = (r.events as J[]).filter((x) => x.date >= s && x.date <= e);
      }
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => new Date("2026-10-07T09:41:00Z"),
  };
  return { calls, deps };
}

async function newProfile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, extra: Record<string, unknown> = {}) => runAstrology(ctx, { profileId: pid, selections, ...extra }, deps, { ownerPreviewHideInterp: false });

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
async function pdfText(buf: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return String(text).replace(/\s+/g, " ");
}

const TR = getTechnique("western.transit")!;
const FC = getTechnique("western.forecast")!;
const NOW = new Date("2026-10-07T09:41:00Z");
const BIRTH = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 } as never;
const UCTX = { birth: BIRTH, birthUtc: "1990-07-15T11:30:00Z", partner: null } as never;
const CAL = { startDate: "2026-10-01", days: 90 };

async function main() {
  // ═══ A) Seçenekler + önbellek anahtarı korunumu ═══════════════════════════════
  await t("A1 eski seçenek biçimleri BİREBİR: şimdi → {atUtc saat başı, nodeType}; atUtc → aynısı; forecast {startDate, days}", () => {
    assert.deepEqual(TR.parseOptions({ now: true, nodeType: "true" }, NOW), { atUtc: "2026-10-07T09:00", nodeType: "true" });
    assert.deepEqual(TR.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "mean" }, NOW), { atUtc: "2026-10-07T09:00", nodeType: "mean" });
    assert.deepEqual(FC.parseOptions({ startDate: "2026-10-01", days: 90 }, NOW), { startDate: "2026-10-01", days: 90 });
  });
  await t("A2 seçilen gün/saat dakika hassasiyetiyle UTC'ye çevrilir + gösterim saat dilimi korunur; idempotent (plan → run)", () => {
    const o = TR.parseOptions({ date: "2026-10-07", time: "14:37", timezone: "Europe/Istanbul", nodeType: "true" }, NOW)!;
    assert.deepEqual(o, { atUtc: "2026-10-07T11:37", nodeType: "true", displayTz: "Europe/Istanbul" });
    assert.deepEqual(TR.parseOptions(o, NOW), o);
    const n = TR.parseOptions({ now: true, nodeType: "true", displayTz: "America/New_York" }, NOW)!;
    assert.deepEqual(n, { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "America/New_York" });
    assert.deepEqual(TR.parseOptions(n, NOW), n);
    const f = FC.parseOptions({ startDate: "2026-10-01", days: 30, displayTz: "Asia/Tokyo" }, NOW)!;
    assert.deepEqual(FC.parseOptions(f, NOW), f);
  });
  await t("A3 geçersizler reddedilir: bozuk saat dilimi, 1600–2600 dışı yıl, 367 gün, bozuk takvim penceresi", () => {
    assert.equal(TR.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Mars/Olympus" }, NOW), null);
    assert.equal(TR.parseOptions({ atUtc: "2700-01-01T00:00", nodeType: "true" }, NOW), null);
    assert.equal(TR.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "true", calendar: { startDate: "2026-10-01", days: 367 } }, NOW), null);
    assert.equal(TR.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "true", calendar: "x" }, NOW), null);
    assert.equal(FC.parseOptions({ startDate: "2026-10-01", days: 90, displayTz: 5 }, NOW), null);
    assert.equal(FC.parseOptions({ startDate: "1500-10-01", days: 90 }, NOW), null);
  });
  await t("A4 ÖNBELLEK ANAHTARI DEĞİŞMEZ: displayTz / calendar gövdeye girmez → aynı inputHash (transit + forecast parçaları)", () => {
    const base = TR.units(UCTX, TR.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "true" }, NOW)!);
    const rich = TR.units(UCTX, TR.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Europe/Istanbul", calendar: CAL }, NOW)!);
    assert.equal(base.length, 1);
    assert.deepEqual(rich.map((u) => u.inputHash), base.map((u) => u.inputHash));
    assert.deepEqual(rich[0].body, base[0].body);
    const f1 = FC.units(UCTX, { startDate: "2026-10-01", days: 180 });
    const f2 = FC.units(UCTX, FC.parseOptions({ startDate: "2026-10-01", days: 180, displayTz: "Europe/Istanbul" }, NOW)!);
    assert.deepEqual(f2.map((u) => u.inputHash), f1.map((u) => u.inputHash));
    // Golden gövdesi ile birebir (gerçek sağlayıcı yanıtı bu gövdeye aitti).
    assert.deepEqual(JSON.parse(JSON.stringify(FC.units(UCTX, CAL)[0].body)), G.forecast.body);
  });
  await t("A5 bağlam birimleri: takvim yoksa yalnız 4 natal (eski davranış); takvim varsa + forecast parçaları (forecast tekniğiyle AYNI anahtarlar)", () => {
    const plain = TR.contextUnits!(UCTX, { atUtc: "2026-10-07T09:00", nodeType: "true" });
    assert.equal(plain.length, 4);
    assert.ok(plain.every((u) => u.endpoint === "/astrology/natal-chart"));
    const withCal = TR.contextUnits!(UCTX, { atUtc: "2026-10-07T09:00", nodeType: "true", calendar: { startDate: "2026-10-01", days: 200 } });
    const fcUnits = FC.units(UCTX, { startDate: "2026-10-01", days: 200 });
    assert.equal(withCal.length, 4 + fcUnits.length);
    assert.deepEqual(withCal.slice(4).map((u) => u.inputHash), fcUnits.map((u) => u.inputHash));
  });
  await t("A6 seçenek etiketi: yerel an + bölge + UTC; eski kayıt (displayTz yok) yalnız UTC — metin eskisiyle aynı", () => {
    assert.equal(describeOptions("western.transit", { atUtc: "2026-10-07T09:00", nodeType: "true" }), "07.10.2026 09:00 UTC");
    assert.equal(describeOptions("western.transit", { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Europe/Istanbul" }), "07.10.2026 12:00 GMT+3 (07.10.2026 09:00 UTC)");
    assert.match(describeOptions("western.transit", { atUtc: "2026-10-07T09:00", nodeType: "true", calendar: CAL }), /takvim 01\.10\.2026 \+ 90 gün$/);
    assert.match(describeOptions("western.forecast", { startDate: "2026-10-01", days: 90, displayTz: "Europe/Istanbul" }), /→ 29\.12\.2026.*Europe\/Istanbul$/);
  });

  // ═══ B) Kesinleşme eşleşmesi + maske ════════════════════════════════════════
  const fcTech = (FC.project(FC.units(UCTX, CAL)[0], G.forecast.response, CAL) as J).technical as ForecastTechnical;
  const trTech = (TR.project(TR.units(UCTX, { atUtc: "2026-10-07T09:00", nodeType: "true" })[0], G.transit.response, { atUtc: "2026-10-07T09:00", nodeType: "true" }) as J).technical as TransitTechnical;
  await t("B1 golden takvim + golden transit: kesinleşme anları yalnız aynı gezegen + aynı natal hedef + aynı açı türünden", () => {
    const ce = calendarExactFor(trTech, [fcTech], { start: "2026-10-01", end: "2026-12-29" })!;
    assert.ok(ce.complete);
    assert.ok(ce.hits.length > 0, "en az bir eşleşme beklenir");
    for (const h of ce.hits) {
      const evs = fcTech.events.filter((e) => e.type === "transit_aspect" && e.body === h.transit && e.targetBody === h.natal && e.aspect === h.type).map((e) => e.datetime);
      assert.deepEqual([...new Set(evs)].sort(), h.exactUtc);
      assert.ok(trTech.aspects.some((a) => a.transit === h.transit && a.natal === h.natal && a.type === h.type));
      assert.ok(!["north_node", "south_node", "lilith"].includes(h.transit) && !["north_node", "south_node", "lilith"].includes(h.natal), "düğüm/Lilith eşleştirilmemeli");
    }
  });
  await t("B1b tutarlılık: yaklaşan → en yakın kesinleşme sonra, ayrılan → önce; farklıysa transit gezegen geri harekette veya arada istasyon var", () => {
    const ce = calendarExactFor(trTech, [fcTech], { start: "2026-10-01", end: "2026-12-29" })!;
    const at = Date.parse("2026-10-07T09:00Z");
    let consistent = 0;
    for (const h of ce.hits) {
      const a = trTech.aspects.find((x) => x.transit === h.transit && x.natal === h.natal && x.type === h.type)!;
      const near = h.exactUtc.map((e) => Date.parse(e)).sort((x, y) => Math.abs(x - at) - Math.abs(y - at))[0];
      if (a.applying === near > at) {
        consistent += 1;
        continue;
      }
      const retro = trTech.bodies.find((b) => b.id === h.transit)?.retrograde === true;
      const station = fcTech.events.some((e) => e.type === "retrograde_station" && e.body === h.transit && Date.parse(e.datetime) >= Math.min(at, near) - 7 * 86_400_000 && Date.parse(e.datetime) <= Math.max(at, near));
      assert.ok(retro || station, `${h.transit} ${h.type} ${h.natal}: seyir ile kesinleşme yönü çelişiyor ve istasyon yok`);
    }
    assert.ok(consistent >= ce.hits.length - 2, `${consistent}/${ce.hits.length}`);
  });
  await t("B2 eksik takvim parçası → complete=false (liste eksik olabilir uyarısı); hiç parça yok → null (alan gösterilmez)", () => {
    const ce = calendarExactFor(trTech, [fcTech, null], { start: "2026-10-01", end: "2027-03-29" })!;
    assert.equal(ce.complete, false);
    assert.equal(calendarExactFor(trTech, [null, null], { start: "2026-10-01", end: "2027-03-29" }), null);
  });
  await t("B3 attachContext: takvim seçeneği yoksa teknik katmanda calendarExact ANAHTARI YOK (eski snapshot biçimi)", () => {
    const natal = (getTechnique("western.natal")!.project(null as never, NATAL_GOLDEN, { houseSystem: "placidus", nodeType: "true" }) as J).technical;
    const out = TR.attachContext!(trTech, [natal, null, null, null], { atUtc: "2026-10-07T09:00", nodeType: "true" }) as J;
    assert.ok(!("calendarExact" in out));
    assert.ok(out.natalFrame);
    const out2 = TR.attachContext!(trTech, [natal, null, null, null, fcTech], { atUtc: "2026-10-07T09:00", nodeType: "true", calendar: CAL }) as J;
    assert.ok(out2.calendarExact && out2.calendarExact.hits.length > 0 && out2.natalFrame);
  });
  await t("B4 saat bilinmiyor: natal Yükselen/MC hedefli kesinleşmeler de gizlenir (maske)", () => {
    const fake = { ...trTech, calendarExact: { window: { start: "2026-10-01", end: "2026-12-29" }, complete: true, hits: [{ transit: "mars", natal: "ascendant", type: "square", exactUtc: ["2026-10-08T00:00:00Z"] }, { transit: "mars", natal: "sun", type: "trine", exactUtc: ["2026-10-09T00:00:00Z"] }] } } as TransitTechnical;
    const m = maskTechnical("western.transit", fake, { primary: false, partner: null }) as J;
    const out = (m.technical ?? m) as TransitTechnical;
    assert.deepEqual(out.calendarExact!.hits.map((h) => h.natal), ["sun"]);
  });

  // ═══ C) Uçtan uca (sahte Roxy = golden) ══════════════════════════════════════
  const store = createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
  const ctx = ctxOf(store);
  const pa = await newProfile(ctx);
  const rx = roxy();
  let savedId = "";
  await t("C1 takvim (90 gün) 1 istek → gün seçimi 0 istek (istemci) → günün transit haritası 1 istek; takvim parçası YENİDEN istenmez", async () => {
    const r1 = await run(ctx, pa, [{ technique: "western.forecast", options: { ...CAL, displayTz: "Europe/Istanbul" } }], rx.deps);
    assert.equal(r1.status, 200, JSON.stringify(r1.body).slice(0, 300));
    await run(ctx, pa, [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }], rx.deps);
    const before = rx.calls.length;
    const r2 = await run(ctx, pa, [{ technique: "western.transit", options: { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Europe/Istanbul", calendar: CAL } }], rx.deps);
    assert.equal(r2.status, 200, JSON.stringify(r2.body).slice(0, 300));
    assert.deepEqual(rx.calls.slice(before).map((c) => c.endpoint), ["/astrology/transits"]);
    const v = (r2.body as J).results[0].view;
    assert.ok(v.technical.natalFrame, "çift halka natal çerçevesi");
    assert.ok(v.technical.calendarExact && v.technical.calendarExact.hits.length > 0, "kesinleşme anları");
    assert.equal(v.options.displayTz, "Europe/Istanbul");
  });
  await t("C2 aynı an tekrar (başka gösterim saat dilimiyle) → 0 sağlayıcı isteği (önbellek anahtarı aynı)", async () => {
    const before = rx.calls.length;
    const r = await run(ctx, pa, [{ technique: "western.transit", options: { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "UTC" } }], rx.deps);
    assert.equal(r.status, 200);
    assert.equal(rx.calls.length, before);
  });
  await t("C3 kaydet → kayıtlı analizde kesinleşme + saat dilimi AYNEN; tekrar açma 0 istek; önceki kayıt değişmez", async () => {
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, technique: "western.transit", options: { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Europe/Istanbul", calendar: CAL }, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 300));
    savedId = (sv.body as J).analysisId;
    const before = rx.calls.length;
    const a1 = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    assert.ok(a1.technical.calendarExact.hits.length > 0);
    assert.equal(a1.params.displayTz, "Europe/Istanbul");
    assert.deepEqual(a1.params.calendar, CAL);
    const a2 = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    assert.equal(JSON.stringify(a2.technical), JSON.stringify(a1.technical));
    assert.equal(rx.calls.length, before);
  });
  await t("C4 yorum yetkisi KAPALI uzman: yorum alanı yanıtta YOK; teknik katmanda sağlayıcı metni yok (kesinleşme yalnız kimlik + zaman)", async () => {
    const a = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), savedId, false)).body as J).analysis;
    assert.equal(a.interpretation.visible, false);
    assert.ok(!("content" in a.interpretation));
    const s = JSON.stringify(a.technical.calendarExact);
    for (const e of G.forecast.response.events as J[]) if (typeof e.description === "string") assert.ok(!s.includes(e.description));
    for (const ta of G.transit.response.transitAspects as J[]) if (ta.interpretation?.summary) assert.ok(!JSON.stringify(a).includes(ta.interpretation.summary), "yorum metni sızdı");
  });
  await t("C5 başka uzman (aynı tenant) kayıtlı transit analizine erişemez (404)", async () => {
    const r = await getAnalysis(ctxOf(store, { userId: OTHER }), savedId, false);
    assert.equal(r.status, 404);
  });
  await t("C6 Word + PDF: yerel an + saat dilimi + UTC, en güçlü transitler, Güç ve Kesinleşme sütunları; aynı değerler iki biçimde", async () => {
    const dx = await buildAnalysisReport(ctx, savedId, "docx", false);
    const px = await buildAnalysisReport(ctx, savedId, "pdf", false);
    assert.ok(dx.ok && px.ok);
    if (!dx.ok || !px.ok) return;
    assert.ok(dx.hasChart && px.hasChart, "çift halka harita");
    const d = await docxText(dx.bytes);
    const p = await pdfText(px.bytes);
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    const first = a.technical.calendarExact.hits[0].exactUtc[0] as string;
    const exactTxt = formatInZone(first, "Europe/Istanbul")!.text;
    for (const [label, txt] of [["docx", d], ["pdf", p]] as const) {
      for (const needle of ["07.10.2026 12:00", "Europe/Istanbul", "07.10.2026 09:00 UTC", "En güçlü transitler", "Kesinleşme", "Güç", "Kaynak takvim", exactTxt]) assert.ok(txt.includes(needle), `${label}: "${needle}" yok`);
      for (const bad of ["undefined", "NaN", "[object Object]"]) assert.ok(!txt.includes(bad), `${label}: ${bad}`);
    }
  });
  await t("C7 Transit Takvimi raporu: önem puanı + açıklaması, gün gün tablo, [genel] ayrımı, yerel saat (Word + PDF)", async () => {
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, technique: "western.forecast", options: { ...CAL, displayTz: "Europe/Istanbul" }, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    const id = (sv.body as J).analysisId;
    for (const fmt of ["docx", "pdf"] as const) {
      const r = await buildAnalysisReport(ctx, id, fmt, false);
      assert.ok(r.ok);
      if (!r.ok) return;
      const txt = fmt === "docx" ? await docxText(r.bytes) : await pdfText(r.bytes);
      for (const needle of ["Önem puanı en yüksek olaylar", "Takvim (gün gün)", "[genel]", "Europe/Istanbul", "gerçekleşme olasılığı", "01.10.2026"]) assert.ok(txt.includes(needle), `${fmt}: "${needle}" yok`);
      assert.ok(!txt.includes("undefined") && !txt.includes("NaN"));
    }
  });
  await t("C7b Takvim 'Olay Açıklamaları' (yorum açık): Word + PDF'te yerel saat (GMT+3) + UTC birlikte; displayTz yoksa eski UTC biçimi", async () => {
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, technique: "western.forecast", options: { ...CAL, displayTz: "Europe/Istanbul" }, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    const id = (sv.body as J).analysisId;
    const ev0 = (G.forecast.response.events as J[])[0];
    const local = formatInZone(ev0.datetime, "Europe/Istanbul")!;
    for (const fmt of ["docx", "pdf"] as const) {
      const r = await buildAnalysisReport(ctx, id, fmt, false);
      assert.ok(r.ok);
      if (!r.ok) return;
      const txt = fmt === "docx" ? await docxText(r.bytes) : await pdfText(r.bytes);
      assert.ok(txt.includes(`${local.text} ${local.zone} · ${String(ev0.datetime).slice(11, 16)} UTC`), `${fmt}: yorum bölümünde yerel saat yok`);
    }
    const old = buildAstroReport({ technique: "western.forecast", params: CAL, technical: fcTech, method: {}, profile: { label: "X" }, interpretation: { visible: true, schema: "astro.western.forecast.interp.v1", content: { schema: "astro.western.forecast.interp.v1", events: [{ datetime: ev0.datetime, type: "transit_aspect", body: "mars", targetBody: "mars", text: "x" }] } } } as never);
    assert.ok(JSON.stringify(old.blocks).includes("01.10.2026 09:53 UTC"), "eski kayıt biçimi");
  });
  await t("C8 ESKİ biçimli transit kaydı (displayTz/calendar yok) raporu üretir: UTC an, kesinleşme notu, yeni sütunlar güvenli", () => {
    const rep = buildAstroReport({ technique: "western.transit", params: { atUtc: "2026-10-07T09:00", nodeType: "true" }, technical: trTech, method: {}, profile: { label: "X" } } as never);
    const txt = JSON.stringify(rep.blocks);
    assert.ok(txt.includes("07.10.2026 09:00 UTC"));
    assert.ok(txt.includes("tek bir anı hesaplar"));
    assert.ok(!txt.includes("undefined"));
  });

  // ═══ D) Saat dilimi / yaz saati ══════════════════════════════════════════════
  const CASES: [string, string, string][] = [
    ["2015-07-01", "12:00", "Europe/Istanbul"], // eski TR yaz saati (UTC+3)
    ["2015-01-15", "12:00", "Europe/Istanbul"], // eski TR kış saati (UTC+2)
    ["2026-10-17", "00:15", "Europe/Istanbul"], // gün sınırı
    ["2026-03-08", "02:30", "America/New_York"], // ileri alma boşluğu (yok)
    ["2026-11-01", "01:30", "America/New_York"], // geri alma örtüşmesi (önce yaşanan)
    ["2026-06-21", "23:59", "Pacific/Kiritimati"], // UTC+14
    ["1979-02-12", "06:30", "Europe/Istanbul"],
  ];
  await t("D1 istemci UTC ön izlemesi = sunucu normalizasyonu (yaz/kış saati, boşluk, örtüşme, UTC+14)", () => {
    for (const [d, tm, tz] of CASES) {
      const server = normalizeTransitMoment({ date: d, time: tm, timezone: tz }, NOW);
      const client = localToUtcPreview(d, tm, tz);
      if (server === null) assert.equal(client.ok, false, `${d} ${tm} ${tz}: sunucu reddetti, istemci kabul etti`);
      else assert.equal(client.text, `Hesaplanacak an: ${server.slice(8, 10)}.${server.slice(5, 7)}.${server.slice(0, 4)} ${server.slice(11, 16)} UTC`, `${d} ${tm} ${tz}`);
    }
    assert.equal(normalizeTransitMoment({ date: "2015-07-01", time: "12:00", timezone: "Europe/Istanbul" }, NOW), "2015-07-01T09:00");
    assert.equal(normalizeTransitMoment({ date: "2015-01-15", time: "12:00", timezone: "Europe/Istanbul" }, NOW), "2015-01-15T10:00");
  });
  await t("D2 gösterim: momentLabel / formatInZone yaz-kış saatini doğru kısaltır; gün ortası (yerel 12:00) UTC'si", () => {
    assert.equal(momentLabel("2015-07-01T09:00", "Europe/Istanbul"), "01.07.2015 12:00 (GMT+3, Europe/Istanbul) · 01.07.2015 09:00 UTC");
    assert.equal(formatInZone("2015-01-15T10:00", "Europe/Istanbul")!.zone, "GMT+2");
    assert.equal(momentLabel("2026-10-07T09:00", null), "07.10.2026 09:00 UTC");
    assert.equal(middayUtcOf("2026-10-07", "Europe/Istanbul"), "2026-10-07T09:00");
    assert.equal(middayUtcOf("2026-07-01", "America/New_York"), "2026-07-01T16:00");
    assert.equal(middayUtcOf("2026-01-15", "America/New_York"), "2026-01-15T17:00");
    assert.equal(relativeTo("2026-10-07T09:00", "2026-10-08T13:30:00Z"), "1 gün 4 sa sonra");
    assert.equal(relativeTo("2026-10-07T09:00", "2026-10-07T07:00:00Z"), "2 sa önce");
    assert.equal(daysBetweenIso("2026-10-01", "2026-12-29"), 90);
    assert.equal(addDaysIso("2026-10-01", 89), "2026-12-29");
  });
  // ═══ D4–D7) Tarih girişi (canlı P1, 17.10.2026): tarayıcı tarih kutusu yıl rakam rakam yazılırken "0002-10-17",
  // "0020-10-17", "0202-10-17" ara değerlerini üretir; eski ön izleme bunlarda Intl.formatToParts(NaN) → RangeError ile
  // sayfayı çökertiyordu. Kural: hiçbir girişte istisna yok; eksik/geçersiz → açıklayıcı uyarı; plana / API'ye girmez.
  const PARTIAL = ["", "0002-10-17", "0020-10-17", "0202-10-17", "0000-10-17", "0001-01-01", "0099-12-31", "0999-06-15"];
  const CAL_BAD = ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-10-00", "2026-10-32", "26-10-17", "2026-1-7", "abcd-ef-gh", "2026-10-17T00:00", " 2026-10-17"];
  const RANGE_BAD = ["1599-12-31", "2601-01-01", "9999-12-31"];
  const INVALID = [...CAL_BAD, ...RANGE_BAD];
  const VALID = ["2026-10-17", "2028-02-29", "2024-02-29", "1600-01-01", "2600-12-31", "1979-02-12", "2099-12-31"];
  const TIMES = ["12:00", "00:00", "23:59", "", "24:00", "12:60", "1:05", "12:5", "ab:cd"];
  const ZONES = ["Europe/Istanbul", "UTC", "America/New_York", "Pacific/Kiritimati", "Australia/Lord_Howe", "", "Mars/Olympus"];
  await t("D4 eksik / geçersiz tarih-saat-bölge: localToUtcPreview, middayUtcOf, addDaysIso, daysBetweenIso, formatInZone HİÇBİR girişte istisna atmaz; ok=false + açıklama, 'Invalid'/'NaN' yok", () => {
    for (const d of [...PARTIAL, ...INVALID])
      for (const tm of TIMES)
        for (const tz of ZONES) {
          const r = localToUtcPreview(d, tm, tz);
          assert.equal(r.ok, false, `${JSON.stringify(d)} ${tm} ${tz} kabul edilmemeli`);
          assert.ok(r.text.length > 5 && !/Invalid|NaN|undefined/.test(r.text), r.text);
        }
    for (const d of VALID) for (const tm of TIMES.slice(3)) assert.equal(localToUtcPreview(d, tm, "Europe/Istanbul").ok, false, `${d} saat ${tm}`);
    for (const d of VALID) for (const tz of ZONES.slice(5)) assert.equal(localToUtcPreview(d, "12:00", tz).ok, false, `${d} bölge ${tz}`);
    for (const d of [...PARTIAL, ...INVALID, ...VALID])
      for (const tz of ZONES) {
        middayUtcOf(d, tz);
        addDaysIso(d, 89);
        daysBetweenIso("2026-10-01", d);
        daysBetweenIso(d, "2026-12-29");
      }
    // Takvim yardımcıları aralık denetlemez ("0002-10-17" takvimsel olarak geçerli bir gündür; aralık = dateInputIssue +
    // seçim kapısı) — burada kural: istisna YOK, boş / takvimsel geçersiz gün → null.
    for (const d of ["", ...CAL_BAD]) {
      assert.equal(middayUtcOf(d, "Europe/Istanbul"), null, d);
      assert.equal(addDaysIso(d, 1), null, d);
      assert.equal(daysBetweenIso("2026-10-01", d), null, d);
    }
    assert.equal(formatInZone("not-a-date", "Europe/Istanbul"), null);
  });
  await t("D5 yıl rakam rakam yazma dizisi (gün → ay → yıl; silme; temizleme): ara değerler uyarı, tamamlanınca doğru UTC; sunucu ile aynı karar", () => {
    const seq = ["2026-10-17", "", "0002-10-17", "0020-10-17", "0202-10-17", "2026-10-17", "0202-10-17", "0020-10-17", "", "2025-10-17", "2028-02-29"];
    for (const d of seq) {
      for (const [tm, tz] of [["12:00", "Europe/Istanbul"], ["23:30", "America/New_York"], ["00:10", "Pacific/Kiritimati"]] as const) {
        const c = localToUtcPreview(d, tm, tz);
        const srv = normalizeTransitMoment({ date: d, time: tm, timezone: tz }, NOW);
        const y = srv ? Number(srv.slice(0, 4)) : 0;
        if (srv === null || y < 1600 || y > 2600) assert.equal(c.ok, false, `${d} ${tm} ${tz}: istemci kabul etmemeli`);
        else assert.equal(c.text, `Hesaplanacak an: ${srv.slice(8, 10)}.${srv.slice(5, 7)}.${srv.slice(0, 4)} ${srv.slice(11, 16)} UTC`, `${d} ${tm} ${tz}`);
      }
    }
    assert.equal(localToUtcPreview("2026-10-17", "12:00", "Europe/Istanbul").text, "Hesaplanacak an: 17.10.2026 09:00 UTC");
    assert.equal(localToUtcPreview("2028-02-29", "12:00", "Europe/Istanbul").text, "Hesaplanacak an: 29.02.2028 09:00 UTC");
    assert.equal(localToUtcPreview("2026-10-17", "02:30", "Europe/Istanbul").ok, true);
    assert.match(localToUtcPreview("2026-03-29", "02:30", "Europe/Berlin").text, /yaz saati/);
    assert.match(dateInputIssue("")!, /eksik/);
    assert.match(dateInputIssue("0202-10-17")!, /1600–2600/);
    assert.match(dateInputIssue("2026-02-29")!, /geçersiz/);
    assert.equal(dateInputIssue("2028-02-29"), null);
    assert.match(timeInputIssue("")!, /eksik/);
    assert.equal(timeInputIssue("23:59"), null);
    assert.ok(timeInputIssue("24:00"));
  });
  await t("D6 eksik / geçersiz tarihli teknik plana ve API'ye GİRMEZ (buildSelections), nedeni gösterilir; tamamlanınca normal seçim; 'Şimdi' kipi tarihten etkilenmez", () => {
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    const base = defaultParams(new Date("2026-10-17T09:00:00Z"));
    const sel = (p: typeof base, ids: string[]) => buildSelections(Object.fromEntries(ids.map((i) => [i, true])), p, method).map((s) => s.technique);
    for (const mode of ["date", "custom"] as const)
      for (const d of [...PARTIAL, ...INVALID]) {
        const p = { ...base, transitMode: mode, transitDate: d };
        assert.deepEqual(sel(p, ["western.natal", "western.transit"]), ["western.natal"], `${mode} ${d}`);
        assert.equal(missingReason("western.transit", p), "transit tarihini / saatini tamamlayın");
      }
    assert.deepEqual(sel({ ...base, transitMode: "custom", transitDate: "2026-10-17", transitTime: "" }, ["western.transit"]), [], "saat eksik");
    assert.deepEqual(sel({ ...base, transitMode: "date", transitDate: "2026-10-17", transitTime: "" }, ["western.transit"]), ["western.transit"], "seçilen gün kipinde saat kullanılmaz");
    assert.deepEqual(sel({ ...base, transitMode: "now", transitDate: "0002-10-17" }, ["western.transit"]), ["western.transit"], "şimdi kipi");
    const ok = buildSelections({ "western.transit": true }, { ...base, transitMode: "custom", transitDate: "2026-10-17", transitTime: "12:00" }, method);
    assert.deepEqual(ok[0].options, { date: "2026-10-17", time: "12:00", timezone: "Europe/Istanbul", nodeType: "true" });
    for (const d of [...PARTIAL, ...INVALID]) {
      assert.deepEqual(sel({ ...base, forecastStart: d }, ["western.forecast"]), [], `takvim ${d}`);
      assert.ok(dateInputReason("western.forecast", { ...base, forecastStart: d }));
      assert.deepEqual(sel({ ...base, targetDate: d }, ["western.progression", "western.solar_arc"]), []);
      assert.deepEqual(sel({ ...base, vedicTransitMode: "custom", vedicTransitDate: d }, ["vedic.transit"]), []);
      assert.deepEqual(sel({ ...base, kpMomentMode: "custom", kpDate: d }, ["kp.transit"]), []);
    }
    // Biçim geçerli ama an geçersiz (ön izleme reddeder) → seçime girmez: yaz saati boşluğu, UTC'de 1600–2600 dışı.
    for (const [d, tm, tz] of [["2026-03-08", "02:30", "America/New_York"], ["2026-03-29", "02:30", "Europe/Berlin"], ["2600-12-31", "23:30", "America/New_York"], ["1600-01-01", "00:30", "Asia/Tokyo"]] as const) {
      const p = { ...base, transitMode: "custom" as const, transitDate: d, transitTime: tm, transitTz: tz };
      assert.equal(localToUtcPreview(d, tm, tz).ok, false, `${d} ${tm} ${tz} ön izleme`);
      assert.deepEqual(sel(p, ["western.natal", "western.transit"]), ["western.natal"], `${d} ${tm} ${tz} plana girmemeli`);
      assert.equal(missingReason("western.transit", p), "transit anı geçersiz (ön izlemeye bakın)");
    }
    assert.deepEqual(sel({ ...base, transitMode: "custom", transitDate: "2026-03-08", transitTime: "03:30", transitTz: "America/New_York" }, ["western.transit"]), ["western.transit"], "geçerli saate dönüş");
    // Eşdeğerlik: seçime girme kararı = sunucu kabulü (normalizeTransitMoment + UTC yıl 1600–2600) — geçerli girişlerde davranış değişmez.
    for (const d of ["2026-03-08", "2026-03-29", "2026-11-01", "2026-10-25", "1600-01-01", "2600-12-31", "1979-02-12", "2028-02-29"])
      for (const tm of ["00:30", "01:30", "02:30", "03:30", "12:00", "23:30"])
        for (const tz of ["America/New_York", "Europe/Berlin", "Europe/Istanbul", "Asia/Tokyo", "Pacific/Kiritimati", "Australia/Lord_Howe"]) {
          const srv = normalizeTransitMoment({ date: d, time: tm, timezone: tz }, NOW);
          const y = srv ? Number(srv.slice(0, 4)) : 0;
          const accepted = srv !== null && y >= 1600 && y <= 2600;
          const included = sel({ ...base, transitMode: "custom", transitDate: d, transitTime: tm, transitTz: tz }, ["western.transit"]).length === 1;
          assert.equal(included, accepted, `${d} ${tm} ${tz}: seçim ${included} ≠ sunucu ${accepted}`);
        }
    // Varsayılan (bugün) değerlerle tüm tarihli teknikler seçime girer — mevcut davranış korunur.
    for (const id of ["western.transit", "western.forecast", "western.progression", "western.solar_arc", "vedic.transit", "kp.transit"]) assert.deepEqual(sel(base, [id]), [id], id);
  });
  await t("D7 kapsamlı tarama: 1–4 haneli yıl önekleri × 12 ay × 4 gün × 5 bölge — istisna yok, yalnız 1600–2600 geçerli tarih kabul", () => {
    let n = 0;
    for (const yy of ["0", "00", "000", "0002", "0020", "0202", "1", "19", "197", "0019", "0197", "1979", "2", "20", "202", "2026", "2600", "2601", "1599", "9999"]) {
      const y = yy.padStart(4, "0");
      for (let m = 1; m <= 12; m++)
        for (const dd of ["01", "15", "29", "31"])
          for (const tz of ["Europe/Istanbul", "UTC", "America/New_York", "Asia/Kathmandu", "Pacific/Apia"]) {
            const d = `${y}-${String(m).padStart(2, "0")}-${dd}`;
            const r = localToUtcPreview(d, "12:00", tz);
            const yn = Number(y);
            if (r.ok) assert.ok(yn >= 1600 && yn <= 2600 && dateInputIssue(d) === null, d);
            else assert.ok(!/Invalid|NaN/.test(r.text));
            n++;
          }
    }
    assert.ok(n > 4000);
  });
  await t("D3 gün gruplaması saat dilimine göre: 21:30 UTC olayı İstanbul'da ertesi güne düşer", () => {
    const g = groupEventsByDay([{ datetime: "2026-10-01T21:30:00Z" }, { datetime: "2026-10-01T10:00:00Z" }], "Europe/Istanbul");
    assert.deepEqual(g.map(([d, l]) => [d, l.length]), [["2026-10-02", 1], ["2026-10-01", 1]]);
    const u = groupEventsByDay([{ datetime: "2026-10-01T21:30:00Z" }], "UTC");
    assert.equal(u[0][0], "2026-10-01");
  });

  // ═══ E) Bağımsız astronomi: takvim kesinleşme anları ═══════════════════════════
  await t("E1 golden takvimin gezegen→natal kesinleşmeleri astronomy-engine ile ≤ 0,02° ve o anda yerel en küçük sapma", () => {
    const lon = (b: Astronomy.Body, d: Date) => Astronomy.Ecliptic(Astronomy.GeoVector(b, Astronomy.MakeTime(d), true)).elon;
    const B: Record<string, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars, jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn, uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune, pluto: Astronomy.Body.Pluto };
    const ANG: Record<string, number> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
    const birth = new Date("1990-07-15T11:30:00Z");
    const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    let checked = 0;
    let worst = 0;
    for (const e of fcTech.events) {
      if (e.type !== "transit_aspect" || !e.body || !e.targetBody || !e.aspect || !B[e.body] || !B[e.targetBody]) continue;
      const natal = lon(B[e.targetBody], birth);
      const at = new Date(e.datetime);
      const err = (d: Date) => Math.abs(sep(lon(B[e.body!], d), natal) - ANG[e.aspect!]);
      const e0 = err(at);
      worst = Math.max(worst, e0);
      assert.ok(e0 <= 0.02, `${e.body} ${e.aspect} natal ${e.targetBody} @ ${e.datetime}: sapma ${e0.toFixed(4)}°`);
      const step = e.body === "moon" ? 10 * 60_000 : 6 * 3600_000;
      assert.ok(e0 <= err(new Date(at.getTime() - step)) + 1e-6 && e0 <= err(new Date(at.getTime() + step)) + 1e-6, `${e.body}→${e.targetBody}: yerel en küçük değil`);
      checked += 1;
    }
    assert.ok(checked >= 20, `yalnız ${checked} olay denetlendi`);
    console.log(`     (denetlenen kesinleşme: ${checked}, en büyük sapma ${worst.toFixed(4)}°)`);
  });

  // ═══ F) Yardımcılar ═════════════════════════════════════════════════════════
  await t("F1 natal ev: 360° sarması, cusp sınırı, 12 cusp yoksa null; transit gezegen evleri natal çerçeveden", () => {
    const hs = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, longitude: (350 + i * 30) % 360 }));
    assert.equal(natalHouseOf(355, hs), 1);
    assert.equal(natalHouseOf(5, hs), 1);
    assert.equal(natalHouseOf(20, hs), 2);
    assert.equal(natalHouseOf(349.99, hs), 12);
    assert.equal(natalHouseOf(10, hs.slice(0, 11)), null);
    const natal = (getTechnique("western.natal")!.project(null as never, NATAL_GOLDEN, { houseSystem: "placidus", nodeType: "true" }) as J).technical;
    const withFrame = TR.attachContext!(trTech, [natal, null, null, null], { atUtc: "2026-10-07T09:00", nodeType: "true" }) as TransitTechnical;
    const m = transitNatalHouses(withFrame);
    assert.equal(m.size, withFrame.bodies.length);
    for (const v of m.values()) assert.ok(v >= 1 && v <= 12);
    assert.equal(transitNatalHouses({ ...withFrame, natalFrame: null }).size, 0);
  });
  await t("F2 en güçlü: sağlayıcı gücüne göre azalan, eşitlikte dar orb; açı türü sayımı toplamı = açı sayısı", () => {
    const top = strongestTransits(trTech.aspects, 5);
    for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].strength > top[i].strength || (top[i - 1].strength === top[i].strength && top[i - 1].orb <= top[i].orb));
    assert.equal(aspectTypeCounts(trTech.aspects).reduce((n, [, c]) => n + c, 0), trTech.aspects.length);
    assert.deepEqual(exactTimesOf(null, trTech.aspects[0]), []);
  });
  await t("F3 golden forecast parçalama korunur: 366 gün = 5 parça, sınırlar 90 gün", () => {
    const c = forecastChunks("2026-10-01", 366);
    assert.equal(c.length, 5);
    assert.equal(c[0].end, "2026-12-29");
  });

  console.log(`\nastrology transit01 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
