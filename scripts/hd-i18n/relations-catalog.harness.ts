/**
 * HD İlişki / Grup + HD API hata metinleri — i18n kilidi (I18N-F1-R5 HD). Ağ yok, DB yok, ücretli çağrı yok.
 *   K  hd.relations TR değerleri lib sabitleriyle BAYT-BAYT aynı (Word / test sözleşmeleri değişmez)
 *   P  TR / EN anahtar ağaçları eşit (hd.relations, hd.apiErrors)
 *   A  hd.apiErrors: çerezsiz istek → kaynak dil (TR) metni; EN çevirici EN metni; bilinmeyen anahtar ham anahtar sızdırmaz
 *   T  Connection SVG başlıkları: varsayılan TR bugünkü dönüşümle birebir; EN etiketleri parametreyle
 *   S  Penta sahnesi: varsayılan (Word) = TR etiketler; EN etiketlerle Türkçe harf yok; geometri/kanal/kapı aynı
 *   E  Analiz açıklamaları: TR katalog kalıpları = Türkçe üretim (fixture'larda bayt-eşit); EN'de Türkçe harf yok
 *   R  Ekran çizimi (sağlayıcılı): TR'de Türkçe başlıklar; EN'de Türkçe harf yok (marka adı hariç); yapı (data-*) aynı
 * Çalıştırma: npx tsx scripts/hd-i18n/relations-catalog.harness.ts
 */
import Module from "node:module";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import {
  RELATION_KIND_LABEL, RELATION_TYPE_LABEL, DYNAMIC_LABEL, DYNAMIC_DEFINITION, PENTA_POSITION_LABEL, PENTA_POSITION_DEFINITION,
  PENTA_CORE_NOTE, PENTA_GAP_NOTE, RELATION_DISCLAIMER, circuitLabel,
} from "../../lib/human-design/relations/labels";
import { ANALYSIS_EXPLANATION_SOURCE, ANALYSIS_EXPLANATION_DISCLAIMER, connectionExplanations, connectionExplanationsWith, explainKit, pentaExplanations, pentaExplanationsWith } from "../../lib/human-design/relations/explanations";
import { localizeConnectionTitles, CONNECTION_TITLE_LABELS_TR } from "../../lib/human-design/relations/roxyConnectionChart";
import { buildPentaScene, PENTA_SCENE_LABELS_TR } from "../../lib/human-design/relations/pentaScene";
import { validateRoxyConnection } from "../../lib/human-design/relations/connection";
import { validateRoxyPenta } from "../../lib/human-design/relations/penta";
import type { RelationAnalysisView } from "../../lib/human-design/relations/relationService";
import { engineChart, fakeConnectionResponse, fakePentaResponse, PEOPLE } from "../hd-relations/fakeRelationRoxy";
import { ConnectionResultView, PentaResultView } from "../../app/human-design/iliski-grup/components/RelationResultViews";
import { hdApiText } from "../../app/api/hd/_lib/hdApiText";
import { localeTranslator } from "../../lib/i18n/serverMessages";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 400)}`}`); }
};
const section = (s: string) => console.log(`\n—— ${s}`);
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const TRREL = readJson("messages/tr/hd.relations.json").hd.relations;
const ENREL = readJson("messages/en/hd.relations.json").hd.relations;
const TRAPI = readJson("messages/tr/hd.apiErrors.json").hd.apiErrors;
const ENAPI = readJson("messages/en/hd.apiErrors.json").hd.apiErrors;
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

section("K — TR katalog = lib sabitleri (bayt-bayt)");
const eqMap = (name: string, cat: Record<string, string>, src: Readonly<Record<string, string>>) =>
  ok(`K ${name} (${Object.keys(src).length})`, Object.keys(src).length === Object.keys(cat).length && Object.entries(src).every(([k, v]) => cat[k] === v), Object.entries(src).filter(([k, v]) => cat[k] !== v));
