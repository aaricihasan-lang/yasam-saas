/**
 * I18N-F1-R5 (ATLAS-A) — Atlas ekran çevirisi kilitleri. Ağ / DB / sağlayıcı YOK.
 *
 *   [S] "Yakında" (ComingSoonPanel): TR bölüm/madde metinleri KANONİK ANAHTAR olarak kaynakta kalır (görünürlük eşlemesi);
 *       ekran metni koddan katalogla. TR katalog değeri = kaynak metin (karakteri karakterine); her madde/bölüm/not kodlu;
 *       EN katalog eksiksiz ve Türkçe harfsiz; görünürlük kararı dilden bağımsız (kod kümesi aynı).
 *   [F] Transit Takvimi (ForecastPanel + gün ayrıntısı): TR çizimi çeviri ÖNCESİ bileşenle aynı (fixtures/i18n/
 *       forecast-panel-tr-taban.json; SSR metin düğümü ayırıcıları `<!-- -->` hariç — DOM metni birebir); olay cümlesi
 *       TR'de lib eventText ile birebir; lib notları (kapsam, önem) = TR katalog; EN'de Türkçe harf yok.
 *       Taban yeniden üretimi YALNIZ çeviri öncesi kodla: ... --write-golden
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-a-r5-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createTranslator } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { DayDetail, ForecastPanel, eventText } from "@/app/admin/astroloji/_components/TransitPanels";
import type { ForecastEvent, ForecastTechnical } from "@/lib/astrology/model/westernTiming";
import { FORECAST_SCOPE_NOTE, SIGNIFICANCE_BAND_LABELS, SIGNIFICANCE_NOTE, groupEventsByDay } from "@/lib/astrology/transitDetail";
import NatalTechnicalPanel, { NatalKeyPlacementCards } from "@/app/admin/astroloji/_components/NatalTechnicalPanel";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import { DIST_METHODS, DIST_METHOD_LABELS, DIST_METHOD_NOTES, PROVIDER_TIE_RULE_NOTE, distributive, dominantHeadline, tieSentence } from "@/lib/astrology/view/natalDistribution";
import { MOON_UNKNOWN_ROW, MOON_UNKNOWN_TEXT, NOON_ASSUMPTION } from "@/lib/astrology/view/natalLabelLayout";
import { KEY_ASC_UNKNOWN_NOTE, KEY_MOON_UNKNOWN_NOTE, KEY_SUN_ASSUMED_NOTE, natalKeyPlacements } from "@/lib/astrology/view/natalKeyPlacements";
import NatalChartControls from "@/app/admin/astroloji/_components/NatalChartControls";
import { DEFAULT_ASPECT_FILTER, NATAL_LABEL_PREF_LABELS, NATAL_OPTIONAL_POINT_LABELS, NATAL_WHEEL_MODE_LABELS, type NatalWheelPrefs } from "@/lib/astrology/view/natalWheelDisplay";
import { AVAILABLE_TECHNIQUES, COMING_SOON_AVAILABLE_AS, COMING_SOON_ITEM_CODES, COMING_SOON_SECTION_CODES, visibleComingSoonSections } from "@/app/admin/astroloji/_lib/comingSoon";

const ROOT = join(__dirname, "..", "..");
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
type Tr = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: "tr" | "en", namespace: string): Tr =>
  createTranslator({ locale, messages: getCatalogMessages(locale) as Record<string, never>, namespace: namespace as never }) as unknown as Tr;

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

// ─── [S] Yakında ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n[S] Yakında: kanonik TR anahtar → kod → katalog");
// Panel yazı tipi yüklediği için içe aktarılmaz (panchanga-hours deseni): bölümler kaynak metinden okunur.
const soonSrc = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/ComingSoonPanel.tsx"), "utf8");
const block = soonSrc.slice(soonSrc.indexOf("COMING_SOON_SECTIONS"), soonSrc.indexOf("/** Yalnız henüz"));
const sections = [...block.matchAll(/title: "([^"]+)",\s*items: \[([\s\S]*?)\],(?:\s*notes: \[([\s\S]*?)\],)?/g)].map((m) => ({
  title: m[1],
  items: [...m[2].matchAll(/"([^"\n]+)"/g)].map((x) => x[1]),
  notes: [...(m[3] ?? "").matchAll(/"([^"\n]+)"/g)].map((x) => x[1]),
}));
const soonTr = translator("tr", "atlas.soon");
const soonEn = translator("en", "atlas.soon");
t(`10 bölüm / ${sections.reduce((n, s) => n + s.items.length, 0)} madde: her bölüm ve madde kodlu, TR katalog = kaynak metin (karakteri karakterine)`, () => {
  assert.equal(sections.length, 10);
  for (const s of sections) {
    const code = COMING_SOON_SECTION_CODES[s.title];
    assert.ok(code, `bölüm kodu yok: ${s.title}`);
    assert.equal(soonTr(`sections.${code}`), s.title);
    s.notes.forEach((n, k) => assert.equal(soonTr(`notes.${code}_${k + 1}`), n));
    for (const it of s.items) {
      const ic = COMING_SOON_ITEM_CODES[it];
      assert.ok(ic, `madde kodu yok: ${it}`);
      assert.equal(soonTr(`items.${ic}`), it);
    }
  }
  const codes = Object.values(COMING_SOON_ITEM_CODES);
  assert.equal(new Set(codes).size, codes.length, "madde kodları benzersiz");
  for (const k of Object.keys(COMING_SOON_AVAILABLE_AS)) assert.ok(COMING_SOON_ITEM_CODES[k], `eşlemedeki madde kodsuz: ${k}`);
});
t("TR sabit metinler (durum, başlık, giriş, süreç notları) eski kaynakla birebir", () => {
  assert.equal(soonTr("status"), "GELİŞTİRİLİYOR");
  assert.equal(soonTr("eyebrow"), "Yakında");
  assert.equal(soonTr("title"), "GÖKYÜZÜ ATLASI GENİŞLİYOR");
  assert.equal(soonTr("sub"), "Yeni Haritalar — Geleneksel Astroloji Ekolleri — Yeni Hesaplamalar");
  assert.equal(soonTr("back"), "Ana ekrana dön");
  assert.equal(soonTr("processTitle"), "GELİŞTİRME SÜRECİ HAKKINDA");
  assert.equal(soonTr("process.p4"), "Kesin bir yayın tarihi taahhüt edilmemektedir.");
});
t("EN katalog eksiksiz, Türkçe harfsiz; ham anahtar yok", () => {
  const all: string[] = [];
  for (const k of ["status", "eyebrow", "title", "sub", "back", "ariaExpanding", "intro1", "intro2", "processTitle", "process.p1", "process.p2", "process.p3", "process.p4"]) all.push(soonEn(k));
  for (const s of sections) {
    const code = COMING_SOON_SECTION_CODES[s.title];
    all.push(soonEn(`sections.${code}`), ...s.notes.map((_n, k) => soonEn(`notes.${code}_${k + 1}`)), ...s.items.map((it) => soonEn(`items.${COMING_SOON_ITEM_CODES[it]}`)));
  }
  for (const x of all) {
    // Marka adı her dilde korunur (TERMINOLOJI: "Yaşam Sistemi" çevrilmez).
    assert.ok(!TR_LETTERS.test(x.replace(/Yaşam Sistemi/g, "")), `Türkçe harf: ${x}`);
    assert.ok(!/^(atlas\.soon\.|items\.|sections\.)/.test(x), `ham anahtar: ${x}`);
  }
});
t("görünürlük kararı dilden bağımsız: görünen madde kodları her dilde aynı; açılmış teknik maddesi düşer", () => {
  const v = visibleComingSoonSections(sections, AVAILABLE_TECHNIQUES);
  const codes = v.flatMap((s) => s.items.map((it) => COMING_SOON_ITEM_CODES[it]));
  assert.ok(!codes.includes("declination_parallels") && !codes.includes("detailed_panchanga"));
  assert.ok(codes.includes("kalsarpa") && codes.includes("ecliptic_crossings"));
  const enView = v.map((s) => s.items.map((it) => soonEn(`items.${COMING_SOON_ITEM_CODES[it]}`)));
  assert.equal(enView.flat().length, codes.length);
});
t("panel kaynakta kullanıcı metni yok (yalnız katalog anahtarı); kanonik liste bloğu korunuyor", () => {
  const body = soonSrc.slice(soonSrc.indexOf("export default function ComingSoonPanel"));
  assert.ok(!TR_LETTERS.test(body), "panel gövdesinde Türkçe metin");
  assert.ok(body.includes('useTranslations("atlas.soon")'));
});

// ─── [N] Natal teknik paneli ──────────────────────────────────────────────────────────────────────────────────────
const GOLD_N = join(__dirname, "fixtures", "i18n", "natal-technical-panel-tr-taban.json");
const natalCases = (JSON.parse(readFileSync(join(__dirname, "fixtures", "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]).slice(0, 24);
const natalGoldenRaw = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8")) as { response?: unknown };
const natalGoldenProj = projectRoxyNatal(structuredClone(natalGoldenRaw.response ?? natalGoldenRaw), { houseSystem: "placidus", nodeType: "true" } as never) as { ok: true; value: { technical: NatalTechnical } };
const natalAll: { id: string; technical: NatalTechnical }[] = [{ id: "golden", technical: natalGoldenProj.value.technical }, ...natalCases];
type NCase = { name: string; el: () => ReturnType<typeof createElement> };
const natalRenderCases: NCase[] = natalAll.flatMap((c, i) => {
  const parts = i < 3 ? (["all", "overview", "planets", "houses", "aspects"] as const) : (["all"] as const);
  return [false, true].flatMap((tu) => [
    ...parts.map((part) => ({ name: `${c.id}|${tu ? "saatsiz" : "saatli"}|${part}`, el: () => createElement(NatalTechnicalPanel, { technical: c.technical, timeUnknown: tu, part }) })),
    { name: `${c.id}|${tu ? "saatsiz" : "saatli"}|kartlar`, el: () => createElement(NatalKeyPlacementCards, { technical: c.technical, timeUnknown: tu }) },
  ]);
});
/** Taban dosyası küçük kalsın: SSR HTML'in (`<!-- -->` metin ayırıcıları çıkarılmış) sha256'sı saklanır. */
const natalSha = (h: string) => createHash("sha256").update(h.replace(/<!-- -->/g, ""), "utf8").digest("hex");
if (process.argv.includes("--write-golden-natal")) {
  const cases: Record<string, string> = {};
  for (const c of natalRenderCases) cases[c.name] = natalSha(renderToStaticMarkup(c.el(), "tr"));
  writeFileSync(GOLD_N, JSON.stringify({ source: "atlas-a-r5-i18n --write-golden-natal — NatalTechnicalPanel / NatalKeyPlacementCards çeviri ÖNCESİ (work/i18n-mod-g-atlas aebf36146); değer = sha256(SSR HTML, ayırıcılar hariç)", cases }, null, 1) + "\n");
  console.log(`natal taban yazıldı: ${Object.keys(cases).length} vaka`);
  process.exit(0);
}
console.log("\n[N] Natal teknik paneli + özet kartları: TR birebir, lib cümleleri kilitli, EN Türkçe harfsiz");
const goldN = (JSON.parse(readFileSync(GOLD_N, "utf8")) as { cases: Record<string, string> }).cases;
t(`TR çizim çeviri öncesiyle aynı (${natalRenderCases.length} vaka: ${natalAll.length} harita × saatli/saatsiz × bölüm + kartlar)`, () => {
  assert.equal(Object.keys(goldN).length, natalRenderCases.length);
  const bad = natalRenderCases.filter((c) => natalSha(renderToStaticMarkup(c.el(), "tr")) !== goldN[c.name]).map((c) => c.name);
  assert.deepEqual(bad, []);
});
t("Word/PDF ile paylaşılan lib cümleleri = TR katalog (yöntem adları/notları, eşitlik kuralı, Ay belirsizliği, 12:00, kart notları)", () => {
  const n = translator("tr", "atlas.natalPanel");
  for (const m of DIST_METHODS) {
    assert.equal(n(`method.${m}`), DIST_METHOD_LABELS[m]);
    assert.equal(n(`methodNote.${m}`), DIST_METHOD_NOTES[m]);
  }
  assert.equal(n("providerTieRule"), PROVIDER_TIE_RULE_NOTE);
  assert.equal(n("moonUnknownText"), MOON_UNKNOWN_TEXT);
  assert.equal(n("moonUnknownRow"), MOON_UNKNOWN_ROW);
  assert.equal(n("noonAssumption"), NOON_ASSUMPTION);
  assert.equal(n("keySunAssumedNote"), KEY_SUN_ASSUMED_NOTE);
  assert.equal(n("keyMoonUnknownNote"), KEY_MOON_UNKNOWN_NOTE);
  assert.equal(n("keyAscUnknownNote"), KEY_ASC_UNKNOWN_NOTE);
  const kp = natalKeyPlacements(natalAll[0].technical, true);
  assert.equal(n("keySunAssumedDetail"), kp.find((k) => k.key === "sun")!.detail);
  assert.equal(n("keyAscUnknownDetail"), kp.find((k) => k.key === "asc")!.detail);
  // Eşitlik / baskın başlık: lib tieSentence / dominantHeadline ile aynı kompozisyon (1–4 ad × 1–15 değer × iki birim).
  const names = ["Ateş", "Toprak", "Hava", "Su"];
  for (let k = 1; k <= 4; k += 1)
    for (let v = 1; v <= 15; v += 1)
      for (const unit of ["gezegen", "puan"] as const) {
        const ns = names.slice(0, k);
        const joined = ns.length <= 1 ? (ns[0] ?? "") : `${ns.slice(0, -1).join(", ")} ${n("and")} ${ns[ns.length - 1]}`;
        assert.equal(n(unit === "gezegen" ? "tiePlanets" : "tiePoints", { names: joined, each: distributive(v), value: v }), tieSentence(ns, v, unit));
        assert.equal(ns.length === 1 ? n("dominant", { name: ns[0] }) : n("tieHead", { names: ns.join(" · ") }), dominantHeadline(ns));
      }
});
t("EN: metin + öznitelik Türkçe harfsiz; ham anahtar yok (tüm vakalar)", () => {
  for (const c of natalRenderCases) {
    const h = renderToStaticMarkup(c.el(), "en");
    const vis = h.replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ");
    assert.ok(!TR_LETTERS.test(vis), `${c.name}: ${vis.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/)?.[0]}`);
    const attrs = [...h.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]).join(" ");
    assert.ok(!TR_LETTERS.test(attrs), `${c.name} öznitelik: ${attrs.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/)?.[0]}`);
    assert.ok(!/atlas\.natalPanel\.|terms\./.test(h), `${c.name}: ham anahtar`);
  }
});

