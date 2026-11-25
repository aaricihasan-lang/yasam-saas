/**
 * I18N ATLAS-V (R5) — KP panelleri çevirisi (KpPanels, KpTimingPanel, KpRulingIntervalPanel, KpRulingIntervalFields). Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: her vakanın TR kataloğuyla HTML'i çeviri ÖNCESİ bileşenle (taban 26f217b9b) bayt-bayt aynı
 *     (fixtures/i18n/kp-panels-tr-taban.json). Golden yalnız taban bileşenle `ATLAS_KP_GOLDEN_WRITE=1` ile üretildi.
 *   • KİLİT: Word/PDF ile ortak lib metinleri (KP_LEGEND, KP_NUMBER_LOCAL_NOTE, KP_RULING_*, KP_HORARY_TEXT, KP_NODE_SIG_METHODS,
 *     KP_RI_*, düzeltme notları, kısaltmalar) = TR katalog — ekran ile rapor ayrışamaz.
 *   • EN: Türkçe harf / ham anahtar yok (yalnız lib'in ürettiği soru anı saat dilimi notları muaf: LIB_TR_EXEMPT); dereceler ve
 *     KP numaraları TR ile aynı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-kp-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { KpBodyTable, KpChartPanel, KpCuspTable, KpHoraryPanel, KpNodeMethodLegend, KpRulingPanel, KpTransitPanel } from "@/app/admin/astroloji/_components/KpPanels";
import { KpTimingPanel } from "@/app/admin/astroloji/_components/KpTimingPanel";
import { KpRulingIntervalPanel } from "@/app/admin/astroloji/_components/KpRulingIntervalPanel";
import { KpRulingIntervalFields } from "@/app/admin/astroloji/_components/KpRulingIntervalFields";
import { projectRoxyKpRulingInterval } from "@/lib/astrology/providers/roxy/kpRulingInterval";
import type { KpRulingIntervalTechnical } from "@/lib/astrology/model/kpRulingInterval";
import { KP_TIMING_TECHNICAL_SCHEMA, type KpTimingTechnical } from "@/lib/astrology/model/kp";
import type { TechniqueParams } from "@/app/admin/astroloji/_lib/techniques";
import { createTranslator } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { KP_HORARY_TEXT } from "@/lib/astrology/view/kpHorary";
import { KP_NODE_SIG_METHODS, KP_NUMBER_LOCAL_NOTE, KP_PROVIDER_CORRECTION_NOTE, KP_RULING_METHOD_NOTE, KP_RULING_SIG_NOTE, KP_SPLIT_CORRECTION_NOTE, kpCorrectionNote, type KpHoraryTechnical } from "@/lib/astrology/model/kp";
import { KP_RI_CHANGE_KEYS, KP_RI_CHANGE_LABEL, KP_RI_METHOD_NOTE, KP_RI_NUMBER_NOTE, KP_RI_RULE_NOTE } from "@/lib/astrology/model/kpRulingInterval";
import { KP_LEGEND, KP_TRANSIT_LEGEND, gs } from "@/app/admin/astroloji/_lib/kpChart";
import { GRAHA_TR, SIGN_TR_ABBR, grahaTrName } from "@/app/admin/astroloji/_lib/kundliLocalize";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import { NAKSHATRAS } from "@/lib/astrology/model/vedic";
import { questionMomentLabel, questionMomentPlaceNote } from "@/lib/astrology/transitDetail";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const FIX = join(__dirname, "fixtures");
const GOLDEN_PATH = join(FIX, "i18n", "kp-panels-tr-taban.json");
const load = (n: string) => JSON.parse(readFileSync(join(FIX, "golden", `${n}.json`), "utf8"));

// ─── Vakalar (phase61 projeksiyon deseni; gerçek golden yanıtlar) ───────────────
const AT = "2026-10-07T09:00";
const project = (id: string, opts: Record<string, unknown>, raw: J) => {
  const def = getTechnique(id)!;
  const o = { ...def.parseOptions(opts, new Date("2026-10-08T12:00:00Z"))!, ...(id === "kp.horary" ? { offsetHours: 3 } : {}) };
  const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, o)[0];
  const p = def.project(u, raw, o) as J;
  assert.ok(p.ok, `${id}: ${JSON.stringify(p.errors)}`);
  return p.technical;
};
const kbHit = () => [{ topicKey: "kp_x", topicLabel: "KP konu", title: "Başlık", body: "Gövde" }];
const kbNone = () => [];

function riTech(name: string, startLocal: string, startUtc: string): KpRulingIntervalTechnical {
  const PLACE = { latitude: 41.0082, longitude: 28.9784 };
  const end = startLocal.replace(/T(\d\d)/, (_, h: string) => `T${String(Number(h) + 1).padStart(2, "0")}`);
  const o = { startLocal, endLocal: end, intervalMinutes: 10, utcOffsetHours: 3, place: { ...PLACE, label: "İstanbul, Türkiye" }, ayanamsa: "kp-newcomb", nodeType: "mean", startUtc, durationMinutes: 60 } as J;
  const r = projectRoxyKpRulingInterval(load(name).response, o) as J;
  assert.ok(r.ok, `${name}: ${JSON.stringify(r.errors)}`);
  return r.technical as KpRulingIntervalTechnical;
}

/** Sentetik KP zaman aralığı (bileşen yalnız teknik alanları okur; sayılar gerçek KP tablosu aralığında). */
function timingTech(variant: "full" | "empty" | "missing"): KpTimingTechnical {
  const p = (kp: number, star: string, sub: string) => ({ kp, star, sub });
  const base: KpTimingTechnical = {
    schema: KP_TIMING_TECHNICAL_SCHEMA,
    frame: { ayanamsa: "kp-newcomb", ayanamsaDegrees: 24.1234 },
    nodeType: "mean",
    window: { startDate: "2026-10-01", endDate: "2026-10-03" },
    planets: ["moon", "mars"],
    kinds: ["sublord", "rasi", "positions"],
    sublord: [],
    rasi: [],
    positions: null,
    missing: [],
  } as J;
  if (variant === "empty") return { ...base, planets: ["moon"] } as J;
  const a = p(22, "venus", "rahu");
  const b = p(23, "venus", "jupiter");
  const c = p(229, "mercury", "venus");
  return {
    ...base,
    ...(variant === "missing" ? { missing: ["sublord:mars", "rasi:moon", "positions"] } : {}),
    sublord: [
      { planet: "moon", changes: [
        { atUtc: "2026-10-01T03:12:00Z", fromKp: a.kp, toKp: b.kp, fromStar: a.star, toStar: b.star, fromSub: a.sub, toSub: b.sub },
        { atUtc: "2026-10-02T21:40:00Z", fromKp: 228, toKp: c.kp, fromStar: "sun", toStar: c.star, fromSub: "saturn", toSub: c.sub, corrected: { kind: "provider" } },
      ] },
      { planet: "mars", changes: [{ atUtc: "2026-10-01T10:05:00Z", fromKp: 21, toKp: 23, fromStar: "venus", toStar: "venus", fromSub: "moon", toSub: "jupiter", corrected: { kind: "split-sub" } }] },
    ],
    rasi: [{ planet: "moon", changes: [{ atUtc: "2026-10-02T05:30:00Z", fromRashi: "aries", toRashi: "taurus", fromLord: "mars", toLord: "venus" }] }],
    positions: {
      intervalMinutes: 360,
      rows: [
        { atUtc: "2026-10-01T00:00:00Z", bodies: [
          { id: "moon", rashi: "aries", longitude: 12.5, degreeInRashi: 12.5, nakshatra: { id: "ashwini", pada: 4 }, signLord: "mars", starLord: "ketu", subLord: "venus", subSubLord: "sun", kpNumber: 5, retrograde: false },
          { id: "mars", rashi: "leo", longitude: 130.25, degreeInRashi: 10.25, nakshatra: { id: "magha", pada: 4 }, signLord: "sun", starLord: "ketu", subLord: "moon", subSubLord: "mars", kpNumber: 112, kpNumberProvider: 111, retrograde: true },
          { id: "rahu", rashi: "aquarius", longitude: 320.1, degreeInRashi: 20.1, nakshatra: { id: "purva_bhadrapada", pada: 1 }, signLord: "saturn", starLord: "jupiter", subLord: "rahu", subSubLord: "rahu", kpNumber: 215, retrograde: true },
        ] },
      ],
    },
  } as J;
}

