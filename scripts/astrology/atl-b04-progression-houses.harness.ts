/**
 * ATL-B04 — Secondary progression EV ÇERÇEVELERİ regresyon harness'i (14.11.2026).
 *
 * Kanıt: 30.10.2026 büyük denetimin 302 GERÇEK progresyon projeksiyonu (adaptör astro-roxy-progression-1) + aynı kişilerin 299 GERÇEK
 * natal Placidus ev başı — fixtures/atl-b04/progression-300.json. Yeni ücretli çağrı YOK; ağ YOK.
 *
 *   A) Sağlayıcı `house` = NATAL ev (Placidus): 299/299 haritada her nokta natal ev başlarına göre yerel hesapla birebir (sözleşme:
 *      "Natal house the progressed body occupies ... requested houseSystem"; gövdede houseSystem yok → Placidus).
 *   B) Eski etiket ("ilerletilmiş Yükselen'den tam burç") ile değer çelişiyordu: 298/302 haritada en az bir noktada farklı; denetimin
 *      "uyumsuz" listesi (sağlayıcı ≠ tam burç) BİREBİR yeniden üretilir.
 *   C) Yeni sütunlar: "Natal ev" (çerçeve varsa çerçevenin ev başlarından, yoksa sağlayıcı değeri — ikisi 299/299 aynı) ve
 *      "İlerletilmiş harita evi (tam burç)" (kayıtlı ilerletilmiş Yükselen + boylam aritmetiği; bağımsız hesapla 302/302).
 *   D) Çark = tablo: tek ilerletilmiş çarkın ev başlarına göre her nokta = "İlerletilmiş harita evi" sütunu (302/302); çift halka natal
 *      evleri = "Natal ev" sütunu.
 *   E) Ekran: başlıklar iki çerçeveyi ayrı ve doğru adlandırır; eski "Ev (ilerl.)" yok; saat bilinmiyorsa iki sütun da yok.
 *   F) Word/PDF: aynı iki sütun + aynı değerler; eski tek "Ev yöntemi" satırı yok; yöntem notu Naibod'u ve iki çerçeveyi söyler.
 *   G) Kayıtlı teknik katman değişmez: adaptör / gövde / önbellek anahtarı aynı (eski kayıtlar aynı fonksiyonla doğru etiketlenir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atl-b04-progression-houses.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { natalHouseOf } from "@/lib/astrology/transitDetail";
import { progressedWholeSignCusps, progressedWholeSignHouse, progressionHouseColumns, PROGRESSED_CHART_HOUSE_LABEL } from "@/lib/astrology/progressionHouses";
import { PROGRESSION_METHOD_NOTE } from "@/lib/astrology/directionAspects";
import { ROXY_PROGRESSION } from "@/lib/astrology/providers/roxy/timing";
import { targetDateBody } from "@/lib/astrology/providers/roxy/requests";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { ProgressionPanel, wheelForTechnique } from "@/app/admin/astroloji/_components/TimingPanels";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import type { ProgressionTechnical } from "@/lib/astrology/model/westernTiming";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Case = { id: string; targetDate: string; asc: number; mc: number; bodies: [string, number, number | null][]; natalPlacidusCusps?: number[]; audit: { durum: string; yasam: string; referans: string; not_: string } | null };
const FX = JSON.parse(readFileSync(join(__dirname, "fixtures", "atl-b04", "progression-300.json"), "utf8")) as { cases: Case[] };

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 14).join("\n     ")}`);
  }
}

const pt = (lon: number) => ({ longitude: lon, sign: SIGN_IDS[Math.floor((((lon % 360) + 360) % 360) / 30)], degreeInSign: ((lon % 30) + 30) % 30 });
const housesOf = (cusps: number[]) => cusps.map((lon, i) => ({ number: i + 1, ...pt(lon) }));
/** Fixture vakasından adaptör çıktısıyla AYNI biçimde ProgressionTechnical (kayıtlı katman). */
function techOf(c: Case, withFrame: boolean): ProgressionTechnical {
  const t: J = {
    schema: "astro.western.progression.v1",
    zodiac: "tropical",
    nodeType: "true",
    targetDate: c.targetDate,
    progressedDate: null,
    elapsedYears: null,
    houseMethod: "whole_sign_from_progressed_ascendant",
    bodies: c.bodies.map(([id, lon, house]) => ({ id, ...pt(lon), house, speed: 1, retrograde: false })),
    angles: { ascendant: pt(c.asc), midheaven: pt(c.mc) },
  };
  if (withFrame && c.natalPlacidusCusps) {
    t.natalFrame = { houseSystem: "placidus", nodeType: "true", bodies: [], houses: housesOf(c.natalPlacidusCusps), angles: { ascendant: pt(c.natalPlacidusCusps[0]), midheaven: pt(c.natalPlacidusCusps[9]) } };
  }
  return t as ProgressionTechnical;
}
/** Bağımsız tam burç evi (farklı aritmetik yolu: dereceyi doğrudan 30'a bölerek, modül sayımı). */
const wsIndependent = (lon: number, asc: number) => 1 + ((Math.floor(lon / 30) - Math.floor(asc / 30) + 120) % 12);

