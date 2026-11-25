/**
 * I18N ATLAS-V — Vedik D1 / Varga / Vimshottari-KP Dasha panelleri + yoga denetim tablosu + kundli dil kapısı. Ağ / DB /
 * sağlayıcı YOK.
 *
 *   • TR BİREBİR: panellerin TR kataloğuyla HTML'i çeviri ÖNCESİ bileşenlerle (taban 26f217b9b) bayt-bayt aynı
 *     (fixtures/i18n/vedic-panels-tr-taban.json; D1 6 · varga 17 · dasha 11 · yoga tablosu 1 vaka). Dasha "bugün/şimdi"
 *     kararı için an sabitlenir (FROZEN_NOW; golden üretimi de aynı anla).
 *   • KUNDLİ DİL KAPISI (kundliLocalize / kundliData): TR çıktısı (graha/burç etiketi, gösterge, ipucu, mini-SVG DOM
 *     yerelleştirmesi) tabanla birebir; EN'de kütüphanenin İngilizce kısaltmaları korunur, Türkçe harf yok.
 *   • EN: Türkçe harf / ham anahtar yok — YALNIZ bilinen lib-kaynaklı metinler (yoga adı/kuralı/denetim ayrıntısı, BPHS kural
 *     cümlesi, KP düğüm yöntemi; çevirisi lib kataloğu işi) çıkarıldıktan sonra; dereceler ve tarih/sayılar TR = EN.
 *
 * Golden üretimi (yalnız tabanda, çeviri öncesi): ATLAS_GOLDEN_WRITE=1 npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-i18n.harness.ts
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup, type TestLocale } from "./intlRender";
import { vedicCases, freezeNow, type VedicCase } from "./atlasVedicCases";
import { VedicD1Panel, VedicDashaPanel, VedicVargaPanel } from "@/app/admin/astroloji/_components/VedicPanels";
import { VedicYogaTable } from "@/app/admin/astroloji/_components/VedicYogaTable";
import * as KL from "@/app/admin/astroloji/_lib/kundliLocalize";
import * as KD from "@/app/admin/astroloji/_lib/kundliData";
import { parseSvg, serializeStyledSvg } from "@/lib/astrology/report/figures";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { VEDIC_YOGA_FAMILY_LABELS } from "@/lib/astrology/model/vedic";
import * as VY from "@/lib/astrology/model/vedicYoga";
import { analyzeVedicYogas, vedicYogaTriggerText } from "@/lib/astrology/verify/vedicYoga";
import { BPHS_VARGA_RULES } from "@/lib/astrology/verify/varga";
import { KP_NODE_SIG_METHODS } from "@/lib/astrology/model/kp";

const FIX = join(__dirname, "fixtures");
const GOLDEN = join(FIX, "i18n", "vedic-panels-tr-taban.json");
const WRITE = process.env.ATLAS_GOLDEN_WRITE === "1";
const restore = freezeNow();

// Taban sürümünde fonksiyonlar locale argümanını almaz; JS fazla argümanı yok sayar (golden = eski davranış).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = (...a: any[]) => any;
const fnOf = (m: Record<string, unknown>, n: string) => m[n] as Loose;

const GRAHAS: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
const LIB_GRAHA = ["Su", "Mo", "Ma", "Me", "Ju", "Ve", "Sa", "Ra", "Ke"];
const TR_GRAHA = ["Gü", "Ay", "Ma", "Me", "Jü", "Ve", "Sa", "Ra", "Ke"];
const LIB_SIGN = ["Ar", "Ta", "Ge", "Cn", "Le", "Vi", "Li", "Sc", "Sg", "Cp", "Aq", "Pi"];

/** Kundli yardımcılarının dökümü (tüm girdi uzayı + sınır/bozuk girdiler). */
function kundliDump(locale: TestLocale): Record<string, unknown> {
  const L = KL as unknown as Record<string, unknown>;
  const D = KD as unknown as Record<string, unknown>;
  const labels: string[] = [];
  for (const a of [...LIB_GRAHA, ...TR_GRAHA, "Xx", "Lagna", "Asc"])
    for (const deg of ["", " 0°", " 9°", " 28°", " 29°"])
      for (const fl of ["", "ʳ", "ᶜ", "ʳᶜ", "ʷ", "ʳᶜʷ"])
        for (const compact of [false, true]) labels.push(`${a}${deg}${fl}|${compact}=${fnOf(L, "localizeGrahaLabel")(`${a}${deg}${fl}`, compact, locale)}`);
  const signs: string[] = [];
  for (const s of [...LIB_SIGN, "Koç", "Boğ", "Xy", "", " Ar ", "7 · Li", "12 · Pi", "1 · Ar", "3 · Zz", "Ar 7"]) signs.push(`${s}=${fnOf(L, "localizeSignLabel")(s, locale)}`);
  const legend = [GRAHAS, ["sun", "moon"], [], ["rahu", "ketu", "saturn"]].map((ids) => fnOf(L, "kundliLegend")(ids, locale));
  const pts = GRAHAS.map((id, i) => ({
    id,
    rashi: SIGN_IDS[(i * 5) % 12],
    longitude: (i * 37.123 + 3.5) % 360,
    nakshatra: { id: ["ashwini", "rohini", "magha", "hasta", "swati", "mula", "shravana", "revati", "ardra"][i], pada: (i % 4) + 1, lord: GRAHAS[(i + 3) % 9] },
    retrograde: i % 3 === 0,
    d1Rashi: SIGN_IDS[(i * 7) % 12],
  }));
  const titles = [
    fnOf(D, "kundliTitles")(pts, undefined, [], locale),
    fnOf(D, "kundliTitles")(pts, undefined, ["mercury", "venus"], locale),
    fnOf(D, "kundliTitles")(pts, 9, [], locale),
    fnOf(D, "kundliTitles")(pts.map((p) => ({ ...p, d1Rashi: undefined })), 60, ["sun"], locale),
  ];
  const svgTexts: string[][] = [];
  const svgs = (["north", "south", "east"] as const).map((style) => {
    const root = parseSvg(miniKundliSvg());
    fnOf(D, "localizeKundliDom")(root, titles[1], style, locale);
    // Ham metin düğümleri (rapor serileştiricisinin TR büyük harf dönüşümünden ÖNCE; dil kapısının çıktısı budur).
    const texts: string[] = [];
    const walk = (n: { nodeType: number; data?: string; childNodes?: unknown[] }) => {
      if (n.nodeType === 3) texts.push(n.data ?? "");
      else for (const c of (n.childNodes ?? []) as (typeof n)[]) walk(c);
    };
    walk(root as never);
    svgTexts.push(texts);
    return serializeStyledSvg(root, "X");
  });
  return { labels, signs, legend, titles, svgs, svgTexts, grahaTrName: GRAHAS.map((g) => KL.grahaTrName(g)) };
}