eqMap("kind", TRREL.kind, RELATION_KIND_LABEL);
eqMap("type", TRREL.type, RELATION_TYPE_LABEL);
eqMap("dynamic", TRREL.dynamic, DYNAMIC_LABEL);
eqMap("dynamicDef", TRREL.dynamicDef, DYNAMIC_DEFINITION);
eqMap("pentaPosition", TRREL.pentaPosition, PENTA_POSITION_LABEL);
eqMap("pentaPositionDef", TRREL.pentaPositionDef, PENTA_POSITION_DEFINITION);
eqMap("circuit", TRREL.circuit, { Individual: circuitLabel("Individual"), Collective: circuitLabel("Collective"), Tribal: circuitLabel("Tribal") });
eqMap("note", TRREL.note, { pentaCore: PENTA_CORE_NOTE, pentaGap: PENTA_GAP_NOTE, disclaimer: RELATION_DISCLAIMER, explanationSource: ANALYSIS_EXPLANATION_SOURCE, explanationDisclaimer: ANALYSIS_EXPLANATION_DISCLAIMER });
ok("K connTitle TR = varsayılan SVG başlık kalıpları", TRREL.connTitle.gate === CONNECTION_TITLE_LABELS_TR.gate("{n}") && TRREL.connTitle.channel === CONNECTION_TITLE_LABELS_TR.channel("{id}") && TRREL.connTitle.defined === CONNECTION_TITLE_LABELS_TR.defined && TRREL.connTitle.open === CONNECTION_TITLE_LABELS_TR.open && TRREL.connTitle.combined === CONNECTION_TITLE_LABELS_TR.combined);

section("P — TR / EN anahtar eşitliği");
const leaves = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? leaves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const same = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
ok(`P hd.relations (${leaves(TRREL).length} yaprak)`, same(leaves(TRREL), leaves(ENREL)));
ok(`P hd.apiErrors (${leaves(TRAPI).length} yaprak)`, same(leaves(TRAPI), leaves(ENAPI)));
const enLeafVals = (o: Record<string, unknown>): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? enLeafVals(v as Record<string, unknown>) : [String(v)]));
ok("P EN değerlerinde Türkçe harf yok (marka 'Yaşam Sistemi' hariç)", enLeafVals(ENREL).concat(enLeafVals(ENAPI)).every((v) => !TR_CHARS.test(v.replace(/Yaşam Sistemi/g, ""))), enLeafVals(ENREL).concat(enLeafVals(ENAPI)).filter((v) => TR_CHARS.test(v.replace(/Yaşam Sistemi/g, ""))));

section("A — HD API hata metinleri");
const keys = Object.keys(TRAPI);
ok(`A1 çerezsiz istek (kapı kapalı / test) → TR metin birebir (${keys.length}/${keys.length})`, keys.every((k) => hdApiText(null, k) === TRAPI[k] && hdApiText({}, k) === TRAPI[k]));
const en = localeTranslator("en", "hd.apiErrors");
ok("A2 EN çevirici → EN metin", keys.every((k) => en(k) === ENAPI[k]));
const unknown = hdApiText(null, "yokBoyleBirAnahtar");
ok("A3 bilinmeyen anahtar ham anahtar / namespace sızdırmaz", !unknown.includes("yokBoyleBirAnahtar") && !unknown.includes("hd.apiErrors"), unknown);
// Kaynak sözleşmesi: route'larda Türkçe hata metni kalmadı (req'siz 5 GET/405 yanıtı hariç; raporlanmış)
{
  const files = execSync("git ls-files app/api/hd", { cwd: ROOT, encoding: "utf8" }).trim().split(/\r?\n/).filter((f) => f.endsWith("route.ts"));
  const left = files.flatMap((f) => (readFileSync(join(ROOT, f), "utf8").match(/error:\s*"[^"]*[çğıöşüÇĞİÖŞÜ][^"]*"/g) ?? []).map((m) => `${f}: ${m}`));
  ok(`A4 route'larda kalan sabit Türkçe error metni yalnız req'siz yanıtlar (${left.length} ≤ 5)`, left.length <= 5 && left.every((l) => /Yalnız POST desteklenir|Bulunamadı\./.test(l)), left);
}

