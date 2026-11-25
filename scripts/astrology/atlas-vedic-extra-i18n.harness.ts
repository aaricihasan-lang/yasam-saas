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
import { projectRoxyVedicPanchanga } from "@/lib/astrology/providers/roxy/vedic";

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
// ATLAS-B / QA-ATLAS-R5 P2-2 (Owner A8/A13): EN tarih GG/AA/YYYY; aynı rakamlar TR GG.AA.YYYY ile (TR kilidi aynen). EN metinde (lib metni çıkarılmış) GG.AA.YYYY kalmaz.
const enAsTr = (h: string) => h.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, "$1.$2.$3");
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
// Sağlayıcı verisi (ASTRO_PROVIDER_LANG="tr" yanıtı): tithi devata adı (Sanskrit özel ad) aynen gösterilir.
// ATLAS-B (I18N-F1-R5): nakshatra devata / sembol artık EN'de nakshatra kimliğinden katalog → istisna listesinden ÇIKARILDI.
for (const c of cases) if (c.kind === "panchanga") addAll([c.t.tithi.deity]);
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
  assert.equal(dates(enAsTr(enHtml)), dates(trHtml), `${c.name}: tarih/saat TR = EN (EN "/" ayraçlı)`);
  assert.ok(!/\b\d{2}\.\d{2}\.\d{4}\b/.test(txt), `${c.name}: EN'de GG.AA.YYYY tarih: ${txt.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0]}`);
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* öznitelikleri TR = EN`);
}
// ATLAS-B (I18N-F1-R5): GERÇEK TR panchanga yanıtı (ROXY 25.11) — saklı yerelleştirilmiş metinler (tithi.element, nakshatra
// devata / sembol) TR ekranda aynen, EN ekranda kanonik eşlemeyle (element kodu; nakshatra kimliği → katalog). Saklı veri değişmez.
{
  const load = (l: string) => (JSON.parse(readFileSync(join(__dirname, "fixtures", "i18n", "roxy-tr-en-2026-11-25", `panchang-basic-p1-${l}.json`), "utf8")) as { response: unknown }).response;
  const pt = projectRoxyVedicPanchanga(structuredClone(load("tr")) as never) as { ok: boolean; technical: { nakshatra: { deity: string; symbol: string }; tithi: { element: string } } };
  assert.equal(pt.ok, true);
  const before = JSON.stringify(pt.technical);
  assert.deepEqual([pt.technical.nakshatra.deity, pt.technical.nakshatra.symbol, pt.technical.tithi.element], ["Soma (Ay tanrısı)", "Geyik Kafası", "Toprak"]);
  const el = createElement(VedicPanchangaPanel, { t: pt.technical as never });
  const tr = strip(renderToStaticMarkup(el, "tr"));
  const en = strip(renderToStaticMarkup(el, "en"));
  for (const x of ["devata: Soma (Ay tanrısı)", "sembol: Geyik Kafası", "element: Toprak"]) assert.ok(tr.includes(x), `TR saklı metin: ${x}`);
  for (const x of ["devata: Soma (the Moon god)", "symbol: Deer's Head", "element: Earth"]) assert.ok(en.includes(x), `EN kanonik: ${x} — ${en.match(/(deity|symbol|element): [^·]*/g)}`);
  assert.ok(!/Geyik|Toprak|tanrısı/.test(en), "EN'de saklı TR metin yok");
  assert.equal(JSON.stringify(pt.technical), before, "saklı teknik veri değişmedi");
  // Kanonik tablo: 27 nakshatra × devata/sembol iki dilde dolu; EN Türkçe harfsiz; Mrigashira EN = sağlayıcının gerçek EN metni.
  const en2 = (JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", "en", "atlas.vedicExtra.json"), "utf8")) as { atlas: { vedicExtra: Record<string, Record<string, string>> } }).atlas.vedicExtra;
  const real = load("en") as { nakshatra: { deity: string; symbol: string } };
  assert.equal(Object.keys(en2.nakshatraDeity).length, 27);
  assert.equal(Object.keys(en2.nakshatraSymbol).length, 27);
  assert.ok(Object.values({ ...en2.nakshatraDeity, ...en2.nakshatraSymbol }).every((v) => v && !TRC.test(v)));
  assert.deepEqual([en2.nakshatraDeity.mrigashira, en2.nakshatraSymbol.mrigashira], [real.nakshatra.deity, real.nakshatra.symbol]);
}
restore();
console.log(
  `✅ atlas-vedic-extra-i18n: TR HTML = taban ${trN}/${cases.length} vaka · EN Türkçe harfsiz (bilinen lib metni ${libUsed.size} farklı / ${libHits} geçiş çıkarıldı), ham anahtarsız, derece/tarih/data-* TR = EN`,
);