type Case = { name: string; el: ReactElement };
function cases(): Case[] {
  const chartT = project("kp.chart", {}, load("kp-chart").response);
  const rulingT = project("kp.ruling", { atUtc: AT }, load("kp-ruling-planets").response);
  const horaryT = project("kp.horary", { atUtc: AT, horaryNumber: 108 }, load("kp-horary").response);
  const transitT = project("kp.transit", { atUtc: AT }, load("kp-planets-at").response);
  const noNode = { ...rulingT, significators: rulingT.significators.filter((s: J) => s.id !== "rahu" && s.id !== "ketu") };
  const omitted = { ...rulingT, significators: [], significatorsOmitted: "place_differs" };
  const localCusps = chartT.cusps.map((c: J, i: number) => (i === 2 ? { ...c, kpNumber: c.kpNumber + 1, kpNumberProvider: c.kpNumber } : c));
  const localBodies = chartT.bodies.map((b: J, i: number) => (i === 1 ? { ...b, kpNumber: b.kpNumber + 1, kpNumberProvider: b.kpNumber } : b));
  const riA = riTech("kp-ruling-interval-a", "2026-10-07T11:30:00", "2026-10-07T08:30");
  const riB = riTech("kp-ruling-interval-b", "2026-11-01T07:00:00", "2026-11-01T04:00");
  const noop = () => undefined;
  const params = (x: Partial<TechniqueParams>) => ({ ...x }) as TechniqueParams;
  return [
    { name: "chart-kbnull", el: createElement(KpChartPanel, { t: chartT, kbLookup: null }) },
    { name: "chart-kbempty", el: createElement(KpChartPanel, { t: chartT, kbLookup: kbNone }) },
    { name: "chart-kbhit", el: createElement(KpChartPanel, { t: chartT, kbLookup: kbHit }) },
    { name: "ruling", el: createElement(KpRulingPanel, { t: rulingT, kbLookup: null }) },
    { name: "ruling-place-legacy", el: createElement(KpRulingPanel, { t: rulingT, kbLookup: kbNone, placeLabel: "İstanbul", birthplace: { lat: 1, lon: 2 } }) },
    { name: "ruling-nonode", el: createElement(KpRulingPanel, { t: noNode, kbLookup: kbHit }) },
    { name: "ruling-omitted", el: createElement(KpRulingPanel, { t: omitted, kbLookup: null }) },
    { name: "horary-ist", el: createElement(KpHoraryPanel, { t: horaryT, kbLookup: null, placeLabel: "İstanbul", displayTz: "Europe/Istanbul", placeTz: "Europe/Istanbul" }) },
    { name: "horary-kb", el: createElement(KpHoraryPanel, { t: horaryT, kbLookup: kbNone, displayTz: "Europe/London", placeTz: "Asia/Kolkata" }) },
    { name: "horary-utc", el: createElement(KpHoraryPanel, { t: horaryT, kbLookup: kbHit, displayTz: "UTC" }) },
    { name: "transit", el: createElement(KpTransitPanel, { t: transitT, kbLookup: null }) },
    { name: "transit-kb", el: createElement(KpTransitPanel, { t: transitT, kbLookup: kbNone }) },
    { name: "cusp-local-number", el: createElement(KpCuspTable, { cusps: localCusps, sel: { kind: "cusp", house: 3 }, onSel: noop }) },
    { name: "body-local-number", el: createElement(KpBodyTable, { bodies: localBodies, sel: null, onSel: noop }) },
    { name: "node-legend", el: createElement(KpNodeMethodLegend, { methods: ["plain", "agent", "agent_houses"], context: "bağlam" }) },
    { name: "timing-full-utc", el: createElement(KpTimingPanel, { t: timingTech("full") }) },
    { name: "timing-full-ist", el: createElement(KpTimingPanel, { t: timingTech("full"), options: { displayTz: "Europe/Istanbul" } }) },
    { name: "timing-missing", el: createElement(KpTimingPanel, { t: timingTech("missing"), options: { displayTz: "America/New_York" } }) },
    { name: "timing-empty", el: createElement(KpTimingPanel, { t: timingTech("empty") }) },
    { name: "ri-a", el: createElement(KpRulingIntervalPanel, { t: riA, kbLookup: null, placeLabel: "İstanbul" }) },
    { name: "ri-b-kbempty", el: createElement(KpRulingIntervalPanel, { t: riB, kbLookup: kbNone }) },
    { name: "ri-a-kbhit", el: createElement(KpRulingIntervalPanel, { t: { ...riA, frame: { ...riA.frame, ayanamsa: "kp-old" }, nodeType: "true" } as J, kbLookup: kbHit }) },
    { name: "ri-fields-default", el: createElement(KpRulingIntervalFields, { params: params({}), onParams: noop }) },
    { name: "ri-fields-invalid", el: createElement(KpRulingIntervalFields, { params: params({ kpRiDuration: 1440, kpRiInterval: 5 }), onParams: noop }) },
  ];
}

