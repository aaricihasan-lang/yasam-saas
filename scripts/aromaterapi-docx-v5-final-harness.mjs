// ============================================================
// Aromaterapi Word — V5-FINAL acceptance (cached TOC + raw enum leak + semantic preservation).
// FINALIZED (Word COM save-back) v5-final DOCX seti üzerinde çalışır.
//   node scripts/aromaterapi-docx-v5-final-harness.mjs
// FAIL → exit 1.
// ============================================================
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLAIM, SOURCE } from "./aromaterapi-docx-uat-fixtures";

const DIR = resolve(process.cwd(), "aroma-docx-uat-layout-v5-final");
let pass = 0, fail = 0; const failures = [];
const check = (n, c, d) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); } };

async function visibleText(docxName) {
  const p = resolve(DIR, docxName);
  const zip = await JSZip.loadAsync(readFileSync(p));
  const doc = await zip.file("word/document.xml").async("string");
  return { doc, txt: doc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

async function main() {
  console.log("Aromaterapi Word — V5-FINAL acceptance\n");

  // ── A) CACHED TOC — finalize sonrası gerçek maddeler + PAGEREF sayfa numaraları ──
  const TOC_DOCS = {
    "Genel_Katalog.docx": ["YAĞLAR", "BİTKİLER (TAKSON KATALOĞU)", "KARIŞIMLAR", "KAYNAKÇA"],
    "Tum_Yaglar.docx": ["YAĞLAR"],
    "Secili_Yaglar.docx": ["YAĞLAR"],
    "Secili_Karisimlar.docx": ["KARIŞIMLAR", "Sakinleştirici Karışım"],
    "Secili_Bitkiler.docx": ["BİTKİLER (TAKSON KATALOĞU)"],
    "Sozluk.docx": ["SÖZLÜK"],
  };
  for (const [name, entries] of Object.entries(TOC_DOCS)) {
    const { doc, txt } = await visibleText(name);
    const pagerefs = (doc.match(/PAGEREF\s+_Toc\d+/g) || []).length;
    check(`A · ${name}: cached TOC ≥2 gerçek madde (PAGEREF _Toc=${pagerefs})`, pagerefs >= 2);
    check(`A · ${name}: TOC ana bölüm başlıkları mevcut`, entries.every((e) => txt.includes(e)), entries.filter((e) => !txt.includes(e)).join(","));
  }
  // Genel: ana bölüm entry'leri (instruction örneği)
  {
    const { txt } = await visibleText("Genel_Katalog.docx");
    const mains = ["YAĞLAR", "BİTKİLER (TAKSON KATALOĞU)", "PREPARATLAR", "KARIŞIMLAR", "YÖNTEMLER", "BİLGİ KAYITLARI", "KAYNAKLAR", "SÖZLÜK", "KAYNAKÇA"];
    check("A · Genel: 9 ana bölüm TOC/başlık girdisi tam", mains.every((m) => txt.includes(m)), mains.filter((m) => !txt.includes(m)).join(","));
  }

  // ── B) RAW INTERNAL ENUM LEAKAGE — kullanıcı görünür metinde ham enum YOK ──
  const ENUM_DOCS = ["Tek_Bilgi_Kaydi.docx", "Tek_Kaynak_Pasajlar.docx", "Genel_Katalog.docx"];
  const RAW_WORD = ["from_source", "topical", "inhalation", "primary_support", "source_original"]; // İngilizce enum kodları TR metinde geçmez
  for (const name of ENUM_DOCS) {
    const { txt } = await visibleText(name);
    const leaks = RAW_WORD.filter((r) => new RegExp(`(^|[ (\\[/])${r}([ )\\]/.,;]|$)`).test(txt));
    check(`B · ${name}: ham enum kodu YOK (${RAW_WORD.join("/")})`, leaks.length === 0, leaks.join(","));
    // Talimat exact leak paternleri
    check(`B · ${name}: '(from_source)' / '(supports)' paterni YOK`, !txt.includes("(from_source)") && !txt.includes("(supports)"));
    check(`B · ${name}: bullet ham 'topical/inhalation' YOK`, !/\btopical\b/.test(txt) && !/\binhalation\b/.test(txt));
  }
  // Positive: Türkçe etiketler VAR
  {
    const { txt } = await visibleText("Tek_Bilgi_Kaydi.docx");
    check("B+ · Tek_Bilgi: 'Haricen (Cilt)' + 'Solunum' (route TR)", txt.includes("Haricen (Cilt)") && txt.includes("Solunum"));
    check("B+ · Tek_Bilgi: 'Gebelik' (population TR)", txt.includes("Gebelik"));
    check("B+ · Tek_Bilgi: 'Kaynaktan Gerekçeli' (rationale_status TR)", txt.includes("Kaynaktan Gerekçeli"));
    check("B+ · Tek_Bilgi: 'Destekler' (relation TR, supports→Destekler)", txt.includes("Destekler"));
    check("B+ · Tek_Bilgi: 'Geleneksel' (evidence_layer TR)", txt.includes("Geleneksel"));
  }

  // ── C) SEMANTIC PRESERVATION — data model enum kodları DEĞİŞMEDİ (yalnız sunum TR) ──
  const C = CLAIM;
  check("C · data: rationale_status hâlâ 'from_source' (kod korundu)", C.rationale_status === "from_source");
  check("C · data: route_code hâlâ 'topical'/'inhalation'", C.routes[0].route_code === "topical" && C.routes[1].route_code === "inhalation");
  check("C · data: relation_type hâlâ 'supports'", C.relations[0].relation_type === "supports");
  check("C · data: population_code kanonik 'pregnancy'", C.populations[0].population_code === "pregnancy");
  check("C · data: source_role 'primary_support', source_type 'book'", C.sources[0].source_role === "primary_support" && SOURCE.source_type === "book");

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
  console.log("OVERALL = PASS");
}
main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