// ─── [C] Natal çark denetimi (araç çubuğu) ──────────────────────────────────────────────────────────────────────────
const GOLD_C = join(__dirname, "fixtures", "i18n", "natal-chart-controls-tr-taban.json");
const ALLP = { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true };
const basePrefs: NatalWheelPrefs = { mode: "pro", labels: "auto", points: { basic: { ...ALLP }, pro: { ...ALLP } }, filter: { ...DEFAULT_ASPECT_FILTER } };
const prefVariants: { name: string; prefs: NatalWheelPrefs; tu?: boolean }[] = [
  { name: "varsayilan", prefs: basePrefs },
  { name: "temel", prefs: { ...basePrefs, mode: "basic", labels: "simple" } },
  { name: "odak-gunes", prefs: { ...basePrefs, labels: "detailed", filter: { ...DEFAULT_ASPECT_FILTER, harmonious: false, focus: "sun" } } },
  { name: "nokta-kapali", prefs: { ...basePrefs, points: { basic: { ...ALLP }, pro: { ...ALLP, chiron: false, vertex: false } } } },
  { name: "saatsiz", prefs: basePrefs, tu: true },
];
const controlCases: NCase[] = natalAll.slice(0, 6).flatMap((c) =>
  prefVariants.map((v) => ({ name: `${c.id}|${v.name}`, el: () => createElement(NatalChartControls, { technical: c.technical, prefs: v.prefs, onChange: noopPrefs, timeUnknown: v.tu ?? false }) })),
);
function noopPrefs(): void {}
if (process.argv.includes("--write-golden-controls")) {
  const cases: Record<string, string> = {};
  for (const c of controlCases) cases[c.name] = natalSha(renderToStaticMarkup(c.el(), "tr"));
  writeFileSync(GOLD_C, JSON.stringify({ source: "atlas-a-r5-i18n --write-golden-controls — NatalChartControls çeviri ÖNCESİ (work/i18n-mod-g-atlas 4157080e1); değer = sha256(SSR HTML, ayırıcılar hariç)", cases }, null, 1) + "\n");
  console.log(`kontrol tabanı yazıldı: ${Object.keys(cases).length} vaka`);
  process.exit(0);
}
console.log("\n[C] Natal çark denetimi: TR birebir, menü metinleri kilitli, EN Türkçe harfsiz");
const goldC = (JSON.parse(readFileSync(GOLD_C, "utf8")) as { cases: Record<string, string> }).cases;
t(`TR araç çubuğu çeviri öncesiyle aynı (${controlCases.length} vaka: 6 harita × 5 tercih/saat varyantı)`, () => {
  const bad = controlCases.filter((c) => natalSha(renderToStaticMarkup(c.el(), "tr")) !== goldC[c.name]).map((c) => c.name);
  assert.deepEqual(bad, []);
});
t("lib etiketleri + açılır menü metinleri = TR katalog (menüler SSR'de kapalı olduğundan metin kilidi; kaynak: çeviri öncesi bileşen)", () => {
  const c = translator("tr", "atlas.natalControls");
  for (const [k, v] of Object.entries(NATAL_WHEEL_MODE_LABELS)) assert.equal(c(`mode.${k}`), v);
  for (const [k, v] of Object.entries(NATAL_LABEL_PREF_LABELS)) assert.equal(c(`labelPref.${k}`), v);
  for (const [k, v] of Object.entries(NATAL_OPTIONAL_POINT_LABELS)) assert.equal(c(`point.${k}`), v);
  const OLD: Record<string, string> = {
    pointsGroupAria: "Haritada gösterilecek noktalar",
    pointMissingNote: "Bu haritada yok (doğum saati bilinmiyor)",
    labelsTitle: "Çark etiketleri",
    "labelHint.simple": "Gezegen · derece · dakika",
    "labelHint.detailed": "Gezegen · derece · burç · dakika; ev başlangıçları",
    drawOnly: "Yalnız çizim değişir; hesap ve kayıt değişmez.",
    groupTitle: "Açı grubu",
    minorBasicNote: "Temel görünümde çizilmez — Profesyonel'e geçin",
    majorNote: "Kavuşum, sekstil, kare, üçgen, karşıt",
    minorNote: "Yarım sekstil, yarım kare, seskikare, kuinkunks",
    major: "Başlıca açılar",
    minor: "Küçük açılar",
    natureAria: "Açı niteliği",
    natureTitle: "Nitelik",
    focusLabel: "Gövde odağı",
    focusTitle: "Yalnız seçilen gezegenin / noktanın açı çizgilerini göster",
    focusAll: "Tüm gövdeler",
    selectAll: "Tümünü seç",
    clear: "Temizle",
  };
  for (const [k, v] of Object.entries(OLD)) assert.equal(c(k), v, k);
  assert.equal(c("labelHint.auto", { current: c("currentDetailed") }), "Temel: sade · Profesyonel: ayrıntılı (şu an ayrıntılı)");
  assert.equal(c("labelHint.auto", { current: c("currentSimple") }), "Temel: sade · Profesyonel: ayrıntılı (şu an sade)");
  assert.equal(c("filterTitle", { on: "4", total: "5", focus: c("filterFocusOnly", { body: "Güneş" }) }), "Çarkta çizilen açılar: 4/5 seçenek seçili · yalnız Güneş");
});
t("EN araç çubuğu: metin + öznitelik Türkçe harfsiz; ham anahtar yok", () => {
  for (const c of controlCases) {
    const h = renderToStaticMarkup(c.el(), "en");
    const vis = h.replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ");
    assert.ok(!TR_LETTERS.test(vis), `${c.name}: ${vis.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/)?.[0]}`);
    const attrs = [...h.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]).join(" ");
    assert.ok(!TR_LETTERS.test(attrs), `${c.name} öznitelik: ${attrs.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/)?.[0]}`);
    assert.ok(!/atlas\.natalControls\./.test(h), `${c.name}: ham anahtar`);
  }
});

