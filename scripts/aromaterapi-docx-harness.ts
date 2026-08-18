// ============================================================
// Aromaterapi FAZ Word — DOCX ACCEPTANCE HARNESS (gerçek .docx üretir + doğrular)
//
// Deterministik fixture → renderers → buildAromaDoc → Buffer → JSZip unzip →
// [Content_Types].xml / word/document.xml / footer / rels XML seviyesinde doğrulama.
// FAIL → process.exit(1).  npx tsx scripts/aromaterapi-docx-harness.ts
// ============================================================

import JSZip from "jszip";
import { Document, Packer } from "docx";
import { buildAromaDoc } from "@/lib/aromaterapi/report/document";
import { renderOilMonograph, renderOilsSection } from "@/lib/aromaterapi/report/render/oils";
import { renderBlendFormula, renderBlendsSection } from "@/lib/aromaterapi/report/render/blends";
import { linkField, doiField } from "@/lib/docx/reportHelpers";
import { renderTaxaSection, renderPreparationsSection } from "@/lib/aromaterapi/report/render/catalog";
import { renderMethodsSection } from "@/lib/aromaterapi/report/render/methods";
import { renderKnowledgeSection } from "@/lib/aromaterapi/report/render/knowledge";
import { renderSourcesSection, renderBibliography } from "@/lib/aromaterapi/report/render/sources";
import { renderGlossarySection } from "@/lib/aromaterapi/report/render/glossary";
import type { OilExportRow, BlendExportRow } from "@/lib/aromaterapi/report/reads";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(n: string, c: boolean, d?: string) { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); } }

const LONG = "Hamilelikte ve emzirme döneminde uzman onayı olmadan kullanılmamalıdır. ".repeat(20);

function oil(over: Partial<OilExportRow>): OilExportRow {
  return {
    id: "00000000-0000-0000-0000-000000000000", tenant_id: "t", name: "X", latin_name: null, english_name: null,
    oil_type: "essential", category: null, extraction_method: null, plant_part: null, origin: null, shelf_life: null,
    aroma_profile: null, aroma_note: null, color: null, consistency: null, is_photosensitive: null, main_components: null,
    therapeutic_properties: null, emotional_benefits: null, spiritual_benefits: null, physical_benefits: null,
    skin_benefits: null, benefits: null, diffuser_usage: null, massage_usage: null, usage_methods: null, dilution_ratio: null,
    blends_well_with: null, target_systems: null, chakra_connection: null, element_connection: null, safety_notes: null,
    contraindications: null, notes: null, source: null, origin_type: null, origin_label: null, created_at: null, updated_at: null,
    ...over,
  };
}

const OILS: OilExportRow[] = [
  oil({ name: "Adaçayı Yağı", latin_name: "Salvia officinalis", english_name: "Sage", oil_type: "essential",
    aroma_profile: "Otsu, kâmforlu.", therapeutic_properties: ["antiseptik", "astrenjan"], physical_benefits: "Ağrı kesici.",
    main_components: "Linalol,Linalil asetat,Sineol", // boşluksuz — tipografi düzeltmesi test edilir
    safety_notes: LONG, is_photosensitive: true, blends_well_with: ["Lavanta", "Biberiye"] }),
  oil({ name: "Çörekotu Yağı", latin_name: "Nigella sativa", oil_type: "carrier", benefits: "Bağışıklık destekler." }),
  oil({ name: "Boş Alanlı Yağ", oil_type: "maceration" }), // null-omit testi
];

const blend = (over: Partial<BlendExportRow>): BlendExportRow => ({
  id: "b", tenant_id: "t", name: "Sakinleştirici Karışım", notes: "Akşam kullanımı.", carrier_oil_id: null,
  carrier_oil_name: "Jojoba", bottle_ml: 30, dilution_percent: 2, drops_per_ml: 20, total_drops: 12,
  items: [{ oil_id: "o1", oil_name: "Lavanta", latin_name: "Lavandula angustifolia", oil_type: "essential", drops: 6, is_photosensitive: false, contraindications: "", safety_notes: "" },
          { oil_id: "o2", oil_name: "Bergamot", latin_name: "Citrus bergamia", oil_type: "essential", drops: 6, is_photosensitive: true, contraindications: "Güneşe çıkmadan kullanmayın.", safety_notes: "" }],
  is_active: true, created_at: null, updated_at: null, ...over,
});