const all = cases();
if (process.env.ATLAS_KP_GOLDEN_WRITE === "1") {
  // YALNIZ taban (çeviri öncesi) bileşenle bir kez çalıştırılır.
  const out: Record<string, string> = {};
  for (const c of all) out[c.name] = renderToStaticMarkup(c.el, "tr");
  writeFileSync(GOLDEN_PATH, `${JSON.stringify({ taban: "26f217b9b", cases: out }, null, 1)}\n`);
  console.log(`golden yazıldı: ${all.length} vaka`);
  process.exit(0);
}
assert.ok(existsSync(GOLDEN_PATH), "golden yok");
const golden = (JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { cases: Record<string, string> }).cases;
assert.deepEqual(all.map((c) => c.name).sort(), Object.keys(golden).sort());

// ─── KİLİT: Word/PDF ile ortak lib metinleri = TR katalog ──────────────────────────
type Tr = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: "tr" | "en", namespace: string): Tr =>
  createTranslator({ locale, messages: getCatalogMessages(locale) as Record<string, never>, namespace: namespace as never }) as unknown as Tr;
const k = translator("tr", "atlas.kp");
const terms = translator("tr", "terms");
let locks = 0;
const lock = (a: string, b: string, what: string) => {
  assert.equal(a, b, `kilit: ${what}`);
  locks++;
};
lock(k("chart.legendCusp"), KP_LEGEND, "KP_LEGEND");
lock(k("chart.legendTransit"), KP_TRANSIT_LEGEND, "KP_TRANSIT_LEGEND");
lock(k("localNumberNote"), KP_NUMBER_LOCAL_NOTE, "KP_NUMBER_LOCAL_NOTE");
lock(k("ruling.methodNote"), KP_RULING_METHOD_NOTE, "KP_RULING_METHOD_NOTE");
lock(k("ruling.sigNote"), KP_RULING_SIG_NOTE, "KP_RULING_SIG_NOTE");
for (const f of ["numberRule", "rulingRule", "cuspSubRule", "nodeRule", "source"] as const) lock(k(`horary.${f}`), KP_HORARY_TEXT[f], `KP_HORARY_TEXT.${f}`);
for (const m of Object.keys(KP_NODE_SIG_METHODS) as (keyof typeof KP_NODE_SIG_METHODS)[])
  for (const f of ["short", "label", "detail", "status"] as const) lock(k(`nodeMethod.${m}.${f}`), KP_NODE_SIG_METHODS[m][f], `KP_NODE_SIG_METHODS.${m}.${f}`);