/** Kütüphane çıktısının localizeKundliDom'un dokunduğu yüzeyi kadar sentetik kundli SVG'si (kalabalık + seyrek hücre). */
function miniKundliSvg(): string {
  const cell = (planets: string[], sign: string, extra = "") =>
    `<g class="cell">${planets.map((p, i) => `<text class="planet-text" x="10" y="${20 + i * 10}">${p}<title>${["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"][LIB_GRAHA.indexOf(p.slice(0, 2))] ?? "Lagna"} · Leo 12° · Magha</title></text>`).join("")}<text class="sign-text" x="5" y="5">${sign}</text>${extra}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${[
    cell(["Su 28°ᶜ", "Mo 3°", "Ma"], "Ar", '<text class="lagna-marker" x="1" y="1">LAGNA</text>'),
    cell(["Me 12°ʳ"], "Ta"),
    cell(["Ju 1°", "Ve 2°ʷ", "Sa 3°ʳ", "Ra 4°ʳ", "Ke 5°ʳ"], "Ge"),
    cell([], "Cn", '<text class="rashi-num" x="2" y="2">7 · Li</text>'),
    cell(["Xx 9°"], "Pi"),
  ].join("")}</svg>`;
}

function render(c: VedicCase, locale: TestLocale): string {
  let el: ReactElement;
  if (c.kind === "d1") el = createElement(VedicD1Panel, { t: c.t, kbLookup: c.kb });
  else if (c.kind === "varga") el = createElement(VedicVargaPanel, { t: c.t, kbLookup: c.kb });
  else if (c.kind === "yoga") el = createElement(VedicYogaTable, { t: c.t });
  else
    el = createElement(VedicDashaPanel, {
      t: c.t,
      kbLookup: c.kb,
      ...(c.drill ? { drill: async () => ({ ok: false as const, error: "x" }) } : {}),
      ...(c.openLevel ? { onOpenLevel: () => undefined } : {}),
    });
  return renderToStaticMarkup(el, locale);
}