async function unzip(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const get = async (p: string) => (zip.file(p) ? await zip.file(p)!.async("string") : "");
  const names = Object.keys(zip.files);
  return { names, doc: await get("word/document.xml"), ct: await get("[Content_Types].xml"),
    rels: await get("word/_rels/document.xml.rels"), settings: await get("word/settings.xml"),
    numbering: await get("word/numbering.xml"),
    footer: await get("word/footer1.xml"), header: await get("word/header1.xml") };
}

/** Kaç kez "pageBreakBefore" (w:pageBreakBefore) — front-matter hard-break sayımı. */
function countPageBreakBefore(doc: string): number {
  return (doc.match(/<w:pageBreakBefore\b/g) || []).length;
}

async function main() {
  console.log("Aromaterapi FAZ Word — DOCX acceptance harness\n");

  // ── 1) Oils catalog (all) ──
  const catBuf = await buildAromaDoc({ coverTitle2: "YAĞLAR", coverSubtitle: "Tüm Yağlar", reportName: "Tüm Yağlar",
    stats: [{ label: "Toplam Yağ", value: "3" }], body: renderOilsSection(OILS, { asMainSection: true }), frontMatter: "full", date: new Date(2026, 0, 1) });
  const cat = await unzip(catBuf);

  check("DOCX geçerli ZIP + document.xml var", cat.doc.length > 500 && cat.names.includes("word/document.xml"));
  check("[Content_Types].xml mevcut", cat.ct.includes("wordprocessingml.document.main+xml"));
  check("Heading hiyerarşisi (Heading1/2/3)", /Heading1/.test(cat.doc) && /Heading2/.test(cat.doc) && /Heading3/.test(cat.doc));
  check("TOC field mevcut (instrText TOC)", /TOC \\o|w:instrText[^>]*>[^<]*TOC/i.test(cat.doc) || /TOC/.test(cat.doc));
  check("Footer + PageNumber (PAGE) field", cat.names.includes("word/footer1.xml") && /\bPAGE\b/.test(cat.footer));
  check("Running header mevcut", cat.names.includes("word/header1.xml") && /AROMATERAP/i.test(cat.header));
  check("Türkçe karakter korunur (Adaçayı ç/ı)", cat.doc.includes("Adaçayı"));
  check("Long-form TRUNCATION YOK (safety_notes tam)", cat.doc.includes(LONG.trim().slice(0, 200)) && cat.doc.split("emzirme").length - 1 >= 20);
  check("Literal 'undefined'/'null' YOK", !/>undefined<|>null</.test(cat.doc) && !/: null</.test(cat.doc));
  check("Record parity — 3 yağ adı da mevcut", cat.doc.includes("Adaçayı Yağı") && cat.doc.includes("Çörekotu Yağı") && cat.doc.includes("Boş Alanlı Yağ"));
  check("Gerçek madde-imi (numPr — bullet list)", /w:numPr/.test(cat.doc));
  check("Boş-alanlı yağ 'undefined' üretmez (null-omit)", cat.doc.includes("Boş Alanlı Yağ") && !/Boş Alanlı Yağ[\s\S]{0,400}undefined/.test(cat.doc));

  // ── 2) Selected exact set (oil1 + oil3, oil2 HARİÇ) ──
  const selBuf = await buildAromaDoc({ coverTitle2: "YAĞLAR", coverSubtitle: "Seçili", reportName: "Seçili Yağlar",
    stats: [], body: renderOilsSection([OILS[0], OILS[2]], { asMainSection: true }), frontMatter: "full", date: new Date(2026, 0, 1) });
  const sel = await unzip(selBuf);
  check("Selected exact set — seçilen 2 var, seçilmeyen (Çörekotu) YOK",
    sel.doc.includes("Adaçayı Yağı") && sel.doc.includes("Boş Alanlı Yağ") && !sel.doc.includes("Çörekotu Yağı"));

  // ── 3) Single oil monograph ──
  const oneBuf = await buildAromaDoc({ coverTitle2: "YAĞ MONOGRAFİSİ", coverSubtitle: "Adaçayı Yağı", reportName: "Yağ",
    stats: [], body: renderOilMonograph(OILS[0], "h2"), frontMatter: "none", date: new Date(2026, 0, 1) });
  const one = await unzip(oneBuf);
  check("Tek yağ monografisi — ad + Latince + tablo", one.doc.includes("Adaçayı Yağı") && one.doc.includes("Salvia officinalis") && /w:tbl/.test(one.doc));

  // ── 4) Blends (formül + repeating header) ──
  const blBuf = await buildAromaDoc({ coverTitle2: "KARIŞIMLAR", coverSubtitle: "Tüm Karışımlar", reportName: "Karışımlar",
    stats: [], body: renderBlendsSection([blend({})], { asMainSection: true }), frontMatter: "full", date: new Date(2026, 0, 1) });
  const bl = await unzip(blBuf);
  check("Karışım formülü — ad + yağlar", bl.doc.includes("Sakinleştirici Karışım") && bl.doc.includes("Lavanta") && bl.doc.includes("Bergamot"));
  check("Repeating table header (tblHeader)", /w:tblHeader/.test(bl.doc));
  check("Karışım güvenlik — fotosensitif uyarısı", bl.doc.includes("Fotosensitif") || bl.doc.includes("Güneşe çıkmadan"));
  check("Tek karışım reçetesi render", (await unzip(await buildAromaDoc({ coverTitle2:"R", coverSubtitle:"x", reportName:"r", stats:[], body: renderBlendFormula(blend({}), "h2"), frontMatter:"none", date:new Date(2026,0,1) }))).doc.includes("Sakinleştirici Karışım"));

  // ── 5) Hyperlink / DOI relationship (helper) ──
  const linkDoc = new Document({ sections: [{ children: [
    ...linkField("URL", "https://example.com/kaynak"),
    ...doiField("10.1000/abc123"),
    ...linkField("Güvensiz", "javascript:alert(1)"), // düz metne düşmeli
  ] }] });
  const linkBuf = await Packer.toBuffer(linkDoc);
  const lz = await unzip(linkBuf);
  check("Hyperlink relationship (rels Hyperlink Target)", /Type="[^"]*hyperlink"/.test(lz.rels) && /example\.com/.test(lz.rels));
  check("DOI hyperlink (doi.org)", /doi\.org/.test(lz.rels));
  // Güvensiz URL → hyperlink'e DÖNÜŞMEZ (rel yok = tıklanabilir/execution yok); düz metne düşer (zararsız).
  check("Güvensiz URL hyperlink rel üretmez (düz metne düşer)", !/javascript:/i.test(lz.rels) && lz.doc.includes("javascript:alert(1)"));

  // ── 6) Diğer kaynaklar (taxa/preparations/methods/knowledge/sources/glossary/bibliography) ──
  const taxon: any = { id: "t1", canonical_name: "Lavandula angustifolia", genus: "Lavandula", species: "angustifolia", family: "Lamiaceae", author_citation: "Mill.", is_hybrid: false, status: "verified", infraspecific_epithet: null, primary_common_name_tr: "Gerçek Lavanta" };
  const prep: any = { id: "p1", taxon_id: "t1", preparation_type: "Uçucu Yağ", plant_part: "Çiçek", chemotype: "Linalool", status: "verified", taxon_canonical_name: "Lavandula angustifolia", knowledge_record_count: 2 };
  const method: any = { series: { id: "s1", method_kind: "faithful_source", method_lang: "tr", source_title: "Ege Uçucu Yağ El Kitabı", passage_locator: "s.42", revision_count: 2, verified_revision: 2, revisions: [{ revision: 1, status: "archived", updated_at: "2026-01-01" }, { revision: 2, status: "verified", updated_at: "2026-02-01" }] }, content: { revision: 2, status: "verified", method_text: "Buhar damıtma ile elde edilir. ".repeat(15), steps: [{ order: 1, text: "Çiçekleri hasat edin." }, { order: 2, text: "Damıtma kazanına yerleştirin." }], quality_notes: "Berrak, açık sarı.", safety_notes: "Fotosensitif değildir.", equipment: "Bakır imbik" }, prepLabel: "Lavanta Uçucu Yağı" };
  const claim: any = { id: "k1", claim_type: "safety", safety_topic: "hamilelik", conclusion: "Hamilelikte dikkatli kullanılmalıdır. ".repeat(10), conclusion_provenance: "kaynaktan", evidence_layer: "geleneksel", rationale: "Emmenagog etki bildirilmiştir.", rationale_status: "from_source", status: "verified", preparation: { taxon_canonical_name: "Salvia officinalis" }, routes: [{ route_code: "topical" }], populations: [{ population_code: "pregnant", age_min: null, age_max: null }], sources: [{ source_id: "src1", source_title: "Botanik Güvenlik Rehberi", source_role: "primary", verification_status: "verified", locator_text: "s.10", source_original_excerpt: "Original latin excerpt about safety.", faithful_translation: "Güvenlik hakkında sadık çeviri metni." }], passages: [], relations: [{ relation_type: "supports", explanation_tr: "Bu iddia X kaydını destekler." }] };
  const source: any = { id: "src1", title: "Botanik Güvenlik Rehberi", source_type: "kitap", status: "verified", authors: "Yılmaz, A.", organization: "Ege Üniv.", publication_year: 2020, doi: "10.1234/abc", pmid: "12345678", isbn: null, url: "https://example.com/kaynak", document_no: null, notes: "Referans eser." };
  const passage: any = { id: "pg1", source_id: "src1", locator_label: "Bölüm 3", passage_kind: "alıntı", original_text: "Özgün Latince pasaj metni.", translations: [{ target_lang: "tr", translated_text: "Sadık çeviri metni tam." }], editorial_explanations: [{ note_text: "Editoryal açıklama." }], editorial_interpretations: [{ note_text: "Uzman yorumu." }] };
  const glo: any = { id: "g1", canonical_term_tr: "Fotosensitivite", canonical_term_en: "Phototoxicity", short_definition_tr: "Işığa duyarlılık.", professional_definition_tr: "Bergapten gibi furokumarinlerin ".repeat(10), status: "verified" };

  const richBuf = await buildAromaDoc({ coverTitle2: "GENEL", coverSubtitle: "Karma", reportName: "Karma", stats: [{ label: "x", value: "1" }],
    body: [
      ...renderTaxaSection([taxon], { asMainSection: true }),
      ...renderPreparationsSection([prep], { asMainSection: true }),
      ...renderMethodsSection([method], { asMainSection: true }),
      ...renderKnowledgeSection([claim], { asMainSection: true }),
      ...renderSourcesSection([{ source, passages: [passage] }], { asMainSection: true }),
      ...renderGlossarySection([glo], { asMainSection: true }),
      ...renderBibliography([source, source]), // dedup testi (aynı id 2×)
    ], frontMatter: "full", date: new Date(2026, 0, 1) });
  const rich = await unzip(richBuf);
  check("Taxa bölümü — canonical + familya", rich.doc.includes("Lavandula angustifolia") && rich.doc.includes("Lamiaceae") && rich.doc.includes("BİTKİLER"));
  check("Preparat bölümü — tür + kemotip", rich.doc.includes("PREPARATLAR") && rich.doc.includes("Linalool"));
  check("Method bölümü — method_text tam + adımlar (numPr)", rich.doc.includes("YÖNTEMLER") && rich.doc.split("damıtma ile").length - 1 >= 15 && rich.doc.includes("Çiçekleri hasat"));
  check("Knowledge epistemik katmanlar AYRI (Özgün Kaynak Alıntısı ≠ Sadık Çeviri)", rich.doc.includes("Özgün Kaynak Alıntısı") && rich.doc.includes("Sadık Çeviri") && rich.doc.includes("BİLGİ KAYITLARI"));
  check("Knowledge ilişki (explanation_tr) ayrı", rich.doc.includes("X kaydını destekler"));
  check("Sources bibliyografik + DOI hyperlink + pasaj katmanları", rich.doc.includes("Botanik Güvenlik Rehberi") && /doi\.org/.test(rich.rels) && rich.doc.includes("Editoryal Yorum"));
  check("Sözlük — profesyonel tanım tam", rich.doc.includes("Fotosensitivite") && rich.doc.split("furokumarinlerin").length - 1 >= 10 && rich.doc.includes("SÖZLÜK"));
  check("Kaynakça DEDUP (aynı kaynak 2× → 1 künye)", (rich.doc.match(/KAYNAKÇA/g) || []).length >= 1 && (rich.doc.match(/Yılmaz, A\. \(2020\)/g) || []).length === 1);
  check("Rich doc literal undefined/null YOK", !/>undefined<|>null</.test(rich.doc));

  // ── 7) LAYOUT CONTRACT — adaptif front-matter / orphan / table / numbering / typography ──
  // A. Tek-kayıt (none): ayrı Özet/İçindekiler sayfası YOK; kapaktan doğrudan içerik.
  check("A · none: standalone özet sayfası YOK (RAPOR ÖZETİ yok)", !/RAPOR ÖZETİ/.test(one.doc));
  check("A · 'SİSTEM ÖZETİ' terimi TAMAMEN kaldırıldı (none/compact/full)", !/SİSTEM ÖZETİ/.test(one.doc) && !/SİSTEM ÖZETİ/.test(cat.doc));
  check("A · none: 'İÇİNDEKİLER' / TOC field YOK", !/İÇİNDEKİLER/.test(one.doc) && !/\bTOC\b/.test(one.doc) && !/RAPOR ÖZETİ/.test(one.doc));
  check("A · none: kapaktan sonra içerik başlığı mevcut (Adaçayı)", one.doc.includes("Adaçayı Yağı"));
  check("A · none: gereksiz hard page-break YOK (pageBreakBefore=0)", countPageBreakBefore(one.doc) === 0);

  // B. Küçük seçili (compact): TEK 'Özet+İçindekiler' sayfası; iki gereksiz break YOK.
  const compactBuf = await buildAromaDoc({ coverTitle2: "YAĞLAR", coverSubtitle: "Seçili", reportName: "Seçili Yağlar",
    stats: [{ label: "Toplam Yağ", value: "3" }], body: renderOilsSection(OILS, { asMainSection: true }), frontMatter: "compact", date: new Date(2026, 0, 1) });
  const compact = await unzip(compactBuf);
  check("B · compact: 'RAPOR ÖZETİ' + 'İÇİNDEKİLER' aynı front-matter'da", /RAPOR ÖZETİ/.test(compact.doc) && /İÇİNDEKİLER/.test(compact.doc));
  check("B · compact: TOC field mevcut", /TOC/.test(compact.doc));
  check("B · compact: 'SİSTEM ÖZETİ' YOK (yalnız birleşik RAPOR ÖZETİ)", !/SİSTEM ÖZETİ/.test(compact.doc));
  check("B · compact: özet+TOC ayrı iki sayfa DEĞİL (pageBreakBefore=2: front-matter+ilk bölüm)", countPageBreakBefore(compact.doc) === 2);

  // C. Büyük/genel (full): TOC field VAR + settings.xml updateFields contract VAR.
  check("C · full: TOC field VAR", /TOC/.test(cat.doc));
  // OOXML: <w:updateFields/> varlığı = true (Word açılışta alanları/TOC'yi günceller).
  check("C · full: settings.xml updateFields contract VAR", /<w:updateFields\b/.test(cat.settings));
  check("C · full: 'RAPOR ÖZETİ' + 'İÇİNDEKİLER' sayfaları mevcut", /RAPOR ÖZETİ/.test(cat.doc) && /İÇİNDEKİLER/.test(cat.doc));

  // D. Orphan guards — record-start heading'lerinde keepWithNext XML contract.
  check("D · heading keepNext (w:keepNext) contract", /<w:keepNext\b/.test(cat.doc) && /<w:keepNext\b/.test(rich.doc));

  // E. Tables — repeating header + cantSplit + phantom row YOK.
  check("E · repeating header korunuyor (tblHeader)", /w:tblHeader/.test(bl.doc));
  check("E · data-row cantSplit contract (w:cantSplit)", /<w:cantSplit\b/.test(bl.doc));
  check("E · phantom/boş tablo satırı YOK", !/<w:tr\b[^>]*>\s*<\/w:tr>/.test(bl.doc) && !/<w:tr\/>/.test(bl.doc));

  // F. Numbered steps — gerçek Word numbering; '• 1.' duplicate YOK; her liste 1'den restart.
  check("F · adım listesi numPr (gerçek numbering)", /w:numPr/.test(rich.doc));
  check("F · numbering.xml ondalık (decimal) biçim", /decimal/.test(rich.numbering));
  check("F · manuel '1. ' duplicate prefix YOK (bullet+numara birlikte değil)", !/<w:t[^>]*>\s*\d+\.\s*<\/w:t>/.test(rich.doc));
  const twoMethodBuf = await buildAromaDoc({ coverTitle2: "YÖNTEM", coverSubtitle: "İki", reportName: "Yöntemler", stats: [{ label: "x", value: "2" }],
    body: renderMethodsSection([method, { ...method, prepLabel: "İkinci Yöntem" }], { asMainSection: true }), frontMatter: "full", date: new Date(2026, 0, 1) });
  const twoMethod = await unzip(twoMethodBuf);
  check("F · çok liste → ayrı numbering instance (restart, ≥2 concrete num)", (twoMethod.numbering.match(/<w:num /g) || []).length >= 2);

  // G. Array typography — main_components separator ", " (boşluksuz birleşim YOK). Değer korunur.
  check("G · main_components '..., ...' düzeltildi (Linalol, Linalil asetat, Sineol)", cat.doc.includes("Linalol, Linalil asetat, Sineol"));
  check("G · boşluksuz 'Linalol,Linalil' KALMADI", !cat.doc.includes("Linalol,Linalil"));

  // H. Blend keep-together — küçük/orta karışım başlangıç bloğu kenarlıksız cantSplit "kart"ta
  //    (ad+künye+Formül+tablo birlikte); uzun karışım (>12 yağ) düz akar, doğal bölünür.
  //    `bl` = 3 yağlı karışım (≤12) → kart beklenir.
  check("H · küçük blend: keep-together kart (kenarlıksız tblBorders w:val=\"none\")", /<w:tblBorders>[\s\S]*?w:val="none"/.test(bl.doc));
  check("H · kart satırı cantSplit (bütün olarak taşınır)", /w:val="none"[\s\S]*?<w:cantSplit\b/.test(bl.doc));
  check("H · kart başlangıç bloğu tam: ad + Formül + ilk yağ birlikte", bl.doc.includes("Sakinleştirici Karışım") && bl.doc.includes("Formül") && bl.doc.includes("Lavanta"));
  check("H · repeating header + cantSplit korunuyor (kart içinde)", /w:tblHeader/.test(bl.doc) && /<w:cantSplit\b/.test(bl.doc));
  check("H · phantom/boş satır YOK (kart)", !/<w:tr\b[^>]*>\s*<\/w:tr>/.test(bl.doc) && !/<w:tr\/>/.test(bl.doc));
  // Uzun karışım (15 yağ) → kart YOK (düz akış; formül doğal bölünür).
  const longItems = Array.from({ length: 15 }, (_, i) => ({ oil_id: `o${i}`, oil_name: `Yağ ${i + 1}`, latin_name: `Latince ${i + 1}`, oil_type: "essential", drops: 2, is_photosensitive: false, contraindications: "", safety_notes: "" }));
  const longBlBuf = await buildAromaDoc({ coverTitle2: "KARIŞIM", coverSubtitle: "Uzun", reportName: "Karışım", stats: [],
    body: renderBlendsSection([blend({ name: "Uzun Karışım", items: longItems as any })], { asMainSection: true }), frontMatter: "full", date: new Date(2026, 0, 1) });
  const longBl = await unzip(longBlBuf);
  check("H · uzun blend (>12 yağ): kart YOK (doğal bölünme; w:val=\"none\" yok)", !/w:val="none"/.test(longBl.doc));
  check("H · uzun blend: tekrarlayan başlık + cantSplit korunur", /w:tblHeader/.test(longBl.doc) && /<w:cantSplit\b/.test(longBl.doc));
  check("H · formül başlık satırı ilk veri satırıyla bağlı (header keepNext)", /w:tblHeader[\s\S]{0,700}?<w:keepNext\/>/.test(longBl.doc));
  check("H · uzun blend içerik tam (15 yağ, kayıp yok)", longBl.doc.includes("Yağ 1") && longBl.doc.includes("Yağ 15"));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
  console.log("OVERALL = PASS");
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