async function main() {
  const cases = FX.cases;

  await t("hazırlık: 302 gerçek progresyon projeksiyonu; 299'unda aynı kişinin gerçek natal Placidus ev başları", () => {
    assert.equal(cases.length, 302);
    assert.equal(cases.filter((c) => c.natalPlacidusCusps?.length === 12).length, 299);
    assert.ok(cases.every((c) => c.bodies.length >= 10 && c.bodies.every(([, , h]) => typeof h === "number")));
  });

  await t("A) sağlayıcının `house` alanı = NATAL Placidus evi: 299/299 haritada TÜM noktalar natal ev başlarına göre yerel hesapla birebir", () => {
    let n = 0;
    const bad: string[] = [];
    for (const c of cases.filter((k) => k.natalPlacidusCusps)) {
      const hs = housesOf(c.natalPlacidusCusps!);
      for (const [id, lon, house] of c.bodies) {
        n++;
        if (natalHouseOf(lon, hs) !== house) bad.push(`${c.id} ${id}`);
      }
    }
    assert.deepEqual(bad, []);
    assert.ok(n > 4000, `nokta ${n}`);
  });

  await t("B) eski etiketle çelişki yeniden üretilir: 298/302 haritada sağlayıcı değeri ≠ ilerletilmiş ASC'den tam burç; denetimin 'uyumsuz' listesi birebir", () => {
    let conflict = 0;
    for (const c of cases) {
      const diffs = c.bodies.filter(([, lon, h]) => progressedWholeSignHouse(lon, c.asc) !== h).map(([id, lon, h]) => `${id}:${h}≠${progressedWholeSignHouse(lon, c.asc)}`);
      if (diffs.length) conflict++;
      assert.equal(c.audit?.durum, diffs.length ? "FARK" : "ESLESME", c.id);
      const listed = /uyumsuz: ([^;]+);/.exec(c.audit?.not_ ?? "")?.[1].split(", ") ?? [];
      // Denetim notu ilk 5 uyumsuz noktayı listeler (aynı biçim: sağlayıcı≠beyan).
      assert.deepEqual(listed, diffs.slice(0, listed.length), c.id);
      if (diffs.length) assert.ok(listed.length > 0, c.id);
    }
    assert.equal(conflict, 298);
  });

  await t("C) 'İlerletilmiş harita evi (tam burç)' sütunu bağımsız hesapla 302/302; 'Natal ev' sütunu çerçeveyle ve çerçevesiz sağlayıcı değeriyle 299/299 aynı", () => {
    for (const c of cases) {
      const noFrame = progressionHouseColumns(techOf(c, false));
      assert.equal(noFrame.natal?.source, "provider");
      assert.equal(noFrame.natal?.label, "Natal ev (Placidus)");
      assert.equal(noFrame.progressed?.label, PROGRESSED_CHART_HOUSE_LABEL);
      for (const [id, lon, house] of c.bodies) {
        assert.equal(noFrame.progressed!.of(id), wsIndependent(lon, c.asc), `${c.id} ${id}`);
        assert.equal(noFrame.natal!.of(id), house, `${c.id} ${id}`);
      }
      if (!c.natalPlacidusCusps) continue;
      const framed = progressionHouseColumns(techOf(c, true));
      assert.equal(framed.natal?.source, "natal_frame");
      assert.equal(framed.natal?.label, "Natal ev (Placidus)");
      for (const [id, , house] of c.bodies) assert.equal(framed.natal!.of(id), house, `${c.id} ${id} çerçeve`);
    }
  });

  await t("D) çark = tablo: tek ilerletilmiş çarkın ev başlarına göre her nokta = 'İlerletilmiş harita evi' (302/302); çift halka evleri = 'Natal ev'", () => {
    for (const c of cases) {
      const single = wheelForTechnique("western.progression", techOf(c, false))!;
      assert.deepEqual(single.wheel.houses, progressedWholeSignCusps(c.asc));
      const cols = progressionHouseColumns(techOf(c, false));
      for (const [id, lon] of c.bodies) assert.equal(natalHouseOf(lon, single.wheel.houses), cols.progressed!.of(id), `${c.id} ${id} tek çark`);
      if (!c.natalPlacidusCusps) continue;
      const dbl = wheelForTechnique("western.progression", techOf(c, true))!;
      const fc = progressionHouseColumns(techOf(c, true));
      for (const [id, lon] of c.bodies) assert.equal(natalHouseOf(lon, dbl.wheel.houses), fc.natal!.of(id), `${c.id} ${id} çift halka`);
    }
  });

  await t("E) ekran: iki çerçeve ayrı ve doğru adlı başlıkla; eski 'Ev (ilerl.)' YOK; hücreler sütun fonksiyonlarıyla aynı; saat bilinmiyorsa iki sütun da yok", () => {
    const c = cases.find((k) => k.id.endsWith("TR-0291"))!;
    const html = renderToStaticMarkup(createElement(ProgressionPanel, { t: techOf(c, false) }));
    assert.ok(!html.includes("Ev (ilerl.)"));
    assert.ok(html.includes("Natal ev (Placidus)") && html.includes(PROGRESSED_CHART_HOUSE_LABEL));
    // Dar ekran (<640 px) kısa başlık + masaüstü tam başlık AYNI hücrede (owner kararı 14.11.2026, A seçeneği).
    assert.match(html, /<span class="sm:hidden" data-testid="astro-progression-chart-house-head-short">İlerl\. ev \(tam burç\)<\/span><span class="hidden sm:inline">İlerletilmiş harita evi \(tam burç\)<\/span>/);
    const natalCells = [...html.matchAll(/data-testid="astro-progression-natal-house">(\d+|—)</g)].map((m) => m[1]);
    const chartCells = [...html.matchAll(/data-testid="astro-progression-chart-house">(\d+|—)</g)].map((m) => m[1]);
    assert.deepEqual(natalCells, c.bodies.map(([, , h]) => String(h)));
    assert.deepEqual(chartCells, c.bodies.map(([, lon]) => String(wsIndependent(lon, c.asc))));
    // TR-0291 (denetim örneği): ilerletilmiş Güneş Boğa 15°, ilerletilmiş ASC Aslan → natal 12. ev, ilerletilmiş harita 10. ev.
    const sun = c.bodies.find(([id]) => id === "sun")!;
    assert.deepEqual([sun[2], progressedWholeSignHouse(sun[1], c.asc)], [12, 10]);
    const masked = maskTechnical("western.progression", techOf(c, true), { primary: false, partner: null } as J).technical as ProgressionTechnical;
    const mc = progressionHouseColumns(masked);
    assert.deepEqual([mc.natal, mc.progressed], [null, null]);
    const mhtml = renderToStaticMarkup(createElement(ProgressionPanel, { t: masked, timeUnknownMasked: true }));
    assert.ok(!mhtml.includes("astro-progression-natal-house") && !mhtml.includes("astro-progression-chart-house"));
  });

  await t("F) Word/PDF: aynı iki sütun + aynı değerler; eski tek 'Ev yöntemi' satırı YOK; yöntem notu Naibod'u ve iki çerçeveyi söyler", () => {
    for (const withFrame of [false, true]) {
      const c = cases.find((k) => k.id.endsWith("TR-0291"))!;
      const tech = techOf(c, withFrame);
      const r = buildAstroReport({ id: "x", title: "Sentetik", technique: "western.progression", params: { targetDate: c.targetDate, nodeType: "true" }, analysisAt: "2026-11-14T10:00:00Z", technical: tech, notes: [], knowledgeBank: [] });
      const tbl = r.blocks.find((b: J) => b.kind === "table" && b.table.columns.includes(PROGRESSED_CHART_HOUSE_LABEL)) as J;
      assert.ok(tbl, `tablo (çerçeve ${withFrame})`);
      const ni = tbl.table.columns.indexOf("Natal ev (Placidus)");
      const pi = tbl.table.columns.indexOf(PROGRESSED_CHART_HOUSE_LABEL);
      assert.ok(ni > 0 && pi > ni);
      assert.deepEqual(tbl.table.rows.map((row: string[]) => row[ni]), c.bodies.map(([, , h]) => `${h}. ev`));
      assert.deepEqual(tbl.table.rows.map((row: string[]) => row[pi]), c.bodies.map(([, lon]) => `${wsIndependent(lon, c.asc)}. ev`));
      const texts = reportTexts(r);
      assert.ok(!texts.includes("Ev yöntemi") && !texts.includes("İlerletilmiş Yükselen'den bütün-burç evleri"));
      assert.ok(texts.includes(PROGRESSION_METHOD_NOTE));
    }
    assert.match(PROGRESSION_METHOD_NOTE, /Naibod/);
    assert.match(PROGRESSION_METHOD_NOTE, /natal ev/);
    assert.match(PROGRESSION_METHOD_NOTE, /ilerletilmiş harita evi/);
    assert.ok(!/hizmet Yükselen\/MC yönteminin adını vermez/.test(PROGRESSION_METHOD_NOTE));
  });

  await t("G) kayıtlı katman / önbellek DEĞİŞMEZ: adaptör -1, gövde alanları aynı (houseSystem gönderilmez), houseMethod damgası aynen", () => {
    assert.equal(ROXY_PROGRESSION.adapter, "astro-roxy-progression-1");
    assert.equal(ROXY_PROGRESSION.projection, "progression-proj-1");
    const b = targetDateBody({ date: "1990-07-15", time: "14:30", latitude: 41.0082, longitude: 28.9784, timezone: 3, utcOffsetSeconds: 10800 } as J, "2026-10-07", "true");
    assert.ok(!("houseSystem" in b));
    assert.equal(techOf(cases[0], false).houseMethod, "whole_sign_from_progressed_ascendant");
  });

  console.log(`\nastrology ATL-B04 (progresyon ev çerçeveleri) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