lock(k("timing.providerCorrection"), KP_PROVIDER_CORRECTION_NOTE, "KP_PROVIDER_CORRECTION_NOTE");
lock(k("timing.splitCorrection"), KP_SPLIT_CORRECTION_NOTE, "KP_SPLIT_CORRECTION_NOTE");
lock(k("timing.providerCorrection"), kpCorrectionNote({ kind: "provider" }), "kpCorrectionNote(provider)");
lock(k("timing.splitCorrection"), kpCorrectionNote({ kind: "split-sub" }), "kpCorrectionNote(split-sub)");
lock(k("interval.methodNote"), KP_RI_METHOD_NOTE, "KP_RI_METHOD_NOTE");
lock(k("interval.ruleNote"), KP_RI_RULE_NOTE, "KP_RI_RULE_NOTE");
lock(k("interval.numberNote"), KP_RI_NUMBER_NOTE, "KP_RI_NUMBER_NOTE");
for (const c of KP_RI_CHANGE_KEYS) lock(k(`interval.change.${c}`), KP_RI_CHANGE_LABEL[c], `KP_RI_CHANGE_LABEL.${c}`);
const GRAHAS = Object.keys(GRAHA_TR) as (keyof typeof GRAHA_TR)[];
for (const g of GRAHAS) {
  lock(k(`graha.${g}`), GRAHA_TR[g].tr, `GRAHA_TR.${g}.tr`);
  lock(k(`graha.${g}`), gs(g), `kpChart gs(${g})`);
  lock(k(`grahaFull.${g}`), grahaTrName(g), `grahaTrName(${g})`);
  lock(k(`grahaAbbr.${g}`), GRAHA_TR[g].abbr, `GRAHA_TR.${g}.abbr`);
  lock(terms(`graha.${g}`), GRAHA_LABELS[g], `terms.graha.${g} = GRAHA_LABELS`);
}
for (const s of SIGN_IDS) {
  lock(k(`signAbbr.${s}`), SIGN_TR_ABBR[s], `SIGN_TR_ABBR.${s}`);
  lock(terms(`zodiac.${s}`), SIGN_LABELS[s], `terms.zodiac.${s} = SIGN_LABELS`);
}
for (const n of NAKSHATRAS) lock(terms(`nakshatra.${n}`), NAKSHATRA_LABELS[n], `terms.nakshatra.${n}`);
lock(terms("ayanamsa.kp-newcomb"), "KP-Newcomb", "terms.ayanamsa.kp-newcomb = eski AY");
lock(terms("ayanamsa.kp-old"), "KP (eski tablo)", "terms.ayanamsa.kp-old = eski AY");
// EN kısaltmaları kundli kütüphanesinin (Roxy UI) kendi İngilizce kısaltmalarıdır.
const en = translator("en", "atlas.kp");
assert.deepEqual(GRAHAS.map((g) => en(`grahaAbbr.${g}`)), ["Su", "Mo", "Ma", "Me", "Ju", "Ve", "Sa", "Ra", "Ke"]);
assert.deepEqual(SIGN_IDS.map((s) => en(`signAbbr.${s}`)), ["Ar", "Ta", "Ge", "Cn", "Le", "Vi", "Li", "Sc", "Sg", "Cp", "Aq", "Pi"]);