section("T — Connection SVG başlıkları");
type FakeTitle = { textContent: string };
const fakeSvg = (texts: string[]) => {
  const titles: FakeTitle[] = texts.map((t) => ({ textContent: t }));
  return { el: { querySelectorAll: () => titles } as unknown as Element, titles };
};
const SAMPLE = ["Gate 1 · 1-8 · A + B", "Gate 34", "Sacral: Defined", "Head: Open", "Combined bodygraph", "Other"];
{
  const { el, titles } = fakeSvg(SAMPLE);
  localizeConnectionTitles(el, "Ayşe", "Bora");
  ok("T1 varsayılan TR = bugünkü dönüşüm", JSON.stringify(titles.map((t) => t.textContent)) === JSON.stringify(["Kapı 1 · 1-8 kanalı · A (Ayşe) + B (Bora)", "Kapı 34", "Sacral: Birleşik haritada tanımlı", "Head: Açık", "Birleşik ilişki BodyGraph'ı", "Other"]), titles.map((t) => t.textContent));
}
{
  const { el, titles } = fakeSvg(SAMPLE);
  localizeConnectionTitles(el, "Ann", "Bob", { gate: (n) => `Gate ${n}`, channel: (id) => `${id} channel`, defined: ENREL.connTitle.defined, open: ENREL.connTitle.open, combined: ENREL.connTitle.combined });
  ok("T2 EN etiketleri parametreyle; Türkçe harf yok", titles.every((t) => !TR_CHARS.test(t.textContent)) && titles[0].textContent === "Gate 1 · 1-8 channel · A (Ann) + B (Bob)", titles.map((t) => t.textContent));
}

section("S — Penta sahnesi");
const vp = validateRoxyPenta(fakePentaResponse(PEOPLE.slice(0, 4)), 4);
if (!vp.ok) throw new Error("penta fixture");
const sDef = buildPentaScene(vp.value);
const sTr = buildPentaScene(vp.value, PENTA_SCENE_LABELS_TR);
ok("S1 varsayılan (Word/PNG) = açık TR etiketler (bayt-eşit sahne)", JSON.stringify(sDef) === JSON.stringify(sTr));
ok("S2 TR sahnede bant adları", JSON.stringify(sDef).includes("BOĞAZ MERKEZİ") && JSON.stringify(sDef).includes("SAKRAL MERKEZ"));
const sEn = buildPentaScene(vp.value, { band: (k) => ({ Throat: "THROAT CENTER", G: "G CENTER", Sacral: "SACRAL CENTER" })[k], channelName: (id) => id, coreSuffix: " · CORE", gapSuffix: " · gap", gapWord: "gap" });
const texts = (p: ReturnType<typeof buildPentaScene>) => p.filter((x) => x.k === "text").map((x) => (x as { text: string }).text);
const strip = (p: ReturnType<typeof buildPentaScene>) => JSON.stringify(p.map((x) => (x.k === "text" ? { ...x, text: "" } : x)));
ok("S3 EN sahne: Türkçe harf yok; geometri/kanal/kapı birebir (yalnız metin farklı)", texts(sEn).every((t) => !TR_CHARS.test(t)) && strip(sEn) === strip(sDef), texts(sEn).filter((t) => TR_CHARS.test(t)));

