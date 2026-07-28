/**
 * NKB-V5 — GERÇEK DOCX kabul testi (jszip parse; kelime araması değil). Premium yapı + yorum
 * bütünlüğü (İfade/Hayat) + uzman stok vurgusu (yeşil + adet, fuzzy YOK) + sayfa bölünmesi.
 *
 * Çalıştır: npx tsx scripts/numeroloji-nkb-v2/word-docx-acceptance.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const HELPERS = join(ROOT, "app", "numeroloji", "bilgi-bankasi", "helpers");
const build = await import(pathToFileURL(join(HELPERS, "wordDocxBuild.ts")).href);
const kl = await import(pathToFileURL(join(HELPERS, "knowledgeLookup.ts")).href);
const ss = await import(pathToFileURL(join(HELPERS, "stoneStockLogic.ts")).href);
const motorMod = await import(pathToFileURL(join(ROOT, "lib", "numeroloji", "numerolojiMotor.ts")).href);
const { buildNumerolojiWordChildren, packNumerolojiDocx } = build;
const { buildKnowledgeLookupPlan } = kl;
const { buildStockIndex } = ss;
const { hesaplaNumeroloji } = motorMod;

let pass = 0, fail = 0;
function check(name, cond) { const ok = Boolean(cond); console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (ok) pass++; else fail++; }

const motor = hesaplaNumeroloji({ firstName: "Ayşe", lastName: "YILMAZ", birthDate: "15.03.1990" });
const plan = buildKnowledgeLookupPlan(motor);
const val = (t) => { const p = plan.find((x) => x.analysisType === t); return p && p.values.length ? p.values[0] : "1"; };
const AV = val("ana-kulvar"), IV = val("ifade-sayisi"), HV = val("hayat-yolu"), CV = val("cakra-omurga");
const R = (t) => `rec-${t}`;
const LONG_STONES = ["Ametist", "Sitrin", "Turmalin", "Akik", "Oniks", "Kuvars", "Akuamarin", "Sodalit", "Lapis", "Yeşim", "Obsidyen", "Karnelyan"];

const row = { id: "r1", name: "Ayşe", surname: "YILMAZ", birth_date: "15.03.1990", created_at: "2026-01-01T10:00:00Z", analysis_data: { version: 1, motor, summary: "FIXTURE_OZET." } };
const mk = (t, v, over) => ({ id: R(t), tenant_id: "t", analysis_type: t, value: v, source: null, description: null, content_sections: null, updated_at: "2026-01-01", ...over });
const shared = {
  knowledgeRows: [
    mk("ana-kulvar", AV, { content_sections: [
      { key: "overview", label: "Genel Açıklama", body: "GENEL_ACIKLAMA_X", order: 1 },
      { key: "constructive", label: "Yapıcı Potansiyeller", body: "YAPICI_X", order: 2 },
      { key: "negative", label: "Olumsuz Potansiyeller", body: "OLUMSUZ_X", order: 3 },
      { key: "destructive", label: "Yıkıcı Potansiyeller", body: "YIKICI_X", order: 4 },
    ] }),
    mk("ifade-sayisi", IV, { description: "IFADE_YORUM_METNI" }),
    mk("hayat-yolu", HV, { description: "HAYAT_YORUM_METNI" }),
  ],
  entries: [{ id: "e1", tenant_id: "t", knowledge_record_id: R("ana-kulvar"), source_id: null, body: "KAYNAK_NOTU_X", display_order: 1, include_in_analysis: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
  sourceLabelById: new Map(),
  stoneRows: [
    { id: "s1", analysis_type: "ana-kulvar", value: AV, reason: "TAS_SEBEP_X", stones: ["Ametist", "Sitrin", "Turmalin", "Akik", "Oniks", "Kuvars"] },
    { id: "s2", analysis_type: "cakra-omurga", value: CV, reason: "CAKRA_TAS_SEBEP", stones: LONG_STONES },
  ],
};
// Uzman stoku: Ametist (18), Turmalin (adet 0 → "Stokta"), "Mor Akik" (→ suggested "Akik" ile eşleşMEZ).
const STOCK = buildStockIndex([{ name: "Ametist", adet: 18 }, { name: "Turmalin", adet: 0 }, { name: "Mor Akik", adet: 4 }]);

function sel(...keys) { const s = { summary: false, plain: false, detailed: false, tas: false }; for (const k of keys) s[k] = true; return s; }
async function gen(sections, stock = new Map()) {
  const { children, emptyTabs, anyContent } = buildNumerolojiWordChildren([row], sections, shared, stock);
  if (!anyContent) return { anyContent, emptyTabs, xml: "", header: "", footer: "", tbl: 0 };
  const buf = await packNumerolojiDocx(children, "Ayşe YILMAZ");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const hf = Object.keys(zip.files).find((f) => /word\/header\d*\.xml/.test(f));
  const ff = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f));
  return { anyContent, emptyTabs, xml, header: hf ? await zip.file(hf).async("string") : "", footer: ff ? await zip.file(ff).async("string") : "", tbl: xml.split("<w:tbl>").length - 1, size: buf.length };
}
const occ = (xml, s) => xml.split(s).length - 1;

console.log("── Premium yapı + Görsel Rapor YOK ──");
{
  const r = await gen(sel("summary", "plain", "detailed", "tas"), STOCK);
  check("premium kapak + running header + footer PAGE", r.xml.includes("NUMEROLOJİ ANALİZ RAPORU") && r.header.includes("Numeroloji Analiz Raporu") && r.footer.includes("PAGE"));
  check("Görsel Rapor/İçindekiler/ham ayraç YOK", !r.xml.includes("Görsel Rapor") && !r.xml.includes("İçindekiler") && !r.xml.includes("——————————"));
  check("native tablolar + Heading stilleri", r.tbl >= 6 && r.xml.includes('w:val="Heading2"'));
}

console.log("\n── İÇERİK BÜTÜNLÜĞÜ: İfade Sayısı + Hayat Yolu yorumları ──");
{
  const s = await gen(sel("summary"), new Map());
  check("Sonuç Özeti'nde İfade Sayısı yorumu var", s.xml.includes("IFADE_YORUM_METNI"));
  check("Sonuç Özeti'nde Hayat Yolu yorumu var", s.xml.includes("HAYAT_YORUM_METNI"));
  const d = await gen(sel("detailed"), new Map());
  check("Hesap Özetli'de İfade Sayısı yorumu var", d.xml.includes("IFADE_YORUM_METNI"));
  check("Hesap Özetli'de Hayat Yolu yorumu var", d.xml.includes("HAYAT_YORUM_METNI"));
  check("kanonik + kaynak notu doğru kartın altında; metin kesilmemiş", d.xml.includes("GENEL_ACIKLAMA_X") && d.xml.includes("KAYNAK_NOTU_X") && d.xml.includes("Yıkıcı Potansiyeller"));
}

console.log("\n── SAYFA YAPISI: Harfler + taş bölünmesi ──");
{
  const r = await gen(sel("plain"), new Map());
  check("Harflerin Yankılanışı yeni sayfadan (pageBreakBefore) — tek satır sayfa sonunda kalmaz", (() => {
    const i = r.xml.indexOf("Harflerin Yankılanışı");
    // Harfler subHeading paragrafında w:pageBreakBefore bulunmalı (başlıktan hemen önce).
    const before = r.xml.slice(Math.max(0, i - 400), i);
    return i > -1 && before.includes("w:pageBreakBefore");
  })());
  const t = await gen(sel("tas"), STOCK);
  check("taş kartı: keepNext (başlık+açıklama+Önerilen Taşlar kopmaz)", occ(t.xml, "w:keepNext") >= 3);
}

console.log("\n── UZMAN STOK VURGUSU (Word) ──");
{
  const t = await gen(sel("tas"), STOCK);
  check("stok girişinde açıklama: 'uzman stoklarında bulunmaktadır'", t.xml.includes("uzman stoklarında bulunmaktadır"));
  check("stoktaki taş yeşil zeminli (ECFDF5) + ✓ işareti", t.xml.includes("ECFDF5") && t.xml.includes("✓"));
  check("adetli stok: 'Stokta · 18 adet' (Ametist)", t.xml.includes("Stokta · 18 adet"));
  check("adetsiz stok kaydı: 'Stokta' (Turmalin, adet 0) — sayı yok", t.xml.includes("Stokta") && !t.xml.includes("Stokta · 0"));
  check("stokta olmayan taş nötr madde işareti (•  Sitrin)", t.xml.includes("•  Sitrin"));
  check("FUZZY YOK: 'Akik' önerildi, stokta 'Mor Akik' → Akik nötr (•  Akik)", t.xml.includes("•  Akik"));
  const noStock = await gen(sel("tas"), new Map());
  check("stok yoksa (boş index) taşlar nötr, yeşil (ECFDF5) yok", !noStock.xml.includes("ECFDF5"));
}

console.log("\n── DEVAM SAYFASI BAĞLAMI (uzun taş kartı) ──");
{
  const t = await gen(sel("tas"), STOCK);
  check("devam başlığı 'Önerilen Taşlar — Devam' bulunuyor", t.xml.includes("Önerilen Taşlar — Devam"));
  check("devam bağlamı doğru çakra + AZ/FAZLA durumu içeriyor", t.xml.includes(`Çakra Omurga — ${CV}`) && (CV.includes("AZ") || CV.includes("FAZLA")));
  check("tekrarlayan tablo başlığı (tblHeader) → devam sayfasında otomatik tekrar", t.xml.includes("tblHeader"));
  check("uzun listedeki taşlar kaybolmuyor (12 taş da mevcut)", LONG_STONES.every((s) => t.xml.includes(s)));
  check("taş tekrarlanmıyor (Karnelyan yalnız bir kez)", occ(t.xml, "Karnelyan") === 1);
  check("stok yeşil vurgu + adet devam kartında da korunuyor", t.xml.includes("ECFDF5") && t.xml.includes("Stokta · 18 adet"));
}

console.log("\n── Dört bölüm + dedup ──");
{
  const r = await gen(sel("summary", "plain", "detailed", "tas"), STOCK);
  check("4 bölüm başlığı + tek kapak", r.xml.includes("Sonuç Özeti") && r.xml.includes("Taş Açıklamaları") && occ(r.xml, "NUMEROLOJİ ANALİZ RAPORU") === 1);
  const pd = await gen(sel("plain", "detailed"), new Map());
  check("dedup: Çakra Omurgası tek kez; özetli doğrudan yorumlara", occ(pd.xml, "Çakra Omurgası") === 1 && pd.xml.includes("Numerolojik Yorumlar ve Bilgi Bankası Açıklamaları"));
}

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