// ─── TR bayt-bayt + EN ───────────────────────────────────────────────────────────
const TR_RE = /[çğıöşüÇĞİÖŞÜ]/;
const dec = (h: string) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const visible = (h: string) => {
  const attrs = [...h.matchAll(/\s(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  return dec(`${h.replace(/<[^>]+>/g, " ")} ${attrs.join(" ")}`);
};
// Muaf (ürün metni DEĞİL): uzmanın kendi verisi (KB kaydı, yer adı, çağıranın verdiği bağlam), marka adı ve lib'in (transitDetail,
// Batı horary ile ortak — ATLAS-V ana / ATLAS-A kapsamı) ürettiği soru anı saat dilimi notları.
const USER_DATA = ["KP konu", "Başlık", "Gövde", "İstanbul", "bağlam", "Yaşam Sistemi"];
const libExempt = (name: string): string[] => {
  if (!name.startsWith("horary")) return [];
  const H: Record<string, [string | null, string | null]> = { "horary-ist": ["Europe/Istanbul", "Europe/Istanbul"], "horary-kb": ["Europe/London", "Asia/Kolkata"], "horary-utc": ["UTC", null] };
  const [d, p] = H[name];
  const at = (all.find((c) => c.name === name)!.el.props as { t: KpHoraryTechnical }).t.at.utc;
  return [questionMomentLabel(at, d), questionMomentPlaceNote(at, d, p) ?? ""].filter(Boolean);
};
const degs = (h: string) => (dec(h.replace(/<[^>]+>/g, " ")).match(/\d+°\d{2}′(?:\d{2}″)?|KP \d+\*?|L[1-4]: [0-9, —]*/g) ?? []).join(" | ");
const enExempt: string[] = [];
for (const c of all) {
  const trHtml = renderToStaticMarkup(c.el, "tr");
  assert.equal(trHtml, golden[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  const enHtml = renderToStaticMarkup(c.el, "en");
  let txt = visible(enHtml);
  for (const x of libExempt(c.name)) {
    if (txt.includes(x) && TR_RE.test(x)) enExempt.push(`${c.name}: ${x}`);
    txt = txt.split(x).join(" ");
  }
  for (const x of USER_DATA) txt = txt.split(x).join(" ");
  assert.ok(!TR_RE.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 10).join(" | ")}`);
  assert.ok(!/atlas\.kp|terms\./.test(enHtml), `${c.name}: ham anahtar`);
  assert.equal(degs(enHtml), degs(trHtml), `${c.name}: derece / KP no. / düzey evleri TR = EN`);
  // Kanonik öznitelikler (data-*) dilden bağımsız.
  const data = (h: string) => [...h.matchAll(/\sdata-[a-z-]+="[^"]*"/g)].map((m) => m[0]).join("");
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* öznitelikleri TR = EN`);
}
console.log(`✅ atlas-kp-i18n: TR HTML = taban ${all.length}/${all.length} vaka · ${locks} lib/terim kilidi (TR katalog = Word/PDF ortak sabitler) · EN Türkçe harfsiz, ham anahtarsız, derece/KP no./düzeyler ve data-* TR ile aynı`);
console.log(`   EN'de muaf tutulan lib metni (transitDetail soru anı notu; ${enExempt.length}): ${enExempt.join(" ‖ ") || "yok"}`);