const cases = vedicCases(FIX);
if (WRITE) {
  const out = { taban: "26f217b9b", kundli: kundliDump("tr"), cases: Object.fromEntries(cases.map((c) => [c.name, render(c, "tr")])) };
  writeFileSync(GOLDEN, `${JSON.stringify(out, null, 1)}\n`);
  restore();
  console.log(`golden yazıldı: ${cases.length} vaka`);
  process.exit(0);
}

const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { kundli: Record<string, unknown>; cases: Record<string, string> };

// ── 1. Kundli dil kapısı ──
const kTr = kundliDump("tr");
for (const k of Object.keys(golden.kundli)) assert.deepEqual(kTr[k], golden.kundli[k], `kundli TR '${k}' tabanla aynı değil`);
const kEn = kundliDump("en");
const TRC = /[çğıöşüÇĞİÖŞÜ]/;
// Döküm "girdi=çıktı" biçimindedir (girdilerde Türkçe kısaltmalar da var) → yalnız ÇIKTI tarafı denetlenir.
const outPart = (x: string) => x.slice(x.lastIndexOf("=") + 1);
const enOut = JSON.stringify({ ...kEn, labels: (kEn.labels as string[]).map(outPart), signs: (kEn.signs as string[]).map(outPart), grahaTrName: [], svgs: [] });
assert.ok(!TRC.test(enOut), `kundli EN Türkçe: ${enOut.match(/\S{0,20}[çğıöşüÇĞİÖŞÜ]\S{0,20}/g)?.slice(0, 5)}`);
assert.equal(KL.localizeGrahaLabel("Su 28°ᶜ", false, "en"), "Su 28°ᶜ");
assert.equal(KL.localizeGrahaLabel("Su 28°ᶜ", true, "en"), "Suᶜ");
assert.equal(KL.localizeGrahaLabel("Gü 28°ʳ", false, "en"), "Su 28°ʳ", "TR etiket EN'e döner (dil değişimi)");
assert.equal(KL.localizeGrahaLabel("Su 28°ʳ", false, "tr"), "Gü 28°ʳ");
assert.equal(KL.localizeSignLabel("Ar", "en"), "Ar");
assert.equal(KL.localizeSignLabel("Koç", "en"), "Ar", "TR burç kısaltması EN'e döner");
assert.equal(KL.localizeSignLabel("7 · Ter", "en"), "7 · Li");
assert.equal(KL.kundliLegend(["sun", "rahu"], "en"), "Su = Sun / Surya · Ra = Rahu");
for (const g of GRAHAS) {
  assert.equal(KL.grahaName(g), KL.grahaTrName(g));
  assert.equal(KL.grahaAbbr(g), KL.GRAHA_TR[g].abbr);
}
for (const s of SIGN_IDS) assert.equal(KL.signAbbr(s), KL.SIGN_TR_ABBR[s]);
// EN idempotent: aynı fonksiyon iki kez uygulanınca değişmez (MutationObserver döngüsü yok).
for (const a of [...LIB_GRAHA, ...TR_GRAHA]) for (const c of [false, true]) {
  const once = KL.localizeGrahaLabel(`${a} 7°ʳ`, c, "en");
  assert.equal(KL.localizeGrahaLabel(once, c, "en"), once);
}

