/**
 * NKB-V4 — GERÇEK DOCX kabul testi (kelime araması DEĞİL): fixture veriyle .docx üretir, jszip ile
 * açıp document.xml + header + footer + media'yı PARSE EDEREK premium yapıyı doğrular: kapak, PIN
 * piramidi, Çakra Omurgası sol/merkez/sağ, element kartları, yorum kartları (pastel potansiyel),
 * dedup, taş çok sütunlu, Görsel Rapor YOK, sayfa X/Y.
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
const { buildNumerolojiWordChildren, packNumerolojiDocx } = build;
const { buildKnowledgeLookupPlan } = kl;
const { hesaplaNumeroloji } = motorMod;

let pass = 0, fail = 0;
function check(name, cond) { const ok = Boolean(cond); console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (ok) pass++; else fail++; }

const motor = hesaplaNumeroloji({ firstName: "Ayşe", lastName: "YILMAZ", birthDate: "15.03.1990" });
const plan = buildKnowledgeLookupPlan(motor);
const ak = plan.find((x) => x.analysisType === "ana-kulvar");
const MV = ak && ak.values.length ? ak.values[0] : "1";
const REC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const row = { id: "r1", name: "Ayşe", surname: "YILMAZ", birth_date: "15.03.1990", created_at: "2026-01-01T10:00:00Z", analysis_data: { version: 1, motor, summary: "FIXTURE_OZET." } };
const shared = {
  knowledgeRows: [{ id: REC, tenant_id: "t", analysis_type: "ana-kulvar", value: MV, source: null, description: null,
    content_sections: [
      { key: "overview", label: "Genel Açıklama", body: "GENEL_ACIKLAMA_X", order: 1 },
      { key: "constructive", label: "Yapıcı Potansiyeller", body: "YAPICI_X", order: 2 },
      { key: "negative", label: "Olumsuz Potansiyeller", body: "OLUMSUZ_X", order: 3 },
      { key: "destructive", label: "Yıkıcı Potansiyeller", body: "YIKICI_X", order: 4 },
    ], updated_at: "2026-01-01" }],
  entries: [{ id: "e1", tenant_id: "t", knowledge_record_id: REC, source_id: null, body: "KAYNAK_NOTU_X", display_order: 1, include_in_analysis: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
  sourceLabelById: new Map(),
  stoneRows: [{ id: "s1", analysis_type: "ana-kulvar", value: MV, reason: "TAS_SEBEP_X", stones: ["Ametist", "Sitrin", "Turmalin", "Akuamarin", "Oniks", "Kuvars"] }],
};
function sel(...keys) { const s = { summary: false, plain: false, detailed: false, tas: false }; for (const k of keys) s[k] = true; return s; }
async function gen(sections) {
  const { children, emptyTabs, anyContent } = buildNumerolojiWordChildren([row], sections, shared);
  if (!anyContent) return { anyContent, emptyTabs, xml: "", header: "", footer: "", tbl: 0 };
  const buf = await packNumerolojiDocx(children, "Ayşe YILMAZ");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const hf = Object.keys(zip.files).find((f) => /word\/header\d*\.xml/.test(f));
  const ff = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f));
  return { anyContent, emptyTabs, xml, header: hf ? await zip.file(hf).async("string") : "", footer: ff ? await zip.file(ff).async("string") : "", tbl: xml.split("<w:tbl>").length - 1, size: buf.length };
}
const occ = (xml, s) => xml.split(s).length - 1;

console.log("── Ortak: premium kapak + üst/alt bilgi + Görsel Rapor YOK ──");
{
  const r = await gen(sel("summary", "plain", "detailed", "tas"));
  check("premium kapak: NUMEROLOJİ ANALİZ RAPORU + YAŞAM SİSTEMİ + slogan", r.xml.includes("NUMEROLOJİ ANALİZ RAPORU") && r.xml.includes("YAŞAM SİSTEMİ") && r.xml.includes("Bütüncül Yaşam Analizi Platformu"));
  check("kapak kişi kartı: Danışan/Doğum/Analiz/Rapor Tarihi", r.xml.includes("Danışan") && r.xml.includes("Doğum Tarihi") && r.xml.includes("Analiz Tarihi") && r.xml.includes("Rapor Tarihi"));
  check("gereksiz Sistem Özeti/İçindekiler YOK", !r.xml.includes("İçindekiler") && !r.xml.includes("Sistem Özeti"));
  check("ham '——————————' YOK", !r.xml.includes("——————————"));
  check("üst bilgi (running header) var", r.header.includes("Numeroloji Analiz Raporu"));
  check("alt bilgi Sayfa X/Y (PAGE alanı)", r.footer.includes("Sayfa") && r.footer.includes("PAGE"));
  check("Görsel Rapor HİÇBİR yerde yok", !r.xml.includes("Görsel Rapor"));
}

console.log("\n── 1. Sonuç Özeti — profil kartları + PIN piramidi + yorum kartları (tekrar yok) ──");
{
  const r = await gen(sel("summary"));
  check("summary: 'Numerolojik Profil Özeti' + değer kartları (ANA KULVAR etiketi)", r.xml.includes("Numerolojik Profil Özeti") && r.xml.includes("ANA KULVAR"));
  check("summary: 'PIN Kodu' bölümü var (piramit için birden çok tablo)", r.xml.includes("PIN Kodu") && r.tbl >= 5);
  check("summary: tekrar eden 'Ana kulvar: ...' tek satırı YOK", !r.xml.includes("Ana kulvar:") && !r.xml.includes("Ana kulvar :"));
  check("summary: 'Ana Yorumlar' + kanonik + pastel potansiyeller", r.xml.includes("Ana Yorumlar") && r.xml.includes("GENEL_ACIKLAMA_X") && r.xml.includes("Yapıcı Potansiyeller") && r.xml.includes("Olumsuz Potansiyeller"));
}

console.log("\n── 2. Hesap Özetsiz — omurga/element/piramit yerleşimi ──");
{
  const r = await gen(sel("plain"));
  check("plain: Çakra Omurgası sol/merkez/sağ (Sol Destek/Çakra/Sağ Destek + açıklama)", r.xml.includes("Çakra Omurgası") && r.xml.includes("Sol Destek") && r.xml.includes("Sağ Destek") && r.xml.includes("Sol sütun sayı desteğini"));
  check("plain: Element kartları + BASKIN ELEMENT vurgusu", r.xml.includes("HAVA") && r.xml.includes("BASKIN ELEMENT"));
  check("plain: Harflerin Yankılanışı tablosu (gerçek karşılaştırma)", r.xml.includes("Harflerin Yankılanışı") && r.xml.includes("Yaş Aralığı"));
  check("plain: PIN piramidi için çoklu küçük tablo (tbl yüksek)", r.tbl >= 8);
}

console.log("\n── 3. Hesap Özetli (tek) — kısa profil + yorumlar ──");
{
  const r = await gen(sel("detailed"));
  check("detailed tek: 'Kısa Numerolojik Profil' + 'Numerolojik Yorumlar ve Bilgi Bankası Açıklamaları'", r.xml.includes("Kısa Numerolojik Profil") && r.xml.includes("Numerolojik Yorumlar ve Bilgi Bankası Açıklamaları"));
  check("detailed: kanonik + kaynak notu + pastel potansiyeller", r.xml.includes("GENEL_ACIKLAMA_X") && r.xml.includes("KAYNAK_NOTU_X") && r.xml.includes("Yıkıcı Potansiyeller"));
}

console.log("\n── 4. Taş Açıklamaları — kartlar + çok sütunlu taşlar ──");
{
  const r = await gen(sel("tas"));
  check("tas: 'Kişiye Özel Taş Destekleri' + kart başlığı + sebep + 'Önerilen Taşlar'", r.xml.includes("Kişiye Özel Taş Destekleri") && r.xml.includes("TAS_SEBEP_X") && r.xml.includes("Önerilen Taşlar"));
  check("tas: taşlar tek uzun virgüllü paragraf DEĞİL (madde işaretli hücreler)", r.xml.includes("•  Ametist") && r.xml.includes("•  Turmalin"));
}

console.log("\n── 5. Dört bölüm birlikte ──");
{
  const r = await gen(sel("summary", "plain", "detailed", "tas"));
  check("4 bölüm başlığı ekran sırasıyla", r.xml.includes("Sonuç Özeti") && r.xml.includes("Analiz (Hesap Özetsiz)") && r.xml.includes("Analiz (Hesap Özetli)") && r.xml.includes("Taş Açıklamaları"));
  check("tek kapak (bir NUMEROLOJİ ANALİZ RAPORU)", occ(r.xml, "NUMEROLOJİ ANALİZ RAPORU") === 1);
}

console.log("\n── 6. Hesap Özetsiz + Hesap Özetli birlikte → tekrar önleme ──");
{
  const r = await gen(sel("plain", "detailed"));
  check("dedup: 'Çakra Omurgası' yalnız BİR kez (özetli tekrar etmez)", occ(r.xml, "Çakra Omurgası") === 1);
  check("dedup: 'Kısa Numerolojik Profil' YOK (özetsiz zaten var)", !r.xml.includes("Kısa Numerolojik Profil"));
  check("dedup: özetli doğrudan yorumlara geçer", r.xml.includes("Numerolojik Yorumlar ve Bilgi Bankası Açıklamaları") && r.xml.includes("GENEL_ACIKLAMA_X"));
}

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
