/* eslint-disable @typescript-eslint/no-explicit-any -- test: katalog nesnelerine dinamik yol erişimi ve createTranslator tip daraltması */
/**
 * I18N-F1-R5 HD — Bilgi Bankası arayüzü + Transit ekranları dil kilidi (PG yok, ağ yok, ücretli çağrı yok).
 *   A) TR katalog değerleri mevcut kaynak metinlerle BAYT-BAYT aynı (kbFieldLabels, transitLabels, eski sabitler).
 *   B) Bilgi Bankası kategorisi: DB değeri Türkçe kanonik ("Tipler" …) — EN ekranında da <option value> / filtre / kayıt
 *      değeri AYNI TR kanonik; yalnız görünen ad çevrilir. Yapısal seçeneklerin kodu (opt.code) değişmez.
 *   C) Transit: TR ekranında lib etiketleri (merkez/kanal/gezegen/hata) aynen; EN'de Türkçe harf yok; hesap / önbellek
 *      koduna dokunulmadı (dil izolasyonu personal-harness'te).
 * Kullanım: npx tsx scripts/hd-i18n/kb-transit-i18n.harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "./intlRender";
import { getCatalogMessages } from "../../lib/i18n/catalog";
import {
  HD_KNOWLEDGE_CATEGORIES,
  HD_KNOWLEDGE_CATEGORY_PREFIX,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_GATES,
} from "../../lib/human-design/constants";
import { getStructuredCategoryOptions, hdCenterKnowledgeOptions, type StructuredOption } from "../../lib/human-design/codeHelpers";
import { KB_CONTENT_LABEL, KB_NOTES_HELP, KB_NOTES_LABEL, kbContentHelp } from "../../lib/human-design/knowledge/kbFieldLabels";
import {
  bodyLabel,
  GENERAL_TRANSIT_NOTE,
  NEAR_BOUNDARY_NOTE,
  transitCenterLabel,
  transitChannelLabel,
  UNCERTAIN_NOTE,
} from "../../lib/human-design/transit/transitLabels";
import { resolveTransitMoment, TRANSIT_TIME_ZONE } from "../../lib/human-design/transit/transitMoment";
import { CENTERS, CHANNELS } from "../../lib/human-design/engine/channels";
import { HD_PLANET_ORDER } from "../../lib/human-design/bodygraph/planetGlyphs";
import { useKbLabels } from "../../app/human-design/bilgi-bankasi/helpers/useKbLabels";
import { HdGateChannelNameField } from "../../app/human-design/bilgi-bankasi/components/HdGateChannelNameField";
import { useTransitI18n } from "../../app/human-design/transit/helpers/useTransitI18n";
import { MomentPicker } from "../../app/human-design/transit/components/MomentPicker";
import { TransitZonePanel, UtcPreview } from "../../app/human-design/transit/components/TransitZonePanel";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0;
let fail = 0;
const ok = (c: unknown, n: string, d?: unknown) => {
  if (c) {
    pass++;
    console.log(`  PASS ${n}`);
  } else {
    fail++;
    console.error(`  FAIL ${n}${d !== undefined ? " — " + JSON.stringify(d).slice(0, 500) : ""}`);
  }
};
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const tr = (ns: string) => createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as any, namespace: ns as never }) as any;
const en = (ns: string) => createTranslator({ locale: "en", messages: getCatalogMessages("en") as any, namespace: ns as never }) as any;
const decode = (h: string) => h.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (h: string) => decode(h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// ── A) TR katalog = kaynak metin ───────────────────────────────────────────────────────────────────────────────────
console.log("A) TR katalog değerleri kaynak metinle bayt-bayt aynı");
{
  const k = tr("hd.knowledge");
  const bad = HD_KNOWLEDGE_CATEGORIES.filter((c) => k(`category.${HD_KNOWLEDGE_CATEGORY_PREFIX[c]}`) !== c);
  ok(bad.length === 0, "A1 kategori: TR görünen ad = DB kanonik değer (9/9)", bad);
  ok(k("fields.contentLabel") === KB_CONTENT_LABEL && k("fields.notesLabel") === KB_NOTES_LABEL && k("fields.notesHelp") === KB_NOTES_HELP, "A2 alan adları + not yardımı = kbFieldLabels");
  const helpBad = [...HD_KNOWLEDGE_CATEGORIES, null].filter((c) => {
    const code = c ? HD_KNOWLEDGE_CATEGORY_PREFIX[c] : "none";
    return k("fields.contentHelp", { subject: k(`subject.${code}`) }) !== kbContentHelp(c);
  });
  ok(helpBad.length === 0, "A3 'Bilgi ve Açıklamalar' yardım metni her kategoride = kbContentHelp (10/10)", helpBad);
  const tt = tr("hd.transit");
  ok(tt("notes.general") === GENERAL_TRANSIT_NOTE && tt("notes.uncertain") === UNCERTAIN_NOTE && tt("notes.nearBoundary") === NEAR_BOUNDARY_NOTE, "A4 transit notları = transitLabels");
  const OLD_ZONE_INTRO = [
    "Türkiye saatine göre transit hesaplaması yapıyorsanız herhangi bir konum veya saat dilimi seçmenize gerek yoktur.",
    "Farklı bir ülkenin yerel tarih ve saatine göre hesaplama yapmak istiyorsanız ilgili şehir veya saat dilimini seçiniz.",
    "Sistem, seçtiğiniz bölgenin geçmiş ve güncel yaz/kış saati uygulamalarını dikkate alarak doğru zamanı otomatik hesaplar.",
  ].join(" ");
  ok(tt("zone.intro") === OLD_ZONE_INTRO, "A5 saat dilimi açıklaması = eski ZONE_INTRO.join(' ')");
  // Eski momentCaption: `${d}.${mo}.${y} saat ${time} (${zoneName}) için hesaplandı`
  ok(tt("caption", { date: "05.03.2026", time: "14:07", zone: tt("zone.turkeyTime") }) === "05.03.2026 saat 14:07 (Türkiye saati) için hesaplandı", "A6 sonuç başlığı TR biçimi eski momentCaption ile aynı");
  const r = resolveTransitMoment("2026-13-01", "10:00", TRANSIT_TIME_ZONE);
  ok(!r.ok && r.code === "INVALID_DATE", "A7 (ön koşul) geçersiz tarih kodu INVALID_DATE", r);
  const libErr = [
    ["INVALID_TIMEZONE", resolveTransitMoment("2026-01-01", "10:00", "Not/AZone")],
    ["DATE_OUT_OF_RANGE", resolveTransitMoment("1800-01-01", "10:00", TRANSIT_TIME_ZONE)],
  ] as const;
  ok(libErr.every(([code, x]) => !x.ok && x.code === code && tt(`errors.${code}`) === x.error), "A8 hata kodu TR katalog değeri = lib metni (INVALID_TIMEZONE, DATE_OUT_OF_RANGE)", libErr);
}

// ── B) Bilgi Bankası: kanonik değer dil-bağımsız ──────────────────────────────────────────────────────────────────
console.log("B) Bilgi Bankası kategori / seçenek değeri dil-bağımsız (yalnız görünen ad çevrilir)");
function KbProbe({ cat }: { cat: string }): ReactElement {
  const L = useKbLabels();
  const opts: StructuredOption[] = cat === "Merkezler" ? hdCenterKnowledgeOptions(true) : getStructuredCategoryOptions(cat) ?? [];
  return createElement(
    "div",
    null,
    createElement("select", { "data-cat": "1", defaultValue: "" }, HD_KNOWLEDGE_CATEGORIES.map((c) => createElement("option", { key: c, value: c }, L.category(c)))),
    createElement("select", { "data-opt": "1", defaultValue: "" }, opts.map((o) => createElement("option", { key: o.code, value: o.code }, L.option(cat, o)))),
  );
}
const optionsOf = (html: string, attr: string) => {
  const sel = new RegExp(`<select[^>]*${attr}[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? "";
  return [...sel.matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map((m) => [decode(m[1]), textOf(m[2])] as const);
};
{
  const hTr = renderToStaticMarkup(createElement(KbProbe, { cat: "Tipler" }), "tr");
  const hEn = renderToStaticMarkup(createElement(KbProbe, { cat: "Tipler" }), "en");
  const cTr = optionsOf(hTr, "data-cat");
  const cEn = optionsOf(hEn, "data-cat");
  ok(cTr.length === 9 && cTr.every(([v, t]) => v === t && (HD_KNOWLEDGE_CATEGORIES as readonly string[]).includes(v)), "B1 TR: kategori option value = metin = DB kanonik", cTr);
  ok(cEn.length === 9 && cEn.every(([v], i) => v === HD_KNOWLEDGE_CATEGORIES[i]), "B2 EN: kategori option VALUE hâlâ TR kanonik (filtre/kayıt değeri değişmez)", cEn);
  ok(cEn.every(([, t]) => !TR_CHARS.test(t)) && cEn.map(([, t]) => t).join("|") === "Types|Authorities|Profiles|Definitions|Centers|Channels|Gates|Strategies|General Notes", "B3 EN: kategori görünen adları İngilizce", cEn);
  for (const cat of ["Tipler", "Otoriteler", "Profiller", "Tanımlar", "Merkezler", "Kanallar", "Kapılar"]) {
    const base = cat === "Merkezler" ? hdCenterKnowledgeOptions(true) : getStructuredCategoryOptions(cat)!;
    const oTr = optionsOf(renderToStaticMarkup(createElement(KbProbe, { cat }), "tr"), "data-opt");
    const oEn = optionsOf(renderToStaticMarkup(createElement(KbProbe, { cat }), "en"), "data-opt");
    ok(oTr.length === base.length && oTr.every(([v, t], i) => v === base[i].code && t === base[i].label), `B4 TR ${cat}: seçenek kodu + metni kaynakla aynı (${base.length})`);
    ok(oEn.length === base.length && oEn.every(([v], i) => v === base[i].code) && oEn.every(([, t]) => t.length > 0 && !TR_CHARS.test(t)), `B5 EN ${cat}: seçenek KODU aynı, metin İngilizce`, oEn.filter(([, t]) => TR_CHARS.test(t)).slice(0, 5));
  }
  const mEn = optionsOf(renderToStaticMarkup(createElement(KbProbe, { cat: "Merkezler" }), "en"), "data-opt");
  ok(mEn.some(([v, t]) => v === "tanimli_head" && t === "Defined — Head Center") && mEn.some(([v, t]) => v === "acik_head" && t.startsWith("Legacy general record")), "B6 EN merkez seçeneği: 'Defined — Head Center' (kod tanimli_head), eski genel kayıt ayrı etiketli");
  const nf = (loc: "tr" | "en", category: string) =>
    renderToStaticMarkup(createElement(HdGateChannelNameField, { category, structuredValue: "", name: "", onPick: () => {}, onName: () => {}, fieldBase: "", labelCls: "" }), loc);
  const gTr = optionsOf(nf("tr", "Kapılar"), "data-hd-kb-identity");
  const gEn = optionsOf(nf("en", "Kapılar"), "data-hd-kb-identity");
  ok(gTr.length === 65 && gTr.slice(1).every(([v, t], i) => v === String(HUMAN_DESIGN_GATES[i].code) && t === HUMAN_DESIGN_GATES[i].label), "B7 TR kapı alanı: 64 kapı, değer + metin kaynakla aynı");
  ok(gEn.length === 65 && gEn.slice(1).every(([v, t], i) => v === String(HUMAN_DESIGN_GATES[i].code) && t === `Gate ${HUMAN_DESIGN_GATES[i].code}`), "B8 EN kapı alanı: değer aynı, metin 'Gate N'");
  const chEn = optionsOf(nf("en", "Kanallar"), "data-hd-kb-identity");
  ok(chEn.length === 37 && chEn.slice(1).every(([v, t], i) => v === (HUMAN_DESIGN_CHANNELS[i].code as string).replace(/-/g, "_") && !TR_CHARS.test(t)), "B9 EN kanal alanı: değer aynı (a_b), metin İngilizce");
  ok(/Kapı numarası sabittir/.test(textOf(nf("tr", "Kapılar"))) && /The gate number is fixed/.test(textOf(nf("en", "Kapılar"))), "B10 ad alanı açıklaması TR/EN");
  // Kayıt / filtre / sorgu yolu kategori değerini çevirmeden kullanır (statik).
  const list = src("app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx");
  const form = src("app/human-design/bilgi-bankasi/components/HdBilgiKayitForm.tsx");
  const editor = src("app/human-design/bilgi-bankasi/[recordId]/HdKayitEditor.tsx");
  ok(/row\.category !== categoryFilter/.test(list) && /<option key=\{cat\} value=\{cat\}>/.test(list), "B11 liste filtresi DB kanonik değerle karşılaştırır; option value = kanonik");
  ok(/category: form\.category,/.test(form) && /<option key=\{cat\} value=\{cat\}>/.test(form) && /title: opt\?\.label \?\? ""/.test(form), "B12 yeni kayıt: kategori + başlık kaynak (TR) değerle kaydedilir, dil-bağımsız");
  ok(/category: form\.category,/.test(editor) && /<option key=\{cat\} value=\{cat\}>/.test(editor) && /title: opt\?\.label \?\? ""/.test(editor), "B13 editör: kategori + başlık kaynak değerle kaydedilir, dil-bağımsız");
}

// ── C) Transit ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("C) Transit ekran etiketleri");
function TransitProbe(): ReactElement {
  const L = useTransitI18n();
  return createElement(
    "div",
    null,
    createElement("p", { "data-c": "1" }, CENTERS.map((c) => L.center(c)).join("|")),
    createElement("p", { "data-ch": "1" }, CHANNELS.map((c) => L.channel(c.id, c.name)).join("|")),
    createElement("p", { "data-b": "1" }, HD_PLANET_ORDER.map((b) => L.body(b)).join("|")),
    createElement("p", { "data-e": "1" }, L.error({ error: "SUNUCU METNİ", code: "INVALID_DATE" })),
    createElement("p", { "data-u": "1" }, L.error({ error: "SUNUCU METNİ", code: "BILINMEYEN" })),
    createElement("p", { "data-cap": "1" }, L.caption({ localDate: "2026-03-05", localTime: "14:07", timeZone: TRANSIT_TIME_ZONE })),
  );
}
{
  const pick = (h: string, a: string) => textOf(new RegExp(`<p ${a}="1">([\\s\\S]*?)</p>`).exec(h)?.[1] ?? "");
  const hTr = renderToStaticMarkup(createElement(TransitProbe), "tr");
  const hEn = renderToStaticMarkup(createElement(TransitProbe), "en");
  ok(pick(hTr, "data-c") === CENTERS.map(transitCenterLabel).join("|"), "C1 TR merkez kısa adları = transitCenterLabel");
  ok(pick(hTr, "data-ch") === CHANNELS.map((c) => transitChannelLabel(c.id, c.name)).join("|"), "C2 TR kanal adları = transitChannelLabel (36)");
  ok(pick(hTr, "data-b") === HD_PLANET_ORDER.map(bodyLabel).join("|"), "C3 TR gezegen adları = bodyLabel (13)");
  ok(pick(hTr, "data-e") === "SUNUCU METNİ", "C4 TR hata: sunucu/lib metni aynen");
  ok(pick(hTr, "data-cap") === "05.03.2026 saat 14:07 (Türkiye saati) için hesaplandı", "C5 TR sonuç başlığı birebir");
  ok(!TR_CHARS.test(pick(hEn, "data-c") + pick(hEn, "data-ch") + pick(hEn, "data-b")) && pick(hEn, "data-c").split("|")[0] === "Head", "C6 EN merkez/kanal/gezegen adları İngilizce", [pick(hEn, "data-c"), pick(hEn, "data-b")]);
  ok(pick(hEn, "data-e") === "Select a valid date." && pick(hEn, "data-u") === "SUNUCU METNİ", "C7 EN: bilinen kod → katalog; bilinmeyen kod → sunucu metni (uydurma yok)");
  ok(pick(hEn, "data-cap") === "Calculated for 05/03/2026 at 14:07 (Turkey time)", "C8 EN sonuç başlığı", pick(hEn, "data-cap"));
  const mp = (loc: "tr" | "en") => textOf(renderToStaticMarkup(createElement(MomentPicker, { date: "2026-03-05", time: "14:07", busy: false, onDate: () => {}, onTime: () => {}, onNow: () => {}, onSubmit: () => {}, submitLabel: "X" }), loc));
  ok(/Tarih/.test(mp("tr")) && /Yerel saat/.test(mp("tr")) && /Şimdi/.test(mp("tr")), "C9 TR anı seçici metinleri aynı");
  ok(/Date/.test(mp("en")) && /Local time/.test(mp("en")) && /Now/.test(mp("en")) && !TR_CHARS.test(mp("en")), "C10 EN anı seçici İngilizce");
  const zone = { tz: TRANSIT_TIME_ZONE, label: null, source: "default" as const };
  const zp = (loc: "tr" | "en") => textOf(renderToStaticMarkup(createElement(TransitZonePanel, { zone, onZone: () => {}, testId: "t" }), loc));
  ok(zp("tr").includes("Konum ve Saat Dilimi") && zp("tr").includes(`Türkiye saati (${TRANSIT_TIME_ZONE})`) && zp("tr").includes("Varsayılan"), "C11 TR saat dilimi paneli metinleri aynı");
  ok(zp("en").includes("Location and Time Zone") && zp("en").includes(`Turkey time (${TRANSIT_TIME_ZONE})`) && !TR_CHARS.test(zp("en")), "C12 EN saat dilimi paneli İngilizce", zp("en"));
  // Yaz saati boşluğu (Europe/London 2026-03-29 01:30 yaşanmadı): TR lib metni aynen, EN katalog metni.
  const gap = resolveTransitMoment("2026-03-29", "01:30", "Europe/London");
  const up = (loc: "tr" | "en") => textOf(renderToStaticMarkup(createElement(UtcPreview, { date: "2026-03-29", time: "01:30", tz: "Europe/London", offset: null, onOffset: () => {}, testId: "t" }), loc));
  ok(!gap.ok && gap.code === "LOCAL_TIME_GAP" && up("tr") === gap.error, "C13 TR yaz saati boşluğu hatası = lib metni", [up("tr"), gap]);
  ok(up("en").startsWith("Because of a daylight-saving change") && !TR_CHARS.test(up("en")), "C14 EN yaz saati boşluğu hatası İngilizce", up("en"));
  // Hesap / önbellek dosyalarına bu iş kapsamında dokunulmadı: transit görünümleri yalnız gösterim kancası kullanır.
  const views = ["GeneralTransitView", "PersonalTransitView", "TransitZonePanel", "MomentPicker", "HdTransitContent"].map((f) => src(`app/human-design/transit/components/${f}.tsx`)).join("\n");
  ok(!/withLanguageInCacheKey|policy\.lang|NEXT_LOCALE/.test(views), "C15 transit görünümleri hesap / önbellek anahtarına dil sokmuyor (yalnız gösterim)");
}

console.log(`\nHD BİLGİ BANKASI + TRANSİT I18N: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