// ── 2. Paneller ──
assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(golden.cases).sort());
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const degs = (h: string) => (strip(h).match(/\d+°\d{2}′/g) ?? []).join(" ");
const dates = (h: string) => (strip(h).match(/\d{2}\.\d{2}\.\d{4}( \d{2}:\d{2})?/g) ?? []).join(" ");
// ATLAS-B / QA-ATLAS-R5 P2-2 (Owner A8/A13): EN tarih GG/AA/YYYY; aynı rakamlar TR GG.AA.YYYY ile (TR kilidi aynen). EN metinde (lib metni çıkarılmış) GG.AA.YYYY kalmaz.
const enAsTr = (h: string) => h.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, "$1.$2.$3");

// Bilinen lib-kaynaklı TR metinler (lib katalog işi; panel çevirisinin kapsamı dışında): EN denetiminden önce çıkarılır.
const libTexts = new Set<string>();
const addAll = (v: unknown) => {
  if (typeof v === "string") {
    if (TRC.test(v)) libTexts.add(v);
  } else if (v && typeof v === "object") for (const x of Object.values(v)) addAll(x);
};
addAll(VY);
addAll(VEDIC_YOGA_FAMILY_LABELS);
addAll(BPHS_VARGA_RULES);
addAll(KP_NODE_SIG_METHODS);
for (const c of cases) if (c.kind === "d1" || c.kind === "yoga") {
  addAll(c.t.yogas);
  const rows = analyzeVedicYogas(c.t);
  addAll(rows);
  for (const r of rows) addAll(vedicYogaTriggerText(r.triggers));
}
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
  // Bilgi Bankası kayıtları KULLANICI VERİSİDİR (uzmanın kendi metni; çevrilmez) → sentetik KB içeriği denetimden çıkarılır.
  rest = rest.replace(/Başlık [^<]*|Gövde \d+\nikinci satır|Konu \d+/g, " ");
  const txt = strip(rest);
  assert.ok(!TRC.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 10).join(" | ")}`);
  const attrs = (rest.match(/(title|aria-label|placeholder|alt)="[^"]*"/g) ?? []).join(" ");
  assert.ok(!TRC.test(attrs), `${c.name}: EN öznitelik Türkçe: ${attrs.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 6).join(" | ")}`);
  assert.ok(!/atlas\.vedic|terms\.|atlas\.kp/.test(strip(enHtml)), `${c.name}: ham anahtar`);
  assert.equal(degs(enHtml), degs(trHtml), `${c.name}: dereceler TR = EN`);
  assert.equal(dates(enAsTr(enHtml)), dates(trHtml), `${c.name}: tarihler TR = EN (EN "/" ayraçlı)`);
  assert.ok(!/\b\d{2}\.\d{2}\.\d{4}\b/.test(txt), `${c.name}: EN'de GG.AA.YYYY tarih: ${txt.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0]}`);
  // Kanonik öznitelikler (data-*) dil bağımsız.
  const data = (h: string) => (h.match(/data-[a-z-]+="[^"]*"/g) ?? []).join(" ");
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* öznitelikleri TR = EN`);
}
restore();
console.log(
  `✅ atlas-vedic-i18n: kundli dil kapısı TR = taban (${(golden.kundli.labels as unknown[]).length} etiket + burç/gösterge/ipucu/mini-SVG) · EN kütüphane kısaltması, Türkçe harfsiz, idempotent · ` +
    `TR HTML = taban ${trN}/${cases.length} vaka · EN Türkçe harfsiz (bilinen lib metni ${libUsed.size} farklı / ${libHits} geçiş çıkarıldı), ham anahtarsız, derece/tarih/data-* TR = EN`,
);