// ─── [F] Transit Takvimi ──────────────────────────────────────────────────────────────────────────────────────────
type J = Record<string, unknown>;
const GOLD_F = join(__dirname, "fixtures", "i18n", "forecast-panel-tr-taban.json");
const goldenRaw = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", `${name}.json`), "utf8")) as { response: unknown };
const FC = getTechnique("western.forecast")!;
const CAL = { startDate: "2026-10-01", days: 90 };
const UCTX = { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-07-15T11:30:00Z", partner: null } as never;
const fc = (FC.project(FC.units(UCTX, CAL)[0], goldenRaw("forecast").response, CAL) as J).technical as ForecastTechnical;
const noSig: ForecastTechnical = { ...fc, events: fc.events.map((e) => ({ ...e, significance: null })) };
const empty: ForecastTechnical = { ...fc, events: [] };
/** Gün ayrıntısı vakaları: en kalabalık gün (kişisel + genel), yalnız genel olaylı gün, olaysız gün. */
const fdays = groupEventsByDay(fc.events, "Europe/Istanbul");
const busiest = [...fdays].sort((a, b) => b[1].length - a[1].length)[0];
const skyOnly = fdays.find(([, l]) => l.every((e) => e.type !== "transit_aspect"));
const fakeApi = { plan: async () => ({ ok: true as const, newRequests: 0 }), open: async () => ({ ok: true as const }) };
type Case = { name: string; el: () => ReturnType<typeof createElement> };
const noop = () => {};
const forecastCases: Case[] = [
  { name: "panel-utc", el: () => createElement(ForecastPanel, { t: fc, options: CAL }) },
  { name: "panel-istanbul", el: () => createElement(ForecastPanel, { t: fc, options: { ...CAL, displayTz: "Europe/Istanbul" } }) },
  { name: "panel-onemsiz", el: () => createElement(ForecastPanel, { t: noSig, options: { ...CAL, displayTz: "America/New_York" } }) },
  { name: "panel-bos", el: () => createElement(ForecastPanel, { t: empty, options: CAL }) },
  { name: "gun-kalabalik-api", el: () => createElement(DayDetail, { day: busiest[0], events: busiest[1], tz: "Europe/Istanbul", api: fakeApi, onClose: noop }) },
  { name: "gun-kalabalik-kayitli", el: () => createElement(DayDetail, { day: busiest[0], events: busiest[1], tz: "UTC", api: null, onClose: noop }) },
  { name: "gun-genel", el: () => createElement(DayDetail, { day: skyOnly![0], events: skyOnly![1], tz: "Asia/Kolkata", api: fakeApi, onClose: noop }) },
  { name: "gun-bos", el: () => createElement(DayDetail, { day: "2026-10-02", events: [], tz: "Europe/Istanbul", api: fakeApi, onClose: noop }) },
];
const stripMarkers = (h: string) => h.replace(/<!-- -->/g, "");
if (process.argv.includes("--write-golden")) {
  const cases: Record<string, string> = {};
  for (const c of forecastCases) cases[c.name] = renderToStaticMarkup(c.el(), "tr");
  writeFileSync(GOLD_F, JSON.stringify({ source: "atlas-a-r5-i18n --write-golden — ForecastPanel/DayDetail çeviri ÖNCESİ (work/i18n-mod-g-atlas 200fd634d + yalnız DayDetail export)", cases }, null, 0) + "\n");
  console.log(`taban yazıldı: ${Object.keys(cases).length} vaka`);
  process.exit(0);
}
console.log("\n[F] Transit Takvimi: TR birebir, EN Türkçe harfsiz");
const goldF = (JSON.parse(readFileSync(GOLD_F, "utf8")) as { cases: Record<string, string> }).cases;
t(`TR çizim çeviri öncesiyle aynı (${forecastCases.length} vaka; ${fc.events.length} olay; ayırıcı yorumlar hariç)`, () => {
  // Kapsam: kalabalık gün kişisel (natal) olayları, "gun-genel" genel gökyüzü olaylarını çizer.
  assert.ok(busiest[1].some((e) => e.type === "transit_aspect"), "kalabalık günde kişisel olay olmalı");
  assert.ok(skyOnly && skyOnly[1].length > 0, "genel olaylı gün olmalı");
  for (const c of forecastCases) assert.equal(stripMarkers(renderToStaticMarkup(c.el(), "tr")), stripMarkers(goldF[c.name]), c.name);
});
t("lib notları = TR katalog (kapsam, önem notu, önem bantları)", () => {
  const f = translator("tr", "atlas.forecast");
  assert.equal(f("scopeNote"), FORECAST_SCOPE_NOTE);
  assert.equal(f("significanceNote"), SIGNIFICANCE_NOTE);
  for (const [k, v] of Object.entries(SIGNIFICANCE_BAND_LABELS)) assert.equal(f(`band.${k}`), v);
});
const visibleText = (h: string) => stripMarkers(h).replace(/<[^>]*>/g, " ");
const attrText = (h: string) => [...h.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]).join(" ");
t("EN: metin + öznitelik Türkçe harfsiz; ham anahtar yok", () => {
  for (const c of forecastCases) {
    const h = renderToStaticMarkup(c.el(), "en");
    assert.ok(!TR_LETTERS.test(visibleText(h)), `${c.name}: ${visibleText(h).match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/)?.[0]}`);
    assert.ok(!TR_LETTERS.test(attrText(h)), `${c.name} öznitelik`);
    assert.ok(!/atlas\.forecast\./.test(h), `${c.name}: ham anahtar`);
    // Owner A8: EN tarih gün/ay/yıl "/" ayırıcısıyla (TR GG.AA.YYYY değişmez — yukarıdaki TR taban testi).
    assert.ok(!/\b\d{2}\.\d{2}\.\d{4}\b/.test(visibleText(h)), `${c.name}: EN'de GG.AA.YYYY tarih`);
  }
});
t("olay cümlesi: TR'de lib eventText ile birebir (tüm golden olayları + sentetik tutulma/istasyon/evre varyantları)", () => {
  const extra: ForecastEvent[] = [
    { ...fc.events[0], type: "eclipse", body: "moon", eclipseKind: "penumbral", obscuration: 0.42 } as ForecastEvent,
    { ...fc.events[0], type: "eclipse", body: "sun", eclipseKind: null, obscuration: null } as ForecastEvent,
    { ...fc.events[0], type: "retrograde_station", body: "mercury", station: "direct" } as ForecastEvent,
    { ...fc.events[0], type: "lunar_phase", body: null, phase: "full_moon", targetSign: null } as ForecastEvent,
  ];
  const all = [...fc.events, ...extra];
  const html = stripMarkers(renderToStaticMarkup(createElement(DayDetail, { day: "2026-10-02", events: all, tz: "UTC", api: null, onClose: noop }), "tr"));
  for (const e of all) assert.ok(html.includes(eventText(e).replace(/&/g, "&amp;")), eventText(e));
});

console.log(`\natlas-a-r5-i18n: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
