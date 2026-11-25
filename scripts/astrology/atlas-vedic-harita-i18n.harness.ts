/**
 * I18N ATLAS-V — Vedik harita görünümleri (Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala) çevirisi. Ağ / DB /
 * sağlayıcı YOK.
 *
 *   • TR BİREBİR: panellerin TR kataloğuyla HTML'i çeviri ÖNCESİ bileşenlerle (taban 9cb860848) bayt-bayt aynı
 *     (fixtures/i18n/vedic-harita-tr-taban.json). Gerçek sağlayıcı golden yanıtları üretim normalizer'larıyla projekte edilir.
 *   • KİLİT: Word/PDF ile ortak lib notları / etiketleri (CHALIT_VS_D1_NOTE, CHALIT_KUNDLI_NOTE, ARUDHA_METHOD_NOTE,
 *     CHARA_KARAKA_METHOD_NOTE, BHAVA_BALA_*_NOTE, CHARA_KARAKA_SCHEME_LABELS, bhavaSystemLabel) TR katalog = lib değeri;
 *     chalitKundliTitles TR = taban (locale varsayılanı), EN Türkçe harfsiz.
 *   • EN: Türkçe harf / ham anahtar yok (KB kullanıcı verisi hariç); derece/sayı/data-* TR = EN (ondalık ayırıcı hariç).
 *
 * Golden üretimi (yalnız tabanda): ATLAS_GOLDEN_WRITE=1 npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-harita-i18n.harness.ts
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-vedic-harita-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup, type TestLocale } from "./intlRender";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { projectRoxyVedicArudha, projectRoxyVedicBhavaBala, projectRoxyVedicBhavChalit, projectRoxyVedicCharaKaraka } from "@/lib/astrology/providers/roxy/vedicHarita";
import * as VH from "@/lib/astrology/model/vedicHarita";
import type { VedicArudhaTechnical, VedicBhavaBalaTechnical, VedicBhavChalitTechnical, VedicCharaKarakaTechnical } from "@/lib/astrology/model/vedicHarita";
import { VedicArudhaPanel, VedicBhavaBalaPanel, VedicBhavChalitPanel, VedicCharaKarakaPanel } from "@/app/admin/astroloji/_components/VedicHaritaPanels";
import * as CK from "@/app/admin/astroloji/_lib/chalitKundli";

const FIX = join(__dirname, "fixtures");
const GOLDEN = join(FIX, "i18n", "vedic-harita-tr-taban.json");
const WRITE = process.env.ATLAS_GOLDEN_WRITE === "1";
const g = (n: string) => JSON.parse(readFileSync(join(FIX, "golden", `${n}.json`), "utf8")).response as unknown;
function ok<T>(r: { ok: boolean; technical?: T; errors?: string[] }, name: string): T {
  if (!r.ok || !r.technical) throw new Error(`${name}: ${JSON.stringify(r.errors)}`);
  return r.technical;
}
type Kb = { topicKey: string; topicLabel: string; title: string; body: string };
const KB_FULL = (keys: string[]): Kb[] => keys.slice(0, 2).map((k, i) => ({ topicKey: k, topicLabel: `Konu ${i + 1}`, title: `Başlık ${k}`, body: `Gövde ${i + 1}\nikinci satır` }));
const KB_EMPTY = (): Kb[] => [];

const chalit = ok<VedicBhavChalitTechnical>(projectRoxyVedicBhavChalit(g("vedic-bhav-chalit"), { ayanamsa: "lahiri" }), "chalit");
const k8 = ok<VedicCharaKarakaTechnical>(projectRoxyVedicCharaKaraka(g("vedic-chara-karakas-eight"), { ayanamsa: "lahiri", scheme: "eight" }), "k8");
const k7 = ok<VedicCharaKarakaTechnical>(projectRoxyVedicCharaKaraka(g("vedic-chara-karakas-seven"), { ayanamsa: "lahiri", scheme: "seven" }), "k7");
const arudha = ok<VedicArudhaTechnical>(projectRoxyVedicArudha(g("vedic-arudha"), { ayanamsa: "lahiri" }), "arudha");
const bala = ok<VedicBhavaBalaTechnical>(projectRoxyVedicBhavaBala(g("vedic-bhava-bala"), { ayanamsa: "lahiri" }), "bala");
const balaPolar = ok<VedicBhavaBalaTechnical>(projectRoxyVedicBhavaBala(g("vedic-bhava-bala-kutup-tromso"), { ayanamsa: "lahiri" }), "balaPolar");
// Görüntü dalları: istisna uygulanmış pada + bilinmeyen bhava yöntemi + bilinmeyen ayanamsa (aynen gösterilir).
const arudhaX: VedicArudhaTechnical = structuredClone(arudha);
arudhaX.padas = arudhaX.padas.map((p, i) => (i === 2 ? { ...p, exceptionApplied: !p.exceptionApplied } : p));
const chalitX: VedicBhavChalitTechnical = { ...structuredClone(chalit), houseSystem: "custom-x", frame: { ...chalit.frame, ayanamsa: "kp-old" as never } };

type Case = { name: string; el: () => ReactElement };
const cases: Case[] = [
  { name: "chalit-kb-null", el: () => createElement(VedicBhavChalitPanel, { t: chalit, kbLookup: null }) },
  { name: "chalit-kb-empty", el: () => createElement(VedicBhavChalitPanel, { t: chalit, kbLookup: KB_EMPTY }) },
  { name: "chalit-kb-full-x", el: () => createElement(VedicBhavChalitPanel, { t: chalitX, kbLookup: KB_FULL }) },
  { name: "chara-8-kb-null", el: () => createElement(VedicCharaKarakaPanel, { t: k8, kbLookup: null }) },
  { name: "chara-7-kb-full", el: () => createElement(VedicCharaKarakaPanel, { t: k7, kbLookup: KB_FULL }) },
  { name: "arudha-kb-empty", el: () => createElement(VedicArudhaPanel, { t: arudha, kbLookup: KB_EMPTY }) },
  { name: "arudha-exc-kb-full", el: () => createElement(VedicArudhaPanel, { t: arudhaX, kbLookup: KB_FULL }) },
  { name: "bala-kb-full", el: () => createElement(VedicBhavaBalaPanel, { t: bala, kbLookup: KB_FULL }) },
  { name: "bala-polar-kb-null", el: () => createElement(VedicBhavaBalaPanel, { t: balaPolar, kbLookup: null }) },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const titlesOf = (loc: TestLocale) => [chalit, chalitX].map((t) => (CK.chalitKundliTitles as (...a: any[]) => Record<string, string>)(t, loc));

if (WRITE) {
  const out = { taban: "9cb860848", titles: titlesOf("tr"), cases: Object.fromEntries(cases.map((c) => [c.name, renderToStaticMarkup(c.el(), "tr")])) };
  writeFileSync(GOLDEN, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`golden yazıldı: ${cases.length} vaka`);
  process.exit(0);
}
const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { titles: unknown; cases: Record<string, string> };
const TRC = /[çğıöşüÇĞİÖŞÜ]/;

// ── KİLİT: lib ortak notları / etiketleri = TR katalog ──
type Tr = (key: string, values?: Record<string, string>) => string;
const tr = createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as Record<string, never>, namespace: "atlas.vedicHarita" as never }) as unknown as Tr;
const en = createTranslator({ locale: "en", messages: getCatalogMessages("en") as Record<string, never>, namespace: "atlas.vedicHarita" as never }) as unknown as Tr;
const locks: [string, string][] = [
  ["note.chalitVsD1", VH.CHALIT_VS_D1_NOTE],
  ["note.chalitKundli", CK.CHALIT_KUNDLI_NOTE],
  ["note.arudhaMethod", VH.ARUDHA_METHOD_NOTE],
  ["note.charaMethod", VH.CHARA_KARAKA_METHOD_NOTE],
  ["note.balaVsShadbala", VH.BHAVA_BALA_VS_SHADBALA_NOTE],
  ["note.balaSchool", VH.BHAVA_BALA_SCHOOL_NOTE],
  ["scheme.eight", VH.CHARA_KARAKA_SCHEME_LABELS.eight],
  ["scheme.seven", VH.CHARA_KARAKA_SCHEME_LABELS.seven],
  ["bhavaSystem.sripati", VH.bhavaSystemLabel("sripati")],
  ["centre", CK.CHALIT_CENTRE_TEXT],
];
for (const [k, v] of locks) {
  assert.equal(tr(k), v, `kilit ${k}: TR katalog lib ile aynı değil`);
  assert.ok(!TRC.test(en(k)), `kilit ${k}: EN Türkçe`);
}
assert.deepEqual(Object.keys(VH.BHAVA_SYSTEM_LABELS), ["sripati"], "yeni bhava yöntemi eklendi → katalog kilidi güncellenmeli");

// ── chalitKundliTitles: TR = taban; EN Türkçe harfsiz ──
assert.deepEqual(titlesOf("tr"), golden.titles, "chalitKundliTitles TR tabanla aynı değil");
assert.ok(!TRC.test(JSON.stringify(titlesOf("en"))), `chalitKundliTitles EN Türkçe: ${JSON.stringify(titlesOf("en")).slice(0, 200)}`);

// ── Paneller ──
assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(golden.cases).sort());
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const degs = (h: string) => (strip(h).match(/\d+°\d{2}′/g) ?? []).join(" ");
const data = (h: string) => (h.match(/data-[a-z-]+="[^"]*"/g) ?? []).join(" ");
for (const c of cases) {
  const trHtml = renderToStaticMarkup(c.el(), "tr");
  assert.equal(trHtml, golden.cases[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  const enHtml = renderToStaticMarkup(c.el(), "en");
  const rest = enHtml.replace(/Başlık [^<]*|Gövde \d+\nikinci satır|Konu \d+/g, " ");
  const txt = strip(rest);
  assert.ok(!TRC.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 10).join(" | ")}`);
  assert.ok(!/atlas\.vedic|terms\./.test(txt), `${c.name}: ham anahtar`);
  assert.equal(degs(enHtml), degs(trHtml), `${c.name}: dereceler TR = EN`);
  assert.equal(data(enHtml), data(trHtml), `${c.name}: data-* TR = EN`);
  // Ondalık: TR virgül, EN nokta — aynı sayılar.
  const nums = (h: string, sep: string) => (strip(h).match(sep === "," ? /-?\d+,\d{2}(?!\d)/g : /-?\d+\.\d{2}(?!\d)/g) ?? []).map((x) => x.replace(",", "."));
  assert.deepEqual(nums(enHtml, "."), nums(trHtml, ","), `${c.name}: ondalık değerler TR = EN`);
}
console.log(`✅ atlas-vedic-harita-i18n: TR HTML = taban ${cases.length}/${cases.length} vaka · ${locks.length} lib not/etiket kilidi (TR katalog = Word/PDF ortak) · chalitKundliTitles TR = taban · EN Türkçe harfsiz, ham anahtarsız, derece/ondalık/data-* TR = EN`);
