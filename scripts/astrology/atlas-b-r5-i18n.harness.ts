/**
 * I18N-F1-R5 (ATLAS-B) — Atlas kalan ekranlar (ikinci dalga) çeviri kilitleri. Ağ / DB / sağlayıcı YOK.
 *
 *   [T] `_lib/techniques.ts` (teknik adları, ipuçları, seçenek özetleri, eksik alan nedenleri): kanonik kimlikler ve TR lib
 *       tabloları DEĞİŞMEZ (Word/PDF + sunucu planı aynı kaynağı okur). TR çıktı çeviri ÖNCESİ kodla üretilen tabanla birebir;
 *       EN çıktı Türkçe harfsiz.
 *   [S] TechniqueSelector (TechniqueParamFields / MethodFields / PartnerField): her UI tekniği × parametre varyantı.
 *   [P] PrepCenter (Yeni Analiz hazırlık merkezi): danışan yok / var, seçimli, plan, hata, çalıştırma başarısız durumları.
 *   [R] PlanetaryReturnPanel (4 gerçek golden × konum varyantı).
 *   [L] NatalLabelDetails (grup alanı + ayrıntı paneli) ve NatalWheelLabeled (etiketli çark SVG).
 *   TR: SSR HTML (`<!-- -->` metin ayırıcıları hariç) sha256'sı tabanla aynı. Taban YALNIZ çeviri öncesi kodla:
 *     npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-b-r5-i18n.harness.ts --write-golden
 *   EN: görünen metin + öznitelikte Türkçe harf yok, ham katalog anahtarı yok, derece değerleri TR ile aynı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-b-r5-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import Module from "node:module";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "./intlRender";

// next/font (Atlas premium yazı tipleri) Node'da çalışmaz → yalnız test için sınıf adı döndüren sahte modül. Ürün etkilenmez.
const ML = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown };
const origLoad = ML._load;
const fontStub = () => ({ className: "font-stub", variable: "--font-stub", style: { fontFamily: "stub" } });
ML._load = (req, parent, isMain) => (/^next\/font\/(local|google)$/.test(req) ? Object.assign(fontStub, { default: fontStub }) : origLoad(req, parent, isMain));
// Saat dilimi listesi Node sürümüne bağlı → taban CI / yerel aynı olsun diye sabit liste (yalnız test).
(Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf = () => ["Africa/Cairo", "America/New_York", "Asia/Kolkata", "Asia/Tokyo", "Europe/Istanbul", "Europe/Paris", "UTC"];
process.env.TZ = "Europe/Istanbul";

const ROOT = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");
const GOLD = join(FIX, "i18n", "atlas-b-r5-tr-taban.json");
const WRITE = process.argv.includes("--write-golden");
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message.split("\n").slice(0, 8).join("\n       ")}`);
  }
}
const strip = (h: string) => h.replace(/<!-- -->/g, "");
const sha = (h: string) => createHash("sha256").update(strip(h), "utf8").digest("hex");
const visible = (h: string) => strip(h).replace(/<title>([\s\S]*?)<\/title>/g, " $1 ").replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const attrs = (h: string) => [...h.matchAll(/(?:title|aria-label|placeholder|alt|label)="([^"]*)"/g)].map((m) => m[1]).join(" | ");
const degs = (h: string) => (visible(h).match(/\d+°\s?\d{2}′/g) ?? []).join(" ");

async function main() {
  const T = await import("@/app/admin/astroloji/_lib/techniques");
  const { TechniqueParamFields, MethodFields, PartnerField, USES_HOUSE_SYSTEM, USES_NODE_TYPE } = await import("@/app/admin/astroloji/_components/TechniqueSelector");
  const { default: PrepCenter } = await import("@/app/admin/astroloji/_components/atlas/PrepCenter");
  const { PlanetaryReturnPanel } = await import("@/app/admin/astroloji/_components/PlanetaryReturnPanel");
  const { NatalGroupDetails, NatalLabelSheet } = await import("@/app/admin/astroloji/_components/NatalLabelDetails");
  const { default: NatalWheel } = await import("@/app/admin/astroloji/_components/NatalWheel");
  const { natalWheelDisplay } = await import("@/app/admin/astroloji/_components/NatalChartControls");
  const { projectRoxyNatal } = await import("@/lib/astrology/providers/roxy/natal");
  const { projectRoxyPlanetaryReturn } = await import("@/lib/astrology/providers/roxy/planetaryReturn");
  const { DEFAULT_PREFS } = await import("@/lib/astrology/view/natalWheelDisplay");

  // ─── Parametre varyantları ────────────────────────────────────────────────────────────────────────────────────
  const today = new Date("2026-10-22T09:00:00Z");
  const base = T.defaultParams(today);
  const V0 = { ...base, partnerProfileId: "p1", kpPlaceMode: "birth" as const, profectionAge: 36, profectionFor: "x" };
  const V1 = {
    ...base,
    transitMode: "custom" as const,
    transitTime: "08:30",
    transitTz: "UTC",
    forecastDays: 200,
    forecastTz: "Asia/Kolkata",
    vedicTransitMode: "custom" as const,
    kpMomentMode: "custom" as const,
    kpTime: "07:15",
    dashaChainMode: "custom" as const,
    dashaChainDate: "2026-10-01",
    dashaChainTime: "10:00",
    dashaChainTz: "Europe/Istanbul",
    dashaMd: "venus",
    dashaAd: "sun",
    dashaPd: "moon",
    kpDashaMd: "saturn",
    kpDashaAd: "mercury",
    panchangaDetail: true,
    panchangaHours: true,
    panchangaDate: "2026-11-03",
    panchangaPlace: { id: "gb-london", label: "Londra" },
    heliacalDate: "2026-11-04",
    heliacalPlace: { id: "gb-london", label: "Londra" },
    kpPlaceMode: "other" as const,
    kpPlace: { id: "gb-london", label: "Londra" },
    kpTransitMode: "range" as const,
    kpRangeKinds: ["sublord", "rasi", "positions"],
    kpRangeDays: 5,
    kpRangePlanets: ["sun", "moon", "mars"],
    kpRiDuration: 180,
    kpRiInterval: 30,
    charaKarakaScheme: "seven" as const,
    gunMilanOrder: "partner_first" as const,
    dashakootOrder: "partner_first" as const,
    papasamyamOrder: "partner_first" as const,
    extraSections: ["asteroids", "lilith"] as J,
    planetaryReturnPlanet: "jupiter" as const,
    planetaryReturnCrossing: 2 as const,
    planetaryReturnLocation: { id: "gb-london", label: "Londra" },
    solarReturnLocation: { id: "gb-london", label: "Londra" },
    lunarReturnLocation: { id: "gb-london", label: "Londra" },
    lunarSequence: 2 as const,
    relocationTarget: { id: "gb-london", label: "Londra" },
    localSpaceReference: { id: "gb-london", label: "Londra" },
    fixedStarsCatalog: true,
    fixedStarsOrb: 2,
    vedicAyanamsa: "raman",
    kpAyanamsa: "kp-old",
    kpNodeType: "true",
    vargaDivision: 10,
    partnerProfileId: "p2",
    profectionAge: 12,
    profectionFor: "x",
    declinationOrb: 1.5,
    scanOrb: 2,
    scanBodies: ["saturn", "jupiter"] as J,
    vedicMonthlySections: ["ingress", "lunar"] as J,
  };
  const V2 = {
    ...base,
    transitMode: "custom" as const,
    transitDate: "0002-10-17",
    transitTime: "",
    forecastStart: "",
    forecastEndDraft: "2026-1",
    targetDate: "",
    vedicTransitMode: "custom" as const,
    vedicTransitDate: "",
    kpMomentMode: "custom" as const,
    kpDate: "",
    dashaChainMode: "custom" as const,
    dashaChainDate: "",
    panchangaDetail: true,
    panchangaDate: "2026-13-01",
    planetaryReturnDate: "0002-10-17",
    declinationMonth: "1500-01",
    heliacalDate: "20-01-01",
    vedicMonthlyYear: 1500,
    kpPlaceMode: "unset" as const,
    kpTransitMode: "range" as const,
    kpRangeStart: "",
    kpRangeKinds: [],
    kpRiDuration: 3000,
    extraSections: [] as J,
    vedicMonthlySections: [] as J,
    scanStart: "2026-10-22",
    scanEnd: "2028-01-01",
  };
  const V3 = { ...base, transitMode: "date" as const, dashaChainMode: "now" as const, panchangaHours: true, kpPlaceMode: "other" as const, kpPlace: null, kpTransitMode: "range" as const, kpRangeKinds: ["positions"], kpRangeDays: 20 };
  const VARIANTS = { V0, V1, V2, V3 } as Record<string, J>;
  const METHODS = [T.DEFAULT_WESTERN_METHOD, { houseSystem: "whole-sign", nodeType: "mean", natalHouseSystem: "koch" } as J];

  // ─── [T] techniques.ts çıktıları ─────────────────────────────────────────────────────────────────────────────
  const allChecked = Object.fromEntries(T.UI_TECHNIQUES.map((id) => [id, true]));
  const partnerLabel = (id: string) => (id === "p1" ? "Sentetik B" : null);
  // L verilmezse lib varsayılanı (kaynak dil); verilirse ekranın next-intl çevirmeni (TR / EN).
  const computeLib = (L?: J) => {
    const libOut: Record<string, string> = {};
    for (const [vn, p] of Object.entries(VARIANTS)) {
      for (const [mi, m] of METHODS.entries()) {
        for (const s of T.buildSelections(allChecked as J, p, m)) {
          libOut[`describe|${vn}|m${mi}|${s.technique}`] = T.describeOptions(s.technique, s.options, undefined, L);
          libOut[`describeP|${vn}|m${mi}|${s.technique}`] = T.describeOptions(s.technique, s.options, partnerLabel, L);
        }
      }
      for (const id of T.UI_TECHNIQUES) {
        libOut[`missing|${vn}|${id}`] = String(T.missingReason(id, p, L));
        libOut[`dateInput|${vn}|${id}`] = String(T.dateInputReason(id, p, L));
      }
      libOut[`kpRangeIssue|${vn}`] = String(T.kpRangeIssue(p, L));
    }
    // Eski kayıt seçenekleri (alan eksik / eski biçim).
    const legacy: [string, Record<string, unknown>][] = [
      ["western.lunar_return", { month: "2026-10" }],
      ["western.lunar_return", { month: "2026-10", sequence: 2, returnLocation: { label: "Londra" }, returnLocationId: "gb-london" }],
      ["western.solar_return", { returnYear: 2026, returnLocationId: null }],
      ["western.transit", { now: true }],
      ["western.transit", { atUtc: "2026-10-22T09:00:00Z", calendar: { startDate: "2026-10-01", days: 30 } }],
      ["vedic.dasha", { chainNow: true }],
      ["vedic.dasha", { md: "venus", ad: "sun", pd: "moon", sd: "mars", chainAtUtc: "2026-10-01T07:00:00Z" }],
      ["kp.dasha", { md: "saturn", ayanamsa: "kp-old", nodeType: "true" }],
      ["kp.horary", { horaryNumber: 249, now: true, ayanamsa: "kp-newcomb" }],
      ["kp.horary", { horaryNumber: 7, atUtc: "2026-10-22T09:00:00Z", place: { label: "Londra", timezone: "Europe/London" } }],
      ["kp.ruling", { now: true, place: { label: "Londra" } }],
      ["vedic.panchanga", { detail: true, hours: false }],
      ["vedic.panchanga", { hours: true }],
      ["vedic.heliacal", {}],
      ["vedic.sade_sati", { asOf: "2026-10-22", ayanamsa: "kp-old" }],
      ["vedic.monthly", { year: 2026, month: 2, sections: ["parallels", "natal_parallels"] }],
      ["vedic.monthly", { year: 2026, month: 13 }],
      ["western.local_space", { referenceLocationId: "gb-london" }],
      ["western.local_space", {}],
      ["western.relocation", { target: { label: "Londra" } }],
      ["western.fixed_stars", { orb: 1.5, reportCatalog: true }],
      ["western.profections", { age: 0 }],
      ["western.profections", { age: 200 }],
      ["western.extra_points", { sections: ["lots"] }],
      ["western.classical_dignities", { school: "ptolemy", houseSystem: "regiomontanus", nodeType: "mean" }],
      ["western.classical_dignities", {}],
      ["western.declination_parallels", { month: "2026-02", orb: 1.5, nodeType: "mean", displayTz: "UTC" }],
      ["western.transit_scan", { start: "2026-01-01", end: "2026-06-30", orb: 1.5, bodies: ["saturn"], points: ["sun"], aspects: ["conjunction"] }],
      ["vedic.chara_karaka", { scheme: "seven" }],
      ["vedic.gun_milan", { partnerProfileId: "p1", partnerRevision: 3, order: "partner_first", ayanamsa: "raman" }],
      ["vedic.dashakoot", { partnerProfileId: "zz", order: "client_first" }],
      ["vedic.papasamyam", { partnerProfileId: "p1" }],
      ["western.synastry", { partnerProfileId: "p1", partnerRevision: 2 }],
      ["vedic.d1", { ayanamsa: "kp-newcomb" }],
      ["vedic.varga", { division: 60, ayanamsa: "lahiri" }],
      ["vedic.transit", { atUtc: "2026-10-22T09:00:00Z", ayanamsa: "lahiri" }],
      ["kp.ruling_interval", { atUtc: "2026-10-22T09:00:00Z", durationMinutes: 120, intervalMinutes: 15, ayanamsa: "kp-newcomb" }],
      ["kp.transit", { range: { startDate: "2026-10-22", days: 3, kinds: ["positions"], planets: [], intervalMinutes: 60 }, ayanamsa: "kp-old" }],
      ["western.planetary_return", { planet: "venus", approxDate: "2026-05-01", crossing: 3, returnLocation: { label: "Londra" }, returnLocationId: "gb-london" }],
      ["western.forecast", { startDate: "2026-10-01", days: 366, displayTz: "UTC" }],
      ["unknown.technique", { a: 1 }],
    ];
    legacy.forEach(([id, o], i) => {
      libOut[`legacy|${i}|${id}`] = T.describeOptions(id, o, partnerLabel, L);
    });
    for (const id of [...T.UI_TECHNIQUES, "unknown.x"]) libOut[`label|${id}`] = T.techniqueLabel(id, L);
    for (const id of T.UI_TECHNIQUES) libOut[`zodiac|${id}`] = T.zodiacLabel(id, L);
    for (const h of ["placidus", "whole_sign", "whole-sign", "koch", null]) libOut[`house|${String(h)}`] = T.houseSystemLabel(h, { placidus: "Placidus", koch: "Koch", "whole-sign": "Bütün burç" }, L);
    return libOut;
  };
  const libOut = computeLib();

  // ─── [S] TechniqueSelector çizim vakaları ────────────────────────────────────────────────────────────────────
  type Case = { name: string; el: () => ReactElement };
  const noop = () => {};
  const selCases: Case[] = [];
  for (const [vn, p] of Object.entries(VARIANTS)) {
    for (const id of T.UI_TECHNIQUES) selCases.push({ name: `params|${vn}|${id}`, el: () => createElement(TechniqueParamFields, { id, params: p, onParams: noop }) });
  }
  const lunarReturns = [{ sequence: 1, approxUtc: "2026-10-03T04:10:00Z" }, { sequence: 2, approxUtc: "2026-10-30T11:20:00Z" }];
  const prs = [{ crossing: 1, of: 3, approxUtc: "2025-12-01T10:00:00Z", motion: "direct" as const }, { crossing: 2, of: 3, approxUtc: "2026-03-10T10:00:00Z", motion: "retrograde" as const }, { crossing: 3, of: 3, approxUtc: "2026-07-20T10:00:00Z", motion: "direct" as const }];
  for (const [vn, p] of [["V0", V0], ["V1", V1]] as const) {
    selCases.push({ name: `params+|${vn}|lunar`, el: () => createElement(TechniqueParamFields, { id: "western.lunar_return", params: p, onParams: noop, lunarReturns, birthPlaceLabel: "İstanbul, Türkiye" }) });
    selCases.push({ name: `params+|${vn}|pr`, el: () => createElement(TechniqueParamFields, { id: "western.planetary_return", params: p, onParams: noop, planetaryReturns: prs, planetaryReturnNeighbors: { previous: "1990-05-01", next: "2037-11-02" } }) });
    selCases.push({ name: `params+|${vn}|prof`, el: () => createElement(TechniqueParamFields, { id: "western.profections", params: p, onParams: noop, birthDate: "1990-07-15" }) });
    selCases.push({ name: `params+|${vn}|prof-leap`, el: () => createElement(TechniqueParamFields, { id: "western.profections", params: p, onParams: noop, birthDate: "1992-02-29" }) });
    for (const id of ["kp.ruling", "kp.horary", "kp.ruling_interval", "vedic.panchanga", "vedic.heliacal"] as const) selCases.push({ name: `params+|${vn}|${id}|birthPlace`, el: () => createElement(TechniqueParamFields, { id, params: p, onParams: noop, birthPlaceLabel: "İstanbul, Türkiye", birthDate: "1990-07-15" }) });
    selCases.push({ name: `params+|${vn}|dignity-koch`, el: () => createElement(TechniqueParamFields, { id: "western.classical_dignities", params: p, onParams: noop, natalHouseSystem: "koch" }) });
  }
  for (const id of T.UI_TECHNIQUES) {
    if (!USES_HOUSE_SYSTEM.includes(id) && !USES_NODE_TYPE.includes(id)) continue;
    METHODS.forEach((m, mi) => selCases.push({ name: `method|m${mi}|${id}`, el: () => createElement(MethodFields, { id, method: m, onMethod: noop }) }));
  }
  const natalCtx: [string, J][] = [
    ["none", undefined],
    ["polar", { latitude: 70.5, timeKnown: true }],
    ["high", { latitude: 62.1, timeKnown: true }],
    ["south", { latitude: -68.2, timeKnown: true }],
    ["tu", { latitude: 70.5, timeKnown: false }],
    ["shared", { latitude: 41, timeKnown: true, sharedTechniques: [{ id: "western.solar_return", label: "Solar return" }, { id: "western.synastry", label: "Sinastri" }], onFocusTechnique: noop }],
  ];
  for (const hs of ["placidus", "koch", "regiomontanus", "whole-sign", "equal", "porphyry", "campanus", "topocentric"]) {
    for (const [cn, ctx] of natalCtx) selCases.push({ name: `natal|${hs}|${cn}`, el: () => createElement(MethodFields, { id: "western.natal", method: { ...T.DEFAULT_WESTERN_METHOD, natalHouseSystem: hs as J }, onMethod: noop, natalContext: ctx }) });
  }
  const partners = [{ id: "p1", label: "Sentetik B" }, { id: "p2", label: "Sentetik C" }];
  selCases.push({ name: "partner|search", el: () => createElement(PartnerField, { params: V0, onParams: noop, partners, partnerQuery: "Sen", onPartnerQuery: noop }) });
  selCases.push({ name: "partner|plain", el: () => createElement(PartnerField, { params: base, onParams: noop, partners: [] }) });

  // ─── [P] PrepCenter vakaları ─────────────────────────────────────────────────────────────────────────────────
  const rev = { birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", timeAccuracyLabel: "Kesin kayıt", locationLabel: "İstanbul, Türkiye", latitude: 41.0082, longitude: 28.9784, timezone: "Europe/Istanbul", utcOffsetSeconds: 10800 };
  const revTu = { ...rev, birthTime: null, timeKnown: false, timeAccuracy: "unknown", timeAccuracyLabel: "Bilinmiyor", staleTimezone: { storedOffsetSeconds: 7200, currentOffsetSeconds: 10800, text: "Saklı ofset güncel tablodan farklı" }, lmtNotice: { storedOffsetSeconds: 7200, localMeanOffsetSeconds: 6955, text: "Yerel ortalama saat notu" } };
  const revOld = { ...rev, birthDate: "1890-03-01", latitude: 69.6, locationLabel: "Tromsø, Norveç", timezone: "Europe/Oslo", utcOffsetSeconds: 3600 };
  const profile = { id: "pr1", label: "Sentetik A", clientName: "Sentetik A", archivedAt: null };
  const checkedSome = { "western.natal": true, "western.transit": true, "western.synastry": true, "vedic.d1": true, "kp.horary": true, "western.planetary_return": true } as J;
  const selections = T.buildSelections(checkedSome, V0, T.DEFAULT_WESTERN_METHOD);
  const planSel = (s: { technique: string; options: Record<string, unknown> }, i: number) => ({ technique: s.technique, options: s.options, unitCount: 1 + (i % 2), newRequests: i % 3 === 0 ? 1 : 0, blocked: i === 2 ? { code: "PARTNER_REQUIRED", error: "Karşı taraf seçilmedi" } : null, info: i === 1 ? { skippedSections: [{ section: "lots", label: "Hermetik lotlar", reason: "doğum saati bilinmiyor" }] } : null });
  const plan = { selectedCount: selections.length, blockedCount: 1, newRequestCount: 2, cachedCount: 1, coveredCount: 1, dedupedCount: 1, requiresConfirmation: true, selections: selections.map(planSel) };
  const planOk = { ...plan, blockedCount: 0, requiresConfirmation: false, newRequestCount: 0, selections: selections.map((s, i) => ({ ...planSel(s, i), blocked: null })) };
  const prepBase = {
    profile: null,
    rev: null,
    picker: createElement("div", { "data-testid": "picker-stub" }),
    onCreateClient: noop,
    onEditBirth: null,
    onDeleteProfile: null,
    checked: {},
    onChecked: noop,
    params: V0,
    onParams: noop,
    method: T.DEFAULT_WESTERN_METHOD,
    onMethod: noop,
    partners,
    partnerQuery: "",
    onPartnerQuery: noop,
    lunarReturns: null,
    selections: [],
    plan: null,
    planError: null,
    running: false,
    runError: null,
    runFailures: null,
    onDismissFailures: noop,
    onRun: noop,
    labelOf: (id: string) => (id === "p1" ? "Sentetik B" : null),
  } as J;
  const prepCases: Case[] = [
    { name: "prep|bos", el: () => createElement(PrepCenter, prepBase) },
    { name: "prep|danisan", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, onEditBirth: noop, onDeleteProfile: noop }) },
    { name: "prep|saatsiz-uyari", el: () => createElement(PrepCenter, { ...prepBase, profile: { ...profile, archivedAt: "2026-10-01T00:00:00Z" }, rev: revTu, onEditBirth: noop }) },
    { name: "prep|eski-kutup", el: () => createElement(PrepCenter, { ...prepBase, profile, rev: revOld, checked: { "western.natal": true }, selections: T.buildSelections({ "western.natal": true }, V0, T.DEFAULT_WESTERN_METHOD) }) },
    { name: "prep|secimli-plan", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, checked: checkedSome, selections, plan, onOpenHorary: noop }) },
    { name: "prep|plan-ok", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, checked: checkedSome, selections, plan: planOk, planetaryReturns: prs, planetaryReturnNeighbors: { previous: null, next: "2037-11-02" } }) },
    { name: "prep|calisiyor", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, checked: checkedSome, selections, plan: planOk, running: true }) },
    { name: "prep|hata", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, checked: checkedSome, selections, planError: "Plan alınamadı", runError: "Çalıştırma başarısız" }) },
    {
      name: "prep|basarisiz",
      el: () =>
        createElement(PrepCenter, {
          ...prepBase,
          profile,
          rev,
          checked: checkedSome,
          selections,
          plan: planOk,
          runFailures: { at: 1, items: [{ technique: "western.natal", code: "RATE_LIMITED", error: "Çok fazla istek", retryAfterSec: 30 }, { technique: "vedic.d1", code: "PROVIDER_UNAVAILABLE", error: "Sağlayıcı yanıt vermedi" }, { technique: "kp.horary", code: "TIME_REQUIRED", error: "Doğum saati gerekli" }, { technique: "western.synastry", code: "X", error: "Bilinmeyen" }] },
        }),
    },
    { name: "prep|izinli", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, allowedTechniques: new Set(["western.natal", "vedic.d1", "kp.chart"]) }) },
    { name: "prep|tumu-secili", el: () => createElement(PrepCenter, { ...prepBase, profile, rev, checked: allChecked, selections: T.buildSelections(allChecked as J, V0, T.DEFAULT_WESTERN_METHOD) }) },
  ];

  // ─── [R] PlanetaryReturnPanel ────────────────────────────────────────────────────────────────────────────────
  const GDIR = join(FIX, "golden");
  const prTech: Record<string, J> = {};
  for (const name of ["pr-saturn-next", "pr-jupiter-retro", "pr-mars-london", "pr-mercury-ws"]) {
    const g = JSON.parse(readFileSync(join(GDIR, `${name}.json`), "utf8")) as J;
    const pick = g.selection.cluster.find((c: J) => c.crossing === g.selection.crossing);
    const r = projectRoxyPlanetaryReturn(structuredClone(g.response), {
      planet: String(g.body.planet).toLowerCase() as J,
      houseSystem: g.body.houseSystem,
      birthDate: String(g.body.birthDate),
      approximateDate: String(g.body.approximateDate),
      crossing: pick.crossing,
      of: pick.of,
      motion: pick.motion,
      expectedUtc: pick.approxUtc,
      toleranceMinutes: pick.toleranceMinutes,
      location: { latitude: Number(g.body.latitude), longitude: Number(g.body.longitude) },
      natalLongitude: g.selection.natalLongitude,
    }) as J;
    assert.ok(r.ok, `${name} projeksiyon`);
    prTech[name] = r.technical;
  }
  const places: [string, J][] = [
    ["yok", null],
    ["dogum", { locationId: null, label: "İstanbul, Türkiye", latitude: 41.0082, longitude: 28.9784, timezone: "Europe/Istanbul" }],
    ["londra", { locationId: "gb-london", label: "Londra", latitude: 51.5, longitude: -0.12, timezone: "Europe/London" }],
    ["tzsiz", { locationId: "x", label: "", latitude: -33.9, longitude: 18.4, timezone: null }],
  ];
  const prCases: Case[] = [];
  for (const [n, tech] of Object.entries(prTech)) for (const [pn, pl] of places) prCases.push({ name: `pr|${n}|${pn}`, el: () => createElement(PlanetaryReturnPanel, { t: tech, place: pl, showWheel: pn !== "tzsiz" }) });

  // ─── [L] NatalLabelDetails + NatalWheelLabeled ───────────────────────────────────────────────────────────────
  const natalRaw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8")) as J;
  const natalProj = projectRoxyNatal(natalRaw.response ?? natalRaw, { houseSystem: "placidus", nodeType: "true" } as J) as J;
  const cumra = JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as J;
  const natalCases = (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: J }[]).slice(0, 6);
  const natals: { id: string; t: J }[] = [{ id: "golden", t: natalProj.value.technical }, { id: "cumra", t: cumra }, ...natalCases.map((c) => ({ id: c.id, t: c.technical }))];
  const ALLP = { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true };
  const prefs = (mode: "basic" | "pro", labels: "auto" | "simple" | "detailed") => ({ ...DEFAULT_PREFS, mode, labels, points: { basic: { ...ALLP }, pro: { ...ALLP } } }) as J;
  const labCases: Case[] = [];
  for (const n of natals) {
    for (const tu of [false, true]) {
      for (const [mode, lab] of [["pro", "detailed"], ["basic", "simple"], ["pro", "auto"]] as const) {
        const d = natalWheelDisplay(n.t, prefs(mode, lab), { timeUnknown: tu }) as J;
        labCases.push({ name: `wheel|${n.id}|${tu ? "tu" : "t"}|${mode}-${lab}`, el: () => createElement(NatalWheel, { technical: n.t, tinted: true, display: d }) });
        labCases.push({ name: `group|${n.id}|${tu ? "tu" : "t"}|${mode}-${lab}`, el: () => createElement(NatalGroupDetails, { technical: n.t, display: d }) });
        labCases.push({ name: `group-collapsed|${n.id}|${tu ? "tu" : "t"}|${mode}-${lab}`, el: () => createElement(NatalGroupDetails, { technical: n.t, display: d, collapsed: true }) });
      }
      const sign = n.t.bodies[0].sign;
      const picks: J[] = [
        { kind: "body", id: "sun" },
        { kind: "body", id: "moon" },
        { kind: "body", id: "mercury" },
        { kind: "point", id: "vertex" },
        { kind: "point", id: "fortune" },
        { kind: "cusp", n: 1 },
        { kind: "cusp", n: 7 },
        { kind: "angle", id: "ASC" },
        { kind: "angle", id: "DSC" },
        { kind: "angle", id: "MC" },
        { kind: "angle", id: "IC" },
        { kind: "group", sign, ids: n.t.bodies.filter((b: J) => b.sign === sign).map((b: J) => b.id) },
      ];
      picks.forEach((pk, i) => labCases.push({ name: `sheet|${n.id}|${tu ? "tu" : "t"}|${i}`, el: () => createElement(NatalLabelSheet, { technical: n.t, pick: pk, timeUnknown: tu, onClose: noop, onShowAll: i % 2 ? noop : undefined }) }));
    }
  }

  const renderCases: Case[] = [...selCases, ...prepCases, ...prCases, ...labCases];

  if (WRITE) {
    const cases: Record<string, string> = {};
    for (const c of renderCases) cases[c.name] = sha(renderToStaticMarkup(c.el(), "tr"));
    writeFileSync(GOLD, JSON.stringify({ source: "atlas-b-r5-i18n --write-golden — çeviri ÖNCESİ kod (work/i18n-mod-g-atlas d1e6db7ea); render = sha256(SSR HTML, ayırıcılar hariç); lib = düz TR metin", lib: libOut, cases }, null, 0) + "\n");
    console.log(`taban yazıldı: ${Object.keys(libOut).length} lib çıktısı, ${Object.keys(cases).length} çizim vakası`);
    return;
  }
  assert.ok(existsSync(GOLD), "taban yok");
  const gold = JSON.parse(readFileSync(GOLD, "utf8")) as { lib: Record<string, string>; cases: Record<string, string> };
  const scope = (process.env.ATLAS_B_SCOPE ?? "P,R,L").split(",");

  const { createTranslator: ct } = await import("next-intl");
  const { getCatalogMessages: gcm } = await import("@/lib/i18n/catalog");
  const createTranslatorFor = (locale: "tr" | "en") => ct({ locale, messages: gcm(locale) as Record<string, never>, namespace: "atlas.techniques" as never }) as unknown as J;
  console.log("\n[T] techniques.ts: TR çıktı çeviri öncesiyle birebir");
  t(`${Object.keys(libOut).length} lib çıktısı (özet / eksik neden / tarih nedeni / etiket) TR = taban`, () => {
    assert.deepEqual(Object.keys(libOut).sort(), Object.keys(gold.lib).sort(), "vaka seti");
    const bad = Object.keys(libOut).filter((k) => libOut[k] !== gold.lib[k]);
    assert.deepEqual(bad.slice(0, 10).map((k) => `${k}: «${libOut[k]}» ≠ «${gold.lib[k]}»`), []);
  });

  t("ekran yolu: next-intl TR çevirmeniyle (ICU) aynı 1.087 çıktı tabanla birebir (UI = lib varsayılanı)", () => {
    const L = createTranslatorFor("tr");
    const out = computeLib(L);
    const bad = Object.keys(out).filter((k) => out[k] !== gold.lib[k]);
    assert.deepEqual(bad.slice(0, 10).map((k) => `${k}: «${out[k]}» ≠ «${gold.lib[k]}»`), []);
  });
  t("EN: aynı 1.087 çıktı Türkçe harfsiz, ham anahtar yok (kullanıcı verisi hariç); tarih GG/AA/YYYY", () => {
    const out = computeLib(createTranslatorFor("en"));
    const probs = Object.entries(out)
      .filter(([k]) => !k.startsWith("house|"))
      .map(([k, v]) => [k, v.replace(/Londra|Sentetik B|Bütün burç|Europe\/Istanbul|Asia\/Kolkata/g, "")] as const)
      .filter(([, v]) => /[çğıöşüÇĞİÖŞÜ]/.test(v) || /\b(meta|d|reason)\.[a-z]/.test(v) || /\b\d{2}\.\d{2}\.\d{4}\b/.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(probs.slice(0, 10), [], `${probs.length} çıktı`);
  });
  console.log("\n[K] Word/PDF ile paylaşılan lib metinleri = TR katalog (tek anlam kaynağı)");
  const { createTranslator } = await import("next-intl");
  const { getCatalogMessages } = await import("@/lib/i18n/catalog");
  const PRm = await import("@/lib/astrology/model/westernPlanetaryReturn");
  const LLm = await import("@/lib/astrology/view/natalLabelLayout");
  const PVm = await import("@/lib/astrology/view/natalPositionView");
  const TDm = await import("@/lib/astrology/transitDetail");
  type Tr = (key: string, values?: Record<string, string | number>) => string;
  const tr = (ns: string): Tr => createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as Record<string, never>, namespace: ns as never }) as unknown as Tr;
  t("atlas.planetaryReturn: başlık / gezegen / aralık / yöntem / döngü notu / hareket = lib (westernPlanetaryReturn)", () => {
    const PR = PRm;
    const p = tr("atlas.planetaryReturn");
    for (const k of Object.keys(PR.PLANETARY_RETURN_LABELS) as (keyof typeof PR.PLANETARY_RETURN_LABELS)[]) {
      assert.equal(p(`title.${k}`), PR.PLANETARY_RETURN_LABELS[k].title);
      assert.equal(p(`planet.${k}`), PR.PLANETARY_RETURN_LABELS[k].planet);
      assert.equal(p(`interval.${k}`), PR.PLANETARY_RETURN_TYPICAL_INTERVAL[k]);
    }
    assert.equal(p("methodText"), PR.PLANETARY_RETURN_METHOD_TEXT);
    assert.equal(p("cycleNote"), PR.PLANETARY_RETURN_CYCLE_NOTE);
    assert.equal(p("motion.direct"), PR.motionLabel("direct"));
    assert.equal(p("motion.retrograde"), PR.motionLabel("retrograde"));
  });
  t("atlas.natalLabels: 12:00 / Ay belirsiz / saat bilinmiyor notu / özel nokta adları = lib (natalLabelLayout, natalPositionView)", () => {
    const LL = LLm;
    const PV = PVm;
    const n = tr("atlas.natalLabels");
    assert.equal(n("noonAssumption"), LL.NOON_ASSUMPTION);
    assert.equal(n("moonUnknownText"), LL.MOON_UNKNOWN_TEXT);
    assert.equal(n("timeUnknownNote"), LL.TIME_UNKNOWN_ASSUMED_NOTE);
    const tech = natals[0].t;
    assert.equal(n("point.fortune"), PV.positionRow(tech, "x:fortune", false)!.name);
    assert.equal(n("point.vertex"), PV.positionRow(tech, "x:vertex", false)!.name);
  });

  t("atlas.techniqueSelector.lib: tarih/saat giriş uyarıları = lib transitDetail çıktıları (ekran eşlemesi tek kaynaktan)", () => {
    const TD = TDm;
    const l = tr("atlas.techniqueSelector.lib");
    assert.equal(TD.dateInputIssue(""), l("dateMissing"));
    assert.equal(TD.dateInputIssue("2026-02-30"), l("dateInvalid"));
    assert.equal(TD.dateInputIssue("1500-01-01"), l("dateRangeYear", { min: TD.ATLAS_YEAR_MIN, max: TD.ATLAS_YEAR_MAX }));
    assert.equal(TD.timeInputIssue(""), l("timeMissing"));
    assert.equal(TD.timeInputIssue("25:99"), l("timeInvalid"));
    assert.equal(TD.localToUtcPreview("2026-10-22", "12:00", "Mars/Olympus").text, l("tzInvalid"));
    assert.equal(TD.localToUtcPreview("2026-03-29", "02:30", "Europe/Berlin").text, l("timeGap"));
    assert.equal(TD.localToUtcPreview("2026-10-22", "12:00", "Europe/Istanbul").text, l("preview", { date: "22.10.2026", time: "09:00" }));
  });

  const groups: [string, string, Case[]][] = [
    ["S", "TechniqueSelector", selCases],
    ["P", "PrepCenter", prepCases],
    ["R", "PlanetaryReturnPanel", prCases],
    ["L", "NatalLabelDetails + NatalWheelLabeled", labCases],
  ];
  for (const [code, title, cs] of groups) {
    console.log(`\n[${code}] ${title}`);
    t(`TR çizim çeviri öncesiyle aynı (${cs.length} vaka)`, () => {
      const bad = cs.filter((c) => sha(renderToStaticMarkup(c.el(), "tr")) !== gold.cases[c.name]).map((c) => c.name);
      if (bad.length && process.env.ATLAS_B_DEBUG) writeFileSync(join(process.env.ATLAS_B_DEBUG, `${code}.html`), bad.slice(0, 3).map((n) => `${n}\n${strip(renderToStaticMarkup(cs.find((c) => c.name === n)!.el(), "tr"))}`).join("\n\n"));
      assert.deepEqual(bad.slice(0, 12), [], `${bad.length} vaka farklı`);
    });
    if (!scope.includes(code)) continue;
    t(`EN: metin + öznitelik Türkçe harfsiz; ham anahtar yok; derece değerleri TR = EN (${cs.length} vaka)`, () => {
      const probs: string[] = [];
      for (const c of cs) {
        const tr = renderToStaticMarkup(c.el(), "tr");
        const h = renderToStaticMarkup(c.el(), "en");
        // Kullanıcı / sentetik veri (danışan adı, konum etiketi, sentetik hata metni) dil dışı: çıkarılır.
        const clean = (s: string) => s.replace(/İstanbul, Türkiye|Tromsø, Norveç|Sentetik [A-C]|Karşı taraf seçilmedi|Plan alınamadı|Çalıştırma başarısız|Çok fazla istek|Sağlayıcı yanıt vermedi|Doğum saati gerekli|Saklı ofset güncel tablodan farklı|Yerel ortalama saat notu|Kesin kayıt|Bilinmiyor|Hermetik lotlar|doğum saati bilinmiyor/g, "");
        const v = clean(visible(h));
        const a = clean(attrs(h));
        if (TR_LETTERS.test(v)) probs.push(`${c.name}: ${v.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 5).join(" | ")}`);
        else if (TR_LETTERS.test(a)) probs.push(`${c.name} öznitelik: ${a.match(/[^|]*[çğıöşüÇĞİÖŞÜ][^|]*/g)?.slice(0, 3).join(" | ")}`);
        else if (/\batlas\.[a-zA-Z]+\.|\bterms\.[a-z]/.test(h)) probs.push(`${c.name}: ham anahtar`);
        else if (degs(h) !== degs(tr)) probs.push(`${c.name}: derece farkı`);
      }
      assert.deepEqual(probs.slice(0, 12), [], `${probs.length} vaka`);
    });
  }

  console.log(`\natlas-b-r5-i18n: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("atlas-b-r5-i18n çöktü:", e);
  process.exit(1);
});