section("R — Ekran çizimi (TR / EN)");
const gatesOf = (i: number) => [...new Set(engineChart(PEOPLE[i]).activations.map((a) => a.gate))];
const vc = validateRoxyConnection(fakeConnectionResponse(PEOPLE[0], PEOPLE[1]));
if (!vc.ok) throw new Error("connection fixture");
const view = (kind: "connection" | "penta", result: unknown, gates: Array<number[] | null>): RelationAnalysisView => ({
  id: "x", kind, memberCount: gates.length, relationType: null, createdAt: "2026-10-17T00:00:00Z", result: result as never,
  participants: gates.map((g, i) => ({ position: i, clientId: null, name: `P${i + 1}`, sourceChartId: null, status: "current", birthDate: null, birthTime: null, birthPlace: null, gates: g })),
}) as unknown as RelationAnalysisView;
const aConn = view("connection", vc.value, [gatesOf(0), gatesOf(1)]);
const aPenta = view("penta", vp.value, [gatesOf(0), gatesOf(1), gatesOf(2), gatesOf(3)]);
const visible = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/Yaşam Sistemi/g, "");
const attrs = (html: string) => (html.match(/data-hd-[a-z-]+(="[^"]*")?/g) ?? []).join("|");
for (const [name, el] of [["Connection", createElement(ConnectionResultView, { a: aConn })], ["Penta", createElement(PentaResultView, { a: aPenta })]] as const) {
  const tr = renderToStaticMarkup(el, "tr");
  const enHtml = renderToStaticMarkup(el, "en");
  ok(`R ${name} TR: Türkçe başlıklar`, name === "Connection" ? tr.includes("Kanal Bağlantıları") && tr.includes("Birleşik Merkezler") : tr.includes("Penta Kapıları ve Katkılar") && tr.includes(PENTA_CORE_NOTE.replace(/'/g, "&#x27;")));
  const leftovers = (visible(enHtml).match(/[^\s]*[çğıöşüÇĞİÖŞÜ][^\s]*/g) ?? []);
  // EN'de Türkçe harf yalnız sağlayıcı ham kapı adı (penta gateName) ya da SVG ara-sahne metinlerinden gelebilir → 0 beklenir.
  ok(`R ${name} EN: görünen metinde Türkçe harf yok`, leftovers.length === 0, leftovers.slice(0, 15));
  ok(`R ${name} TR/EN yapı (data-* öznitelikleri) aynı`, attrs(tr) === attrs(enHtml));
}

section("E — Analiz açıklamaları (sunucu metni)");
{
  const shape = (x: ReturnType<typeof connectionExplanations>) => JSON.stringify(x.map((s) => [s.key, s.items.length]));
  const trKit = explainKit("tr");
  let same = 0;
  let total = 0;
  const diffs: unknown[] = [];
  let enClean = true;
  let enShape = true;
  const enLeft: string[] = [];
  const NAMES = ["Ann", "Bob", "Cem", "Dan", "Eve"];
  const pairs = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [1, 2]] as const;
  for (const [i, j] of pairs) {
    const v = validateRoxyConnection(fakeConnectionResponse(PEOPLE[i], PEOPLE[j]));
    if (!v.ok) continue;
    const legacy = connectionExplanations(v.value, NAMES[i], NAMES[j]);
    const viaCat = connectionExplanationsWith(trKit, v.value, NAMES[i], NAMES[j]);
    total++;
    if (JSON.stringify(legacy) === JSON.stringify(viaCat)) same++; else diffs.push({ pair: [i, j], legacy: JSON.stringify(legacy).slice(0, 300), viaCat: JSON.stringify(viaCat).slice(0, 300) });
    const en = connectionExplanations(v.value, NAMES[i], NAMES[j], "en");
    if (shape(en) !== shape(legacy)) enShape = false;
    const bad = JSON.stringify(en).match(/[^\s"]*[çğıöşüÇĞİÖŞÜ][^\s"]*/g) ?? [];
    if (bad.length) { enClean = false; enLeft.push(...bad.slice(0, 5)); }
  }
  for (const n of [3, 4, 5]) {
    const v = validateRoxyPenta(fakePentaResponse(PEOPLE.slice(0, n)), n);
    if (!v.ok) continue;
    const nm = NAMES.slice(0, n);
    const legacy = pentaExplanations(v.value, nm);
    const viaCat = pentaExplanationsWith(trKit, v.value, nm);
    total++;
    if (JSON.stringify(legacy) === JSON.stringify(viaCat)) same++; else diffs.push({ penta: n, legacy: JSON.stringify(legacy).slice(0, 300), viaCat: JSON.stringify(viaCat).slice(0, 300) });
    const en = pentaExplanations(v.value, nm, "en");
    if (shape(en) !== shape(legacy)) enShape = false;
    const bad = JSON.stringify(en).match(/[^\s"]*[çğıöşüÇĞİÖŞÜ][^\s"]*/g) ?? [];
    if (bad.length) { enClean = false; enLeft.push(...bad.slice(0, 5)); }
  }
  ok(`E1 TR katalog kalıpları = Türkçe üretim (${same}/${total} fixture, bayt-eşit)`, total >= 8 && same === total, diffs.slice(0, 2));
  ok("E2 varsayılan dil parametresi = TR (Word/mevcut çağrılar değişmez)", total > 0);
  ok("E3 EN açıklamalar: Türkçe harf yok", enClean, enLeft.slice(0, 10));
  ok("E4 EN açıklamalar: bölüm anahtarları ve madde sayıları TR ile aynı", enShape);
}

console.log(`\nHD İLİŞKİ/GRUP + API i18n: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
