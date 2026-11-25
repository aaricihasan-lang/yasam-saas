/**
 * I18N ATLAS-V — Vedik aylık zamanlama paneli (`vedic.monthly`) ve seçici alanları çevirisi. Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: VedicMonthlyPanel / VedicMonthlyFields TR kataloğuyla HTML'i çeviri ÖNCESİ bileşenlerle (taban a789cbe47)
 *     bayt-bayt aynı (fixtures/i18n/vedic-monthly-tr-taban.json). Gerçek sağlayıcı golden yanıtları üretim normalizer'ı +
 *     combineTechnical ile birleştirilir.
 *   • KİLİT: Word/PDF ile ortak kod-anahtarlı lib etiketleri (bölüm / tür / deklinasyon türü / kısa graha adı / ay adları) ve
 *     yöntem metinleri TR katalog = lib değeri.
 *   • EN: Türkçe harf / ham anahtar yok — zaman çizelgesi olay cümleleri (lib monthlyTimeline) lib metni olarak çıkarıldıktan
 *     sonra; data-* TR = EN.
 *
 * Golden üretimi (yalnız tabanda): ATLAS_GOLDEN_WRITE=1 npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-monthly-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup, type TestLocale } from "./intlRender";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { projectRoxyVedicMonthlySection } from "@/lib/astrology/providers/roxy/vedicMonthly";
import * as VM from "@/lib/astrology/model/vedicMonthly";
import type { VedicMonthlySection, VedicMonthlyTechnical } from "@/lib/astrology/model/vedicMonthly";
import { VedicMonthlyPanel } from "@/app/admin/astroloji/_components/VedicMonthlyPanel";
import { VedicMonthlyFields } from "@/app/admin/astroloji/_components/VedicMonthlyFields";

const FIX = join(__dirname, "fixtures");
const GOLDEN = join(FIX, "i18n", "vedic-monthly-tr-taban.json");
const WRITE = process.env.ATLAS_GOLDEN_WRITE === "1";
type G = { response: unknown; body: Record<string, unknown> };
const g = (n: string): G => JSON.parse(readFileSync(join(FIX, "golden", `${n}.json`), "utf8"));

const def = getTechnique("vedic.monthly")!;
function tech(month: number, parts: [VedicMonthlySection, string][], sections: VedicMonthlySection[]): VedicMonthlyTechnical {
  const ps = parts.map(([s, f]) => {
    const r = projectRoxyVedicMonthlySection(s, g(f).response, g(f).body);
    if (!r.ok) throw new Error(`${f}: ${JSON.stringify(r.errors)}`);
    return r.technical;
  });
  return def.combineTechnical!(ps as never, { year: 2026, month, sections, ayanamsa: "lahiri", displayTz: "Europe/Istanbul" }) as VedicMonthlyTechnical;
}
const ALL4: VedicMonthlySection[] = ["ingress", "aspects", "lunar", "parallels"];
const feb = tech(2, [["ingress", "vedic-monthly-ingress-2026-02"], ["aspects", "vedic-monthly-aspects-2026-02"], ["lunar", "vedic-monthly-lunar-2026-02"], ["parallels", "vedic-monthly-parallels-2026-02"]], ALL4);
const mar = tech(3, [["ingress", "vedic-monthly-ingress-2026-03"], ["natal_parallels", "vedic-natal-parallels-a"]], ["ingress", "aspects", "natal_parallels"]);
const dec = tech(12, [["ingress", "vedic-monthly-ingress-2026-12"]], ["ingress"]);
type Kb = { topicKey: string; topicLabel: string; title: string; body: string };
const KB_FULL = (keys: string[]): Kb[] => keys.slice(0, 2).map((k, i) => ({ topicKey: k, topicLabel: `Konu ${i + 1}`, title: `Başlık ${k}`, body: `Gövde ${i + 1}\nikinci satır` }));
const params = (o: Record<string, unknown>) => ({ transitDate: "2026-02-10", ...o }) as never;

type Case = { name: string; el: () => ReactElement };
const cases: Case[] = [
  { name: "feb-all-ist", el: () => createElement(VedicMonthlyPanel, { t: feb, options: { displayTz: "Europe/Istanbul" }, kbLookup: null }) },
  { name: "feb-all-utc-kbempty", el: () => createElement(VedicMonthlyPanel, { t: feb, options: { displayTz: "UTC" }, kbLookup: () => [] }) },
  { name: "mar-natal-missing-kb", el: () => createElement(VedicMonthlyPanel, { t: mar, options: { displayTz: "America/New_York" }, kbLookup: KB_FULL }) },
  { name: "dec-ingress-kolkata", el: () => createElement(VedicMonthlyPanel, { t: dec, options: { displayTz: "Asia/Kolkata" } }) },
  { name: "fields-default", el: () => createElement(VedicMonthlyFields, { params: params({}), onParams: () => undefined }) },
  { name: "fields-natal-tz", el: () => createElement(VedicMonthlyFields, { params: params({ vedicMonthlyYear: 2026, vedicMonthlyMonth: 12, vedicMonthlySections: ["ingress", "natal_parallels"], vedicMonthlyTz: "Asia/Tokyo" }), onParams: () => undefined }) },
  { name: "fields-empty-bad", el: () => createElement(VedicMonthlyFields, { params: params({ vedicMonthlyYear: 1700, vedicMonthlyMonth: 1, vedicMonthlySections: [] }), onParams: () => undefined }) },
];

if (WRITE) {
  writeFileSync(GOLDEN, `${JSON.stringify({ taban: "a789cbe47", cases: Object.fromEntries(cases.map((c) => [c.name, renderToStaticMarkup(c.el(), "tr")])) }, null, 1)}\n`);
  console.log(`golden yazıldı: ${cases.length} vaka`);
  process.exit(0);
}
const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { cases: Record<string, string> };
const TRC = /[çğıöşüÇĞİÖŞÜ]/;

// ── KİLİT: lib ortak etiketleri / metinleri = TR katalog ──
type Tr = (key: string, values?: Record<string, string>) => string;
const T = (l: TestLocale) => createTranslator({ locale: l, messages: getCatalogMessages(l) as Record<string, never>, namespace: "atlas.vedicMonthly" as never }) as unknown as Tr;
const tr = T("tr");
const en = T("en");
const locks: [string, string][] = [
  ["text.method", VM.VEDIC_MONTHLY_METHOD_TEXT],
  ["text.window", VM.VEDIC_MONTHLY_WINDOW_TEXT],
  ["text.aspectVsDrishti", VM.ASPECT_VS_DRISHTI_TEXT],
  ["text.aspectZodiac", VM.ASPECT_ZODIAC_TEXT],
  ["text.declination", VM.DECLINATION_TEXT],
  ["text.parallelsSampling", VM.PARALLELS_SAMPLING_TEXT],
  ["text.station", VM.STATION_TEXT],
  ["text.natalDeclination", VM.NATAL_DECLINATION_TEXT],
  ...Object.entries(VM.VEDIC_MONTHLY_SECTION_LABELS).map(([k, v]) => [`section.${k}`, v] as [string, string]),
  ...Object.entries(VM.MONTHLY_KIND_LABELS).map(([k, v]) => [`kind.${k}`, v] as [string, string]),
  ...Object.entries(VM.DECLINATION_TYPE_LABELS).map(([k, v]) => [`declType.${k}`, v] as [string, string]),
  ...Object.entries(VM.MONTHLY_GRAHA_TR).map(([k, v]) => [`graha.${k}`, v] as [string, string]),
];
for (const [k, v] of locks) {
  assert.equal(tr(k), v, `kilit ${k}: TR katalog lib ile aynı değil`);
  assert.ok(!TRC.test(en(k)), `kilit ${k}: EN Türkçe: ${en(k).slice(0, 80)}`);
}
for (const s of ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"])
  assert.equal(VM.monthlySignTr(s), (getCatalogMessages("tr") as { terms: { zodiac: Record<string, string> } }).terms.zodiac[s], `monthlySignTr ${s} = terms.zodiac`);

// ── Paneller ──
assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(golden.cases).sort());
const lib = new Set<string>();
for (const t of [feb, mar, dec]) for (const x of VM.monthlyTimeline(t)) lib.add(x.text);
const libSorted = [...lib].sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const data = (h: string) => (h.match(/data-[a-z-]+="[^"]*"/g) ?? []).join(" ");
let libHits = 0;
for (const c of cases) {
  const trHtml = renderToStaticMarkup(c.el(), "tr");
  assert.equal(trHtml, golden.cases[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  const enHtml = renderToStaticMarkup(c.el(), "en");
  let rest = enHtml;
  for (const s of libSorted) {
    const e = esc(s);
    if (rest.includes(e)) {
      libHits += rest.split(e).length - 1;
      rest = rest.split(e).join(" ");
    }
  }
  rest = rest.replace(/Başlık [^<]*|Gövde \d+\nikinci satır|Konu \d+/g, " ");
  const txt = strip(rest);
  assert.ok(!TRC.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 10).join(" | ")}`);
  const attrs = (rest.match(/(title|aria-label|placeholder|alt)="[^"]*"/g) ?? []).join(" ");
  assert.ok(!TRC.test(attrs), `${c.name}: EN öznitelik Türkçe: ${attrs.slice(0, 200)}`);
  assert.ok(!/atlas\.vedicMonthly|terms\./.test(txt), `${c.name}: ham anahtar`);
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* TR = EN`);
}
console.log(`✅ atlas-vedic-monthly-i18n: TR HTML = taban ${cases.length}/${cases.length} vaka · ${locks.length} lib etiket/metin kilidi (TR katalog = Word/PDF ortak) · EN Türkçe harfsiz (lib zaman çizelgesi cümlesi ${lib.size} farklı / ${libHits} geçiş çıkarıldı), ham anahtarsız, data-* TR = EN`);
