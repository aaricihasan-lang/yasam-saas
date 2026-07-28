/**
 * NKB-V2 — GERÇEK DOCX kabul testi (kelime araması değil): fixture analiz verisiyle .docx üretir,
 * jszip ile açıp word/document.xml + word/media içeriğini PARSE EDEREK doğrular.
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

// ── Fixture: gerçek motor + kanonik/kaynak/taş eşleşmesi ─────────────────────
const motor = hesaplaNumeroloji({ firstName: "Ayşe", lastName: "YILMAZ", birthDate: "15.03.1990" });
const plan = buildKnowledgeLookupPlan(motor);
const anaKulvar = plan.find((p) => p.analysisType === "ana-kulvar");
const MATCH_VALUE = anaKulvar && anaKulvar.values.length ? anaKulvar.values[0] : "1";

const REC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SRC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const row = {
  id: "rec-1",
  name: "Ayşe",
  surname: "YILMAZ",
  birth_date: "15.03.1990",
  created_at: "2026-01-01T10:00:00Z",
  analysis_data: { version: 1, motor, summary: "FIXTURE_OZET_METNI özet burada." },
};

const shared = {
  knowledgeRows: [
    { id: REC_ID, tenant_id: "t", analysis_type: "ana-kulvar", value: MATCH_VALUE, source: null, description: "KANONIK_ACIKLAMA metni", content_sections: null, updated_at: "2026-01-01" },
  ],
  entries: [
    { id: "e1", tenant_id: "t", knowledge_record_id: REC_ID, source_id: null, body: "KAYNAK_NOTU_UZMAN", display_order: 1, include_in_analysis: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    { id: "e2", tenant_id: "t", knowledge_record_id: REC_ID, source_id: null, body: "GIZLI_NOT_GORUNMEZ", display_order: 2, include_in_analysis: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  ],
  sourceLabelById: new Map(),
  stoneRows: [
    { id: "s1", analysis_type: "ana-kulvar", value: MATCH_VALUE, reason: "TAS_SEBEP_ACIKLAMASI", stones: ["Ametist", "Sitrin"] },
  ],
};

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const gorselBuf = dataUrlToBuffer(PNG_1x1);

function sel(...keys) {
  const s = { summary: false, plain: false, detailed: false, tas: false, gorsel: false, iliski: false, evis: false };
  for (const k of keys) s[k] = true;
  return s;
}

async function docxText(sections, withGorsel = false) {
  const { children, emptyTabs, anyContent } = buildNumerolojiWordChildren([row], sections, shared, withGorsel ? gorselBuf : null);
  if (!anyContent) return { anyContent, emptyTabs, xml: "", media: [] };
  const buf = await packNumerolojiDocx(children, "01.01.2026 10:00");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
  return { anyContent, emptyTabs, xml, media, size: buf.length };
}

console.log("── Gerçek DOCX: sekme içerikleri ──");

// 1. Yalnız Sonuç Özeti
{
  const r = await docxText(sel("summary"));
  check("1 summary: dosya üretildi + açılabilir (media/document ok)", r.anyContent && r.xml.length > 0);
  check("1 summary: 'Sonuç Özeti' başlığı + FIXTURE_OZET var", r.xml.includes("Sonuç Özeti") && r.xml.includes("FIXTURE_OZET_METNI"));
  check("1 summary: seçilmeyen 'Analiz (Hesap Özetsiz)' YOK", !r.xml.includes("Analiz (Hesap Özetsiz)"));
  check("1 summary: gereksiz 'İçindekiler'/'Sistem Özeti' sayfaları YOK", !r.xml.includes("İçindekiler") && !r.xml.includes("Sistem Özeti"));
  check("1 summary: metin kesilmemiş (600 karakter kısaltma yok)", r.xml.includes("özet burada"));
}

// 2. Yalnız Hesap Özetsiz
{
  const r = await docxText(sel("plain"));
  check("2 plain: 'Analiz (Hesap Özetsiz)' başlığı + tam analiz (ANA KULVAR) var", r.xml.includes("Analiz (Hesap Özetsiz)") && r.xml.includes("ANA KULVAR"));
  check("2 plain: seçilmeyen 'Sonuç Özeti' YOK", !r.xml.includes("Sonuç Özeti"));
}

// 3. Yalnız Hesap Özetli
{
  const r = await docxText(sel("detailed"));
  check("3 detailed: başlık + Bilgi Bankası Yorumları + kanonik açıklama", r.xml.includes("Analiz (Hesap Özetli)") && r.xml.includes("Bilgi Bankası Yorumları") && r.xml.includes("KANONIK_ACIKLAMA"));
  check("3 detailed: include_in_analysis kaynak notu var, gizli not YOK", r.xml.includes("KAYNAK_NOTU_UZMAN") && !r.xml.includes("GIZLI_NOT_GORUNMEZ"));
}

// 4. Yalnız Taş Açıklamaları
{
  const r = await docxText(sel("tas"));
  check("4 tas: 'Taş Açıklamaları' + sebep + taş adları", r.xml.includes("Taş Açıklamaları") && r.xml.includes("TAS_SEBEP_ACIKLAMASI") && r.xml.includes("Ametist"));
}

// 5. Yalnız Görsel Rapor (gerçek image media)
{
  const r = await docxText(sel("gorsel"), true);
  check("5 gorsel: docx içinde gerçek image media var (word/media/*)", r.media.length >= 1);
  check("5 gorsel: 'Görsel Rapor' başlığı var", r.xml.includes("Görsel Rapor"));
}

// 5b. Görsel Rapor image olmadan → boş (dosya üretilmez)
{
  const r = await docxText(sel("gorsel"), false);
  check("5b gorsel imagesiz: içerik YOK (anyContent false) → dosya üretilmez", r.anyContent === false && r.emptyTabs.includes("gorsel"));
}

// 6. Yalnız İlişki Analizi → kayıtlı içerik yok
{
  const r = await docxText(sel("iliski"));
  check("6 iliski: kayıtlı içerik yok → anyContent false + boş sekme", r.anyContent === false && r.emptyTabs.includes("iliski"));
}

// 7. Yalnız Ev / İş Yeri → kayıtlı içerik yok
{
  const r = await docxText(sel("evis"));
  check("7 evis: kayıtlı içerik yok → anyContent false + boş sekme", r.anyContent === false && r.emptyTabs.includes("evis"));
}

// 8. Birden fazla seçili sekme (summary + plain + detailed + iliski)
{
  const r = await docxText(sel("summary", "plain", "detailed", "iliski"));
  check("8 çoklu: üç içerikli sekme de var", r.xml.includes("Sonuç Özeti") && r.xml.includes("Analiz (Hesap Özetsiz)") && r.xml.includes("Analiz (Hesap Özetli)"));
  check("8 çoklu: boş 'İlişki Analizi' başlığı EKLENMEDİ", !r.xml.includes("İlişki Analizi"));
  check("8 çoklu: boş sekme (iliski) raporlandı", r.emptyTabs.includes("iliski"));
  check("8 çoklu: yalnız kişi başlığı içeren boş dosya DEĞİL (içerik var)", r.anyContent === true && r.size > 2000);
}

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
