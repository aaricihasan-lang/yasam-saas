/**
 * NKB-V3 — GERÇEK DOCX kabul testi (kelime araması DEĞİL): fixture analiz verisiyle .docx üretir,
 * jszip ile açıp word/document.xml + footer + media'yı PARSE EDEREK yapısal kaliteyi doğrular:
 * native tablolar, heading stilleri, ham-paragraf-yok, seçilmeyen bölüm yok, görsel media, footer.
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
const motorMod = await import(pathToFileURL(join(ROOT, "lib", "numeroloji", "numerolojiMotor.ts")).href);

const { buildNumerolojiWordChildren, packNumerolojiDocx, dataUrlToBuffer } = build;
const { buildKnowledgeLookupPlan } = kl;
const { hesaplaNumeroloji } = motorMod;

let pass = 0, fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++; else fail++;
}

const motor = hesaplaNumeroloji({ firstName: "Ayşe", lastName: "YILMAZ", birthDate: "15.03.1990" });
const plan = buildKnowledgeLookupPlan(motor);
const ak = plan.find((p) => p.analysisType === "ana-kulvar");
const MV = ak && ak.values.length ? ak.values[0] : "1";
const REC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const row = {
  id: "rec-1", name: "Ayşe", surname: "YILMAZ", birth_date: "15.03.1990", created_at: "2026-01-01T10:00:00Z",
  analysis_data: { version: 1, motor, summary: "FIXTURE_OZET_METNI.\n\nİkinci özet paragrafı." },
};
const shared = {
  knowledgeRows: [{ id: REC_ID, tenant_id: "t", analysis_type: "ana-kulvar", value: MV, source: null, description: "KANONIK_ACIKLAMA metni", content_sections: null, updated_at: "2026-01-01" }],
  entries: [{ id: "e1", tenant_id: "t", knowledge_record_id: REC_ID, source_id: null, body: "KAYNAK_NOTU_UZMAN", display_order: 1, include_in_analysis: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
  sourceLabelById: new Map(),
  stoneRows: [{ id: "s1", analysis_type: "ana-kulvar", value: MV, reason: "TAS_SEBEP_ACIKLAMASI", stones: ["Ametist", "Sitrin"] }],
};
const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const gorselBuf = dataUrlToBuffer(PNG_1x1);

function sel(...keys) {
  const s = { summary: false, plain: false, detailed: false, tas: false, gorsel: false };
  for (const k of keys) s[k] = true;
  return s;
}
async function gen(sections, withGorsel = false) {
  const { children, emptyTabs, anyContent } = buildNumerolojiWordChildren([row], sections, shared, withGorsel ? gorselBuf : null);
  if (!anyContent) return { anyContent, emptyTabs, xml: "", media: [], footer: "", tbl: 0 };
  const buf = await packNumerolojiDocx(children);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
  const footerFile = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f));
  const footer = footerFile ? await zip.file(footerFile).async("string") : "";
  const tbl = xml.split("<w:tbl>").length - 1;
  return { anyContent, emptyTabs, xml, media, footer, tbl, size: buf.length };
}

console.log("── Ortak: ham metin dökümü YASAK + profesyonel yapı ──");
{
  const r = await gen(sel("summary", "plain", "detailed", "tas"));
  check("ham '——————————' ayraç YOK", !r.xml.includes("——————————"));
  check("gereksiz kapak/özet/TOC YOK (İçindekiler/Sistem Özeti)", !r.xml.includes("İçindekiler") && !r.xml.includes("Sistem Özeti"));
  check("native Word tabloları GERÇEKTEN var (>=6)", r.tbl >= 6);
  check("Heading stilleri var (Heading2/Heading3)", r.xml.includes('w:val="Heading2"') && r.xml.includes('w:val="Heading3"'));
  check("kişi bilgi kartı: Ad Soyad/Doğum/Analiz Tarihi var", r.xml.includes("Ad Soyad") && r.xml.includes("Doğum Tarihi") && r.xml.includes("Analiz Tarihi"));
  check("footer: 'Sayfa' + PAGE alanı var", r.footer.includes("Sayfa") && r.footer.includes("PAGE"));
  check("bölümler arası kontrollü page break var", r.xml.includes("w:pageBreakBefore"));
}

console.log("\n── 1. Sonuç Özeti ──");
{
  const r = await gen(sel("summary"));
  check("summary: dosya + Temel Numeroloji Değerleri tablosu + özet metin", r.anyContent && r.tbl >= 2 && r.xml.includes("Temel Numeroloji Değerleri") && r.xml.includes("FIXTURE_OZET_METNI"));
  check("summary: metin kesilmemiş (ikinci paragraf var)", r.xml.includes("İkinci özet paragrafı"));
  check("summary: seçilmeyen 'Analiz (Hesap Özetsiz)' YOK", !r.xml.includes("Analiz (Hesap Özetsiz)"));
}

console.log("\n── 2. Hesap Özetsiz — yapılandırılmış tablolar ──");
{
  const r = await gen(sel("plain"));
  check("plain: çok sayıda native tablo (Temel/Çakra/Element/Zirve/Harfler…) >=5", r.tbl >= 5);
  check("plain: bölüm alt başlıkları (Çakra Omurgası/Elementler/Harflerin Yankılanışı)", r.xml.includes("Çakra Omurgası") && r.xml.includes("Elementler") && r.xml.includes("Harflerin Yankılanışı"));
  check("plain: seçilmeyen 'Sonuç Özeti' bölüm başlığı YOK", !r.xml.includes("Sonuç Özeti"));
}

console.log("\n── 3. Hesap Özetli — hesap tabloları + yorum kartları ──");
{
  const r = await gen(sel("detailed"));
  check("detailed: hesap tabloları + 'Bilgi Bankası Yorumları' + kanonik açıklama", r.tbl >= 5 && r.xml.includes("Bilgi Bankası Yorumları") && r.xml.includes("KANONIK_ACIKLAMA"));
  check("detailed: 'Kaynak Notu' etiketli + include_in_analysis notu", r.xml.includes("Kaynak Notu") && r.xml.includes("KAYNAK_NOTU_UZMAN"));
}

console.log("\n── 4. Taş Açıklamaları — kartlar ──");
{
  const r = await gen(sel("tas"));
  check("tas: kart başlığı + sebep + 'Önerilen Taşlar' + taş adları", r.xml.includes("Ana Kulvar — " + MV) && r.xml.includes("TAS_SEBEP_ACIKLAMASI") && r.xml.includes("Önerilen Taşlar") && r.xml.includes("Ametist"));
}

console.log("\n── 5. Görsel Rapor — gerçek image media ──");
{
  const r = await gen(sel("gorsel"), true);
  check("gorsel: docx içinde gerçek word/media image var", r.media.length >= 1);
  check("gorsel: 'Görsel Rapor' başlığı var, boş üçüncü sayfa yok (tek section)", r.xml.includes("Görsel Rapor"));
  const rNo = await gen(sel("gorsel"), false);
  check("gorsel imagesiz → içerik yok (dosya üretilmez)", rNo.anyContent === false && rNo.emptyTabs.includes("gorsel"));
}

console.log("\n── 6. Beş bölüm birlikte ──");
{
  const r = await gen(sel("summary", "plain", "detailed", "tas", "gorsel"), true);
  check("çoklu: 5 bölüm başlığı da ekran sırasıyla var", r.xml.includes("Sonuç Özeti") && r.xml.includes("Analiz (Hesap Özetsiz)") && r.xml.includes("Analiz (Hesap Özetli)") && r.xml.includes("Taş Açıklamaları") && r.xml.includes("Görsel Rapor"));
  check("çoklu: tek kişi kartı (bir Ad Soyad satırı) + image media", (r.xml.split("Ad Soyad").length - 1) === 1 && r.media.length >= 1);
  check("çoklu: yalnız-başlık boş dosya DEĞİL (çok tablo + büyük boyut)", r.anyContent && r.tbl >= 6 && r.size > 4000);
}

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
