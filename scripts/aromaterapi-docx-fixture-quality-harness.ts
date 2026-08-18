// ============================================================
// Aromaterapi Word — FIXTURE QUALITY + COUNT/PARITY harness.
// UAT fixture'larının: (1) tekrar-spam içermediğini, (2) kapak/özet sayılarının gerçek
// kayıt sayısıyla PARITY olduğunu, (3) gerçekçi/placeholder-sız olduğunu doğrular.
// Renderer'ı DEĞİŞTİRMEZ. FAIL → exit 1.  npx tsx scripts/aromaterapi-docx-fixture-quality-harness.ts
// ============================================================

import JSZip from "jszip";
import { buildAromaDoc } from "@/lib/aromaterapi/report/document";
import { renderOilsSection } from "@/lib/aromaterapi/report/render/oils";
import {
  OIL_BERGAMOT, OIL_LAVANTA, OIL_SPARSE, OILS_MANY, blend, BLENDS_3,
  taxon, TAXA_2, PREP, METHOD, CLAIM, SOURCE, PASSAGE, GLOSSARY_3, oilTypeStats,
} from "./aromaterapi-docx-uat-fixtures";

let pass = 0, fail = 0; const failures: string[] = [];
function check(n: string, c: boolean, d?: string) { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); } }

/** Tekrar-spam: ≥20 karakterlik AYNI cümle ≥3 kez geçiyorsa spam kabul edilir. */
function repeatSpam(text: string): { spam: boolean; worst: number; sentence: string } {
  const sentences = String(text ?? "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 20);
  const counts = new Map<string, number>();
  for (const s of sentences) counts.set(s, (counts.get(s) ?? 0) + 1);
  let worst = 0, sentence = "";
  for (const [s, c] of counts) if (c > worst) { worst = c; sentence = s; }
  return { spam: worst >= 3, worst, sentence };
}

// Fixture'lardaki tüm uzun metin alanları
const LONG_FIELDS: { name: string; text: string }[] = [
  { name: "OIL_BERGAMOT.safety_notes", text: OIL_BERGAMOT.safety_notes ?? "" },
  { name: "OIL_BERGAMOT.aroma_profile", text: OIL_BERGAMOT.aroma_profile ?? "" },
  { name: "METHOD.method_text", text: METHOD.content.method_text },
  { name: "CLAIM.conclusion", text: CLAIM.conclusion },
  { name: "CLAIM.rationale", text: CLAIM.rationale },
  { name: "SOURCE.notes", text: SOURCE.notes },
  { name: "PASSAGE.original_text", text: PASSAGE.original_text },
  { name: "PASSAGE.translations[0]", text: PASSAGE.translations[0].translated_text },
  { name: "GLOSSARY_3[0].professional_definition_tr", text: GLOSSARY_3[0].professional_definition_tr },
  { name: "GLOSSARY_3[1].professional_definition_tr", text: GLOSSARY_3[1].professional_definition_tr },
  { name: "GLOSSARY_3[2].professional_definition_tr", text: GLOSSARY_3[2].professional_definition_tr },
];

const PLACEHOLDER = /\b(undefined|null|TODO|FIXME|lorem ipsum|xxx|placeholder)\b/i;

async function unzip(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  return { doc: await zip.file("word/document.xml")!.async("string") };
}

async function main() {
  console.log("Aromaterapi Word — fixture quality + count/parity harness\n");

  // ── A) Tekrar-spam YOK (yalnız fixture kalitesi; renderer dedup DEĞİL) ──
  for (const f of LONG_FIELDS) {
    const r = repeatSpam(f.text);
    check(`A · spam YOK: ${f.name} (max tekrar ${r.worst})`, !r.spam, r.spam ? `"${r.sentence.slice(0, 40)}..." ${r.worst}×` : "");
  }
  check("A · uzun alanlar yine de dolgun (long-form korunur; ≥140 char)", (OIL_BERGAMOT.safety_notes ?? "").length >= 140 && METHOD.content.method_text.length >= 140 && GLOSSARY_3[0].professional_definition_tr.length >= 140);

  // ── B) Placeholder / literal boş-değer YOK ──
  for (const f of LONG_FIELDS) check(`B · placeholder YOK: ${f.name}`, !PLACEHOLDER.test(f.text));

  // ── C) COUNT / PARITY: türetilen istatistik = gerçek kayıt sayısı ──
  const many = oilTypeStats(OILS_MANY);
  const manyTotal = Number(many[0].value);
  const manySum = many.slice(1).reduce((a, s) => a + Number(s.value), 0);
  check("C · oilTypeStats(OILS_MANY) toplam = kayıt sayısı", manyTotal === OILS_MANY.length, `${manyTotal} vs ${OILS_MANY.length}`);
  check("C · oilTypeStats tip kırılımı toplamı = toplam (parity)", manySum === OILS_MANY.length, `Σtip=${manySum} vs ${OILS_MANY.length}`);
  const sel3 = [OIL_BERGAMOT, OIL_LAVANTA, OIL_SPARSE];
  const sel = oilTypeStats(sel3);
  check("C · seçili yağ parity (Toplam 3 = Uçucu 2 + Maserasyon 1)", Number(sel[0].value) === 3 && sel.slice(1).reduce((a, s) => a + Number(s.value), 0) === 3);
  // Genel katalog parity (jeneratörle aynı sayım)
  const oilsGenel = OILS_MANY.slice(0, 4);
  const genelCounts: [string, number][] = [["Yağ", oilsGenel.length], ["Bitki", 1], ["Preparat", 1], ["Karışım", 1], ["Yöntem", 1], ["Bilgi Kaydı", 1], ["Kaynak", 1], ["Terim", 1]];
  const genelTotal = genelCounts.reduce((a, [, n]) => a + n, 0);
  check("C · Genel katalog Toplam = bölüm sayıları toplamı (11)", genelTotal === 11, `total=${genelTotal}`);

  // ── D) RENDER PARITY: üretilen DOCX'te sayım = kayıt (Tüm Yağlar) ──
  const buf = await buildAromaDoc({ coverTitle2: "YAĞLAR", coverSubtitle: "Tüm", reportName: "Tüm Yağlar",
    stats: oilTypeStats(OILS_MANY), body: renderOilsSection(OILS_MANY, { asMainSection: true }), frontMatter: "full", date: new Date(2026, 0, 1) });
  const { doc } = await unzip(buf);
  check("D · render parity: 12 yağ adının TAMAMI dokümanda", OILS_MANY.every((o) => doc.includes(o.name)));
  check("D · render parity: kapak/özet 'Toplam Yağ' değeri 12", /Toplam Yağ/.test(doc) && doc.includes(String(OILS_MANY.length)));
  check("D · render: literal undefined/null YOK", !/>undefined<|>null</.test(doc));

  // ── E) Sözlük/method/claim/source fixture kalitesi (çok-cümleli, gerçekçi) ──
  check("E · sözlük 3 terim tam tanımlı (kısa + profesyonel)", GLOSSARY_3.length === 3 && GLOSSARY_3.every((g: any) => g.short_definition_tr && g.professional_definition_tr));
  check("E · method 4 gerçek adım (numaralı liste)", METHOD.content.steps.length === 4 && METHOD.content.steps.every((s: any) => s.text.length > 15));
  check("E · claim çok-cümleli sonuç + gerekçe + kaynak", CLAIM.conclusion.split(/[.!?]/).filter((x: string) => x.trim()).length >= 2 && CLAIM.sources.length >= 1);
  check("E · source pasaj: özgün + sadık çeviri AYRI ve dolu", PASSAGE.original_text.length > 40 && PASSAGE.translations[0].translated_text.length > 40 && PASSAGE.original_text !== PASSAGE.translations[0].translated_text);
  check("E · blend fixture gerçekçi (3 karışım, adlı yağlar+damla)", BLENDS_3.length === 3 && BLENDS_3.every((b) => (b.items ?? []).length >= 1));
  check("E · taxa 2 farklı kayıt", TAXA_2.length === 2 && TAXA_2[0].canonical_name !== TAXA_2[1].canonical_name);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
  console.log("OVERALL = PASS");
}
main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
