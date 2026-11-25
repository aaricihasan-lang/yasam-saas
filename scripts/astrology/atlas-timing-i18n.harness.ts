/**
 * I18N mod-g — Progresyon / Solar Arc (+ ortak tablo yardımcıları: Return, Sinastri, Composite) çevirisi. Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: TechniqueTechnical'ın TR kataloğuyla HTML'i, çeviri ÖNCESİ TimingPanels'in (taban c616c371c) aynı girdilerle
 *     ürettiği HTML ile bayt-bayt aynı (fixtures/i18n/timing-panels-tr-taban.json; 14 vaka: progresyon çerçeveli/çerçevesiz/
 *     tam burç/maskeli/kutup (enlemli, enlemsiz)/eski kutup/eski mean/yerel mean, Solar Arc ±çerçeve, Solar Return, Sinastri, Composite).
 *   • KİLİT: atlas.timing TR değerleri, Word/PDF'in kullandığı lib sabitleriyle karakteri karakterine aynı (tek anlam kaynağı).
 *   • EN: çevrilen panellerde (progresyon, Solar Arc) Türkçe harf / ham anahtar yok; derece değerleri TR ile aynı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-timing-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { TechniqueTechnical } from "@/app/admin/astroloji/_components/TimingPanels";
import { timingCases } from "./atlasTimingCases";
import { MOTION_LABEL, PROGRESSION_ASPECT_RULE, PROGRESSION_METHOD_NOTE, SOLAR_ARC_ASPECT_RULE, SOLAR_ARC_METHOD_NOTE } from "@/lib/astrology/directionAspects";
import { LEGACY_MEAN_NODE_WARNING, LEGACY_POLAR_NATAL_HOUSE_LABEL, LEGACY_POLAR_NATAL_HOUSE_WARNING, MEAN_NODE_LOCAL_NOTE, polarNatalHouseNote } from "@/lib/astrology/progressionNodesText";
import { PROGRESSED_CHART_HOUSE_LABEL, PROGRESSED_CHART_HOUSE_METHOD, PROGRESSED_CHART_HOUSE_SHORT_LABEL } from "@/lib/astrology/progressionHouses";

const root = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");
type Tree = { [k: string]: string | Tree };
const trT = (JSON.parse(readFileSync(join(root, "messages/tr/atlas.timing.json"), "utf8")) as { atlas: { timing: Tree } }).atlas.timing;
const P = trT.progression as Record<string, string>;
const S = trT.solarArc as Record<string, string>;

// KİLİT: katalog TR = lib (Word/PDF) metni.
const lock: [string, string][] = [
  [P.methodNote, PROGRESSION_METHOD_NOTE],
  [P.aspectRule, PROGRESSION_ASPECT_RULE],
  [P.meanNodeNote, MEAN_NODE_LOCAL_NOTE],
  [P.legacyMeanNode, LEGACY_MEAN_NODE_WARNING],
  [P.legacyPolarWarning, LEGACY_POLAR_NATAL_HOUSE_WARNING],
  [P.natalHouseLegacyPolar, LEGACY_POLAR_NATAL_HOUSE_LABEL],
  [P.chartHouse, PROGRESSED_CHART_HOUSE_LABEL],
  [P.chartHouseShort, PROGRESSED_CHART_HOUSE_SHORT_LABEL],
  [P.chartHouseMethod, PROGRESSED_CHART_HOUSE_METHOD],
  [P.polarNote, polarNatalHouseNote(null)],
  [P.polarNoteLat.replace("{lat}", "69.7"), polarNatalHouseNote(69.65)],
  [S.methodNote, SOLAR_ARC_METHOD_NOTE],
  [S.aspectRule, SOLAR_ARC_ASPECT_RULE],
  [(trT.motion as Record<string, string>).applying, MOTION_LABEL.applying],
  [(trT.motion as Record<string, string>).separating, MOTION_LABEL.separating],
];
for (const [cat, lib] of lock) assert.equal(cat, lib, `katalog ≠ lib: ${lib.slice(0, 60)}`);

const golden = (JSON.parse(readFileSync(join(FIX, "i18n", "timing-panels-tr-taban.json"), "utf8")) as { cases: Record<string, string> }).cases;
const cases = timingCases(FIX);
assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(golden).sort(), "vaka seti = taban altını");
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const degs = (h: string) => (strip(h).match(/\d+°\d{2}′/g) ?? []).join(" ");
// Çevrilen paneller: progresyon + Solar Arc (D-Atlas) + Return / Sinastri / Composite (I18N-F1-R5 ATLAS-A).
// I18N-F1-R5 (ATLAS-A): Return / Sinastri / Composite panel metinleri de çevrildi → EN denetimi kapsamına alındı.
const translated = (c: { technique: string }) => ["western.progression", "western.solar_arc", "western.solar_return", "western.synastry", "western.composite"].includes(c.technique);
const translatedNow = (process.env.ATLAS_TIMING_SCOPE ?? "progression,solar_arc,solar_return,synastry,composite").split(",");

let tr = 0;
let en = 0;
for (const c of cases) {
  const el = createElement(TechniqueTechnical, { technique: c.technique, technical: c.technical, timeUnknownMasked: c.timeUnknownMasked, warnings: [], names: ["Sentetik A", "Sentetik B"], options: c.options ?? {} } as never);
  const trHtml = renderToStaticMarkup(el, "tr");
  assert.equal(trHtml, golden[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  tr++;
  const enHtml = renderToStaticMarkup(el, "en");
  assert.equal(degs(enHtml), degs(trHtml), `${c.name}: derece değerleri TR = EN`);
  if (translated(c) && translatedNow.includes(c.technique.split(".")[1])) {
    const txt = strip(enHtml);
    assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(txt), `${c.name}: EN çıktıda Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 6).join(" | ")}`);
    assert.ok(!/atlas\.timing|terms\./.test(txt), `${c.name}: ham anahtar`);
    en++;
  }
}
console.log(`✅ atlas-timing-i18n: kilit ${lock.length} metin (katalog TR = lib) · TR HTML = taban ${tr}/${cases.length} vaka · EN Türkçe harfsiz ${en} vaka (${translatedNow.join("+")}) · derece değerleri TR = EN`);
