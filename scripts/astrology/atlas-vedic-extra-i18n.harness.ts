/**
 * I18N ATLAS-V — Vedik ek paneller: Graha Drishti · Gochara · Ashtakavarga · Shadbala · Janma Panchanga (+ ayrıntılı gün,
 * Hora / Choghadiya). Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: panellerin TR kataloğuyla HTML'i çeviri ÖNCESİ bileşenlerle (taban 588d304fa) bayt-bayt aynı
 *     (fixtures/i18n/vedic-extra-tr-taban.json).
 *   • EN: Türkçe harf / ham anahtar yok — YALNIZ bilinen lib-kaynaklı metinler (Gochara özeti / terimleri, Hora notu; lib katalog
 *     işi) ve Bilgi Bankası kullanıcı verisi çıkarıldıktan sonra; dereceler, tarih/saatler ve data-* öznitelikleri TR = EN.
 *
 * Golden üretimi (yalnız çeviri öncesi): ATLAS_GOLDEN_WRITE=1 npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-extra-i18n.harness.ts
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-extra-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup, type TestLocale } from "./intlRender";
import { freezeNow } from "./atlasVedicCases";
import { vedicExtraCases, type VedicExtraCase } from "./atlasVedicExtraCases";
import { VedicAshtakavargaPanel, VedicDrishtiPanel, VedicPanchangaPanel, VedicShadbalaPanel, VedicTransitPanel } from "@/app/admin/astroloji/_components/VedicExtraPanels";
import { PanchangaHoursView } from "@/app/admin/astroloji/_components/PanchangaHoursPanels";
import { GOCHARA_SUMMARY_NOTE, GOCHARA_TERMS, gocharaSummary } from "@/lib/astrology/gocharaSummary";
import { PANCHANGA_HOURS_NOTE } from "@/lib/astrology/model/panchangaHours";

const FIX = join(__dirname, "fixtures");
const GOLDEN = join(FIX, "i18n", "vedic-extra-tr-taban.json");
const WRITE = process.env.ATLAS_GOLDEN_WRITE === "1";
const restore = freezeNow();

function render(c: VedicExtraCase, locale: TestLocale): string {
  let el: ReactElement;
  if (c.kind === "drishti") el = createElement(VedicDrishtiPanel, { t: c.t, kbLookup: c.kb });
  else if (c.kind === "transit") el = createElement(VedicTransitPanel, { t: c.t, kbLookup: c.kb });
  else if (c.kind === "ashtakavarga") el = createElement(VedicAshtakavargaPanel, { t: c.t });
  else if (c.kind === "shadbala") el = createElement(VedicShadbalaPanel, { t: c.t, kbLookup: c.kb });
  else if (c.kind === "panchanga") el = createElement(VedicPanchangaPanel, { t: c.t, kbLookup: c.kb });
  else el = createElement(PanchangaHoursView, { h: c.h });
  return renderToStaticMarkup(el, locale);
}

const cases = vedicExtraCases(FIX);
if (WRITE) {
  const out = { taban: "588d304fa", cases: Object.fromEntries(cases.map((c) => [c.name, render(c, "tr")])) };
  writeFileSync(GOLDEN, `${JSON.stringify(out, null, 1)}\n`);
  restore();
  console.log(`golden yazıldı: ${cases.length} vaka`);
  process.exit(0);
}

const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { cases: Record<string, string> };
assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(golden.cases).sort());

const TRC = /[çğıöşüÇĞİÖŞÜ]/;
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const degs = (h: string) => (strip(h).match(/\d+°\d{2}′/g) ?? []).join(" ");
const dates = (h: string) => (strip(h).match(/\d{2}\.\d{2}\.\d{4}|\d{2}:\d{2}/g) ?? []).join(" ");
const data = (h: string) => (h.match(/data-[a-z-]+="[^"]*"/g) ?? []).join(" ");

// Bilinen lib-kaynaklı TR metinler (lib katalog işi; panel çevirisinin kapsamı dışında).
const libTexts = new Set<string>();
const addAll = (v: unknown) => {
  if (typeof v === "string") {
    if (TRC.test(v)) libTexts.add(v);
  } else if (v && typeof v === "object") for (const x of Object.values(v)) addAll(x);
};
addAll(GOCHARA_SUMMARY_NOTE);
addAll(GOCHARA_TERMS);
addAll(PANCHANGA_HOURS_NOTE);
for (const c of cases) if (c.kind === "transit") addAll(gocharaSummary(c.t).map((x) => x.text));
// Sağlayıcı verisi (ASTRO_PROVIDER_LANG="tr" yanıtı): nakshatra / tithi devata ve sembol adları — çevrilmez, aynen gösterilir.
for (const c of cases) if (c.kind === "panchanga") addAll([c.t.nakshatra.symbol, c.t.nakshatra.deity, c.t.tithi.deity]);
const libSorted = [...libTexts].sort((a, b) => b.length - a.length);
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
let libHits = 0;
const libUsed = new Set<string>();

let trN = 0;
for (const c of cases) {
  const trHtml = render(c, "tr");
  assert.equal(trHtml, golden.cases[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  trN++;
  const enHtml = render(c, "en");
  let rest = enHtml;
  for (const s of libSorted) {
    const e = escHtml(s);
    if (rest.includes(e)) {
      libHits += rest.split(e).length - 1;
      libUsed.add(s);
      rest = rest.split(e).join(" ");
    }
  }
  // Bilgi Bankası kayıtları ve yer etiketi KULLANICI VERİSİDİR (çevrilmez).
  rest = rest.replace(/Başlık [^<]*|Gövde \d+\nikinci satır|Konu \d+|İstanbul/g, " ");
  const txt = strip(rest);
  assert.ok(!TRC.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 10).join(" | ")}`);
  const attrs = (rest.match(/(title|aria-label|placeholder|alt)="[^"]*"/g) ?? []).join(" ");
  assert.ok(!TRC.test(attrs), `${c.name}: EN öznitelik Türkçe: ${attrs.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 6).join(" | ")}`);
  assert.ok(!/atlas\.vedicExtra|terms\./.test(strip(enHtml)), `${c.name}: ham anahtar`);
  assert.equal(degs(enHtml), degs(trHtml), `${c.name}: dereceler TR = EN`);
  assert.equal(dates(enHtml), dates(trHtml), `${c.name}: tarih/saat TR = EN`);
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* öznitelikleri TR = EN`);
}
restore();
console.log(
  `✅ atlas-vedic-extra-i18n: TR HTML = taban ${trN}/${cases.length} vaka · EN Türkçe harfsiz (bilinen lib metni ${libUsed.size} farklı / ${libHits} geçiş çıkarıldı), ham anahtarsız, derece/tarih/data-* TR = EN`,
);
