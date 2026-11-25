/**
 * I18N ATLAS-V — Vedik eşleşme (Gun Milan + Manglik, Sade Sati, On Porutham/Dashakoot, Papasamyam) ve Vedik noktalar
 * (Upagraha — Mandi/Gulika, Heliakal) panelleri + yorum çerçeveleri. Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: TR kataloğuyla HTML çeviri ÖNCESİ bileşenlerle (taban 588d304fa) bayt-bayt aynı
 *     (fixtures/i18n/vedic-match-tr-taban.json).
 *   • EN: Türkçe harf / ham anahtar yok — YALNIZ bilinen lib-kaynaklı metinler (vedicMatch / vedicPorutham / vedicNoktalar
 *     model metinleri ve şablon fonksiyonlarının çıktıları; çevirisi lib katalog işi), danışan adları ve Bilgi Bankası
 *     kayıtları (kullanıcı verisi) çıkarıldıktan sonra; dereceler, sayılar ve data-* öznitelikleri TR = EN.
 *
 * Golden üretimi (yalnız tabanda, çeviri öncesi): ATLAS_GOLDEN_WRITE=1 npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-match-i18n.harness.ts
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-match-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup, type TestLocale } from "./intlRender";
import { matchCases, NAMES, type MatchCase } from "./atlasVedicMatchCases";
import { GunMilanInterpContent, GunMilanPanel, SadeSatiInterpContent, SadeSatiPanel } from "@/app/admin/astroloji/_components/VedicMatchPanels";
import { DashakootInterpContent, DashakootPanel, PapasamyamInterpContent, PapasamyamPanel } from "@/app/admin/astroloji/_components/VedicPoruthamPanels";
import { VedicHeliacalPanel, VedicUpagrahaPanel } from "@/app/admin/astroloji/_components/VedicNoktalarPanels";
import * as VM from "@/lib/astrology/model/vedicMatch";
import * as VP from "@/lib/astrology/model/vedicPorutham";
import * as VN from "@/lib/astrology/model/vedicNoktalar";

const FIX = join(__dirname, "fixtures");
const GOLDEN = join(FIX, "i18n", "vedic-match-tr-taban.json");
const WRITE = process.env.ATLAS_GOLDEN_WRITE === "1";

function render(c: MatchCase, locale: TestLocale): string {
  let el: ReactElement;
  switch (c.kind) {
    case "gun":
      el = createElement(GunMilanPanel, { t: c.t, names: NAMES });
      break;
    case "sade":
      el = createElement(SadeSatiPanel, { t: c.t, kbLookup: c.kb });
      break;
    case "dasha":
      el = createElement(DashakootPanel, { t: c.t, names: NAMES });
      break;
    case "papa":
      el = createElement(PapasamyamPanel, { t: c.t, names: NAMES });
      break;
    case "upa":
      el = createElement(VedicUpagrahaPanel, { t: c.t, kbLookup: c.kb });
      break;
    case "heli":
      el = createElement(VedicHeliacalPanel, { t: c.t, kbLookup: c.kb });
      break;
    case "gunInterp":
      el = createElement(GunMilanInterpContent, { c: c.c });
      break;
    case "sadeInterp":
      el = createElement(SadeSatiInterpContent, { c: c.c });
      break;
    case "dashaInterp":
      el = createElement(DashakootInterpContent, { c: c.c });
      break;
    default:
      el = createElement(PapasamyamInterpContent, { c: c.c });
  }
  return renderToStaticMarkup(el, locale);
}

const cases = matchCases(FIX);
if (WRITE) {
  const out = { taban: "588d304fa", cases: Object.fromEntries(cases.map((c) => [c.name, render(c, "tr")])) };
  writeFileSync(GOLDEN, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`golden yazıldı: ${cases.length} vaka`);
  process.exit(0);
}
const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { cases: Record<string, string> };

const TRC = /[çğıöşüÇĞİÖŞÜ]/;
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const nums = (h: string) => (strip(h).match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(",", ".")).join(" ");
// ATLAS-B / QA-ATLAS-R5 P2-2 (Owner A8/A13): EN tarih GG/AA/YYYY; aynı rakamlar TR GG.AA.YYYY ile (TR kilidi aynen). EN metinde (lib metni çıkarılmış) GG.AA.YYYY kalmaz.
const enAsTr = (h: string) => h.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, "$1.$2.$3");
const data = (h: string) => (h.match(/data-[a-z-]+="[^"]*"/g) ?? []).join(" ");

// Bilinen lib-kaynaklı TR metinler: model sabitleri + vaka verisinden üretilen şablon çıktıları (lib katalog işi).
const libTexts = new Set<string>();
const addAll = (v: unknown) => {
  if (typeof v === "string") {
    if (TRC.test(v)) libTexts.add(v);
  } else if (v && typeof v === "object") for (const x of Object.values(v)) addAll(x);
};
for (const m of [VM, VP, VN]) addAll(m);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = (...a: any[]) => any;
const fn = (m: Record<string, unknown>, n: string) => m[n] as Loose;
const P = VP as unknown as Record<string, unknown>;
const M = VM as unknown as Record<string, unknown>;
const N = VN as unknown as Record<string, unknown>;
for (const c of cases) {
  if (c.kind === "gun") {
    addAll(c.t);
    addAll(fn(M, "gunMilanAyanamsaNote")(fn(M, "gunMilanRoleNames")(c.t, NAMES)[0]));
  } else if (c.kind === "sade") addAll(c.t);
  else if (c.kind === "dasha") {
    addAll(c.t);
    const rn = fn(P, "poruthamRoleNames")(c.t, NAMES);
    addAll(fn(P, "poruthamAyanamsaNote")("dashakoot", rn[0]));
    addAll(fn(P, "rajjuReasonText")(c.t.rajju));
    addAll(fn(P, "vedhaReasonText")(c.t.vedha));
    addAll(fn(P, "dashakootMethodText")(c.t));
    for (const v of [true, false, null]) addAll(fn(P, "poruthamResultLabel")(v));
    const rc = c.t.rasiClassic;
    const lordRow = c.t.rows.find((r) => r.id === "rasyadhipati");
    if (rc) {
      addAll(fn(P, "rasiProviderText")(rc));
      if (lordRow) addAll(fn(P, "rasiPariharaText")(rc, [lordRow.person1.label, lordRow.person2.label]));
    }
  } else if (c.kind === "papa") {
    addAll(c.t);
    addAll(fn(P, "poruthamAyanamsaNote")("papasamyam", fn(P, "poruthamRoleNames")(c.t, NAMES)[0]));
  } else if (c.kind === "upa") {
    addAll(c.t);
    for (const p of [...c.t.timeBased, ...c.t.sunBased]) addAll(fn(N, "upagrahaBasis")(c.t, p.id));
    addAll(fn(N, "upagrahaSystemsNote")(c.t));
    addAll(fn(N, "upagrahaSchoolNote")(c.t));
  } else if (c.kind === "heli") {
    addAll(c.t);
    addAll(fn(N, "fmtDayTr")(c.t.date));
    addAll(fn(N, "heliacalPlaceText")(c.t.place));
    for (const g of c.t.grahas) for (const ev of [g.lastEvent, g.nextEvent]) if (ev) addAll(fn(N, "heliacalEventTimeText")(ev, c.t.place));
  }
}
for (const n of NAMES) libTexts.add(n);
// Evre şeridi kısa adı: SADE_SATI_PHASE_LABELS[ph].split(" (")[0] (lib değerinin ekrandaki kısaltması).
for (const v of Object.values(VM.SADE_SATI_PHASE_LABELS)) libTexts.add(v.split(" (")[0]);
const libSorted = [...libTexts].sort((a, b) => b.length - a.length);
const libUsed = new Set<string>();
let libHits = 0;

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
  // Bilgi Bankası kayıtları KULLANICI VERİSİDİR (uzmanın kendi metni) → sentetik KB içeriği denetimden çıkarılır.
  rest = rest.replace(/Başlık [^<]*|Gövde \d+\nikinci satır|Konu \d+/g, " ");
  const txt = strip(rest);
  assert.ok(!TRC.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 10).join(" | ")}`);
  const attrs = (rest.match(/(title|aria-label|placeholder|alt)="[^"]*"/g) ?? []).join(" ");
  assert.ok(!TRC.test(attrs), `${c.name}: EN öznitelik Türkçe`);
  assert.ok(!/atlas\.vedicMatch|terms\./.test(strip(enHtml)), `${c.name}: ham anahtar`);
  assert.equal(nums(enAsTr(enHtml)), nums(trHtml), `${c.name}: sayılar TR = EN (EN tarih "/" ayraçlı)`);
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* öznitelikleri TR = EN`);
}
// ATLAS-B (I18N-F1-R5): Gun Milan koota sınıfı — saklı TR etiket (KootaClass.label) EN'de kanonik koddan; kayıt şekli aynı.
{
  const trCat = (JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", "tr", "atlas.vedicMatch.json"), "utf8")) as { atlas: { vedicMatch: { kootaClass: Record<string, string> } } }).atlas.vedicMatch.kootaClass;
  const libVals = [...new Set(Object.values(VM.KOOTA_CLASS_LABELS))].sort();
  assert.deepEqual(Object.values(trCat).sort(), libVals, "kootaClass TR katalog = KOOTA_CLASS_LABELS değerleri (tek anlam kaynağı)");
  let rows = 0;
  for (const c of cases) {
    if (c.kind !== "gun") continue;
    const en = render(c, "en");
    for (const k of (c.t as VM.VedicGunMilanTechnical).kootas) {
      if (k.id === "tara") continue;
      const m = en.match(new RegExp(`data-testid="astro-koota-${k.id}"[\\s\\S]*?</tr>`));
      assert.ok(m, `${c.name}: ${k.id} satırı`);
      const tds = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1].replace(/<[^>]+>/g, ""));
      for (const cell of [tds[2], tds[3]]) assert.ok(!TRC.test(cell), `${c.name}: ${k.id} EN sınıf hücresi Türkçe: ${cell}`);
      rows++;
    }
  }
  assert.ok(rows > 0, "en az bir koota satırı denetlendi");
  console.log(`  koota sınıfı: TR katalog = lib (${libVals.length} sınıf) · EN ${rows} hücre çifti Türkçe harfsiz`);
}
console.log(
  `✅ atlas-vedic-match-i18n: TR HTML = taban ${trN}/${cases.length} vaka · EN Türkçe harfsiz (bilinen lib metni ${libUsed.size} farklı / ${libHits} geçiş + danışan adı + KB çıkarıldı), ham anahtarsız, sayılar/data-* TR = EN`,
);
