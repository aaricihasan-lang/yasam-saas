// ============================================================
// Aromaterapi Word — 13 UAT artefaktı üretici.
// Shared fixtures (gerçekçi, spam YOK) → renderers → buildAromaDoc.
// İstatistikler fixture'lardan TÜRETİLİR (count/parity garanti).
// Çıktı: AROMA_UAT_OUT (varsayılan aroma-docx-uat-layout-v4).
//   AROMA_UAT_OUT=aroma-docx-uat-layout-v4 npx tsx scripts/aromaterapi-docx-generate-artifacts.ts
// COMMIT YOK.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildAromaDoc } from "@/lib/aromaterapi/report/document";
import { classifyFrontMatter, oilTypeLabel, type FrontMatterMode } from "@/lib/aromaterapi/report/theme";
import { renderOilMonograph, renderOilsSection } from "@/lib/aromaterapi/report/render/oils";
import { renderBlendFormula, renderBlendsSection } from "@/lib/aromaterapi/report/render/blends";
import { renderTaxaSection, renderPreparationsSection } from "@/lib/aromaterapi/report/render/catalog";
import { renderMethodsSection } from "@/lib/aromaterapi/report/render/methods";
import { renderKnowledgeSection } from "@/lib/aromaterapi/report/render/knowledge";
import { renderSourcesSection, renderBibliography } from "@/lib/aromaterapi/report/render/sources";
import { renderGlossarySection } from "@/lib/aromaterapi/report/render/glossary";
import type { ReportChild } from "@/lib/docx/reportHelpers";
import {
  OIL_BERGAMOT, OIL_LAVANTA, OIL_SPARSE, OILS_MANY, blend, BLENDS_3,
  taxon, TAXA_2, PREP, METHOD, CLAIM, SOURCE, PASSAGE, GLOSSARY_3, oilTypeStats,
} from "./aromaterapi-docx-uat-fixtures";

const OUT = resolve(process.cwd(), process.env.AROMA_UAT_OUT || "aroma-docx-uat-layout-v4");
mkdirSync(OUT, { recursive: true });
const DATE = new Date(2026, 7, 17);
const written: string[] = [];
async function emit(file: string, mode: FrontMatterMode, opts: Parameters<typeof buildAromaDoc>[0]) {
  const buf = await buildAromaDoc(opts);
  writeFileSync(resolve(OUT, `${file}.docx`), buf);
  written.push(file);
  console.log(`  ✓ ${file}.docx  (${mode})  ${(buf.length / 1024).toFixed(0)} KB`);
}
const st = (label: string, n: number) => ({ label, value: String(n) });

async function main() {
  console.log(`Aromaterapi Word — 13 UAT artefaktı → ${OUT}\n`);

  // 1. Tek Yağ (none)
  await emit("Tek_Yag", "none", { coverTitle2: "AROMATERAPİ — YAĞ MONOGRAFİSİ", coverSubtitle: OIL_BERGAMOT.name, reportName: `Yağ: ${OIL_BERGAMOT.name}`,
    stats: [st("Yağ", 1), { label: "Tip", value: oilTypeLabel(OIL_BERGAMOT.oil_type) }], body: renderOilMonograph(OIL_BERGAMOT, "h2"), frontMatter: "none", date: DATE });

  // 2. Seçili Yağlar (compact) — stats fixture'dan TÜRETİLİR
  const sel3 = [OIL_BERGAMOT, OIL_LAVANTA, OIL_SPARSE];
  await emit("Secili_Yaglar", classifyFrontMatter(sel3.length), { coverTitle2: "AROMATERAPİ — YAĞLAR KATALOĞU", coverSubtitle: "Seçili Yağlar", reportName: "Seçili Yağlar",
    stats: oilTypeStats(sel3), body: renderOilsSection(sel3, { asMainSection: true }), frontMatter: classifyFrontMatter(sel3.length), date: DATE });

  // 3. Tüm Yağlar (full) — stats fixture'dan TÜRETİLİR (parity)
  await emit("Tum_Yaglar", classifyFrontMatter(OILS_MANY.length), { coverTitle2: "AROMATERAPİ — YAĞLAR KATALOĞU", coverSubtitle: "Tüm Yağlar", reportName: "Tüm Yağlar",
    stats: oilTypeStats(OILS_MANY), body: renderOilsSection(OILS_MANY, { asMainSection: true }), frontMatter: classifyFrontMatter(OILS_MANY.length), date: DATE });

  // 4. Tek Karışım (none)
  const oneBlend = blend({});
  await emit("Tek_Karisim", "none", { coverTitle2: "AROMATERAPİ — KARIŞIM REÇETESİ", coverSubtitle: oneBlend.name, reportName: `Karışım: ${oneBlend.name}`,
    stats: [st("Karışım", 1), st("Uçucu Yağ Sayısı", (oneBlend.items ?? []).length)], body: renderBlendFormula(oneBlend, "h2"), frontMatter: "none", date: DATE });

  // 5. Seçili Karışımlar (compact)
  await emit("Secili_Karisimlar", classifyFrontMatter(BLENDS_3.length), { coverTitle2: "AROMATERAPİ — KARIŞIMLAR", coverSubtitle: "Seçili Karışımlar", reportName: "Seçili Karışımlar",
    stats: [st("Toplam Karışım", BLENDS_3.length)], body: renderBlendsSection(BLENDS_3, { asMainSection: true }), frontMatter: classifyFrontMatter(BLENDS_3.length), date: DATE });

  // 6. Tek Bitki (none)
  await emit("Tek_Bitki", "none", { coverTitle2: "AROMATERAPİ — BİTKİ KATALOĞU", coverSubtitle: "Lavandula angustifolia", reportName: "Bitki Kataloğu",
    stats: [st("Toplam Kayıt", 1)], body: renderTaxaSection([taxon()], { asMainSection: true }), frontMatter: "none", date: DATE });

  // 7. Seçili Bitkiler (compact)
  await emit("Secili_Bitkiler", classifyFrontMatter(TAXA_2.length), { coverTitle2: "AROMATERAPİ — BİTKİ KATALOĞU", coverSubtitle: "Seçili Bitkiler", reportName: "Bitki Kataloğu",
    stats: [st("Toplam Bitki", TAXA_2.length)], body: renderTaxaSection(TAXA_2, { asMainSection: true }), frontMatter: classifyFrontMatter(TAXA_2.length), date: DATE });

  // 8. Tek Preparat (none)
  await emit("Tek_Preparat", "none", { coverTitle2: "AROMATERAPİ — PREPARATLAR", coverSubtitle: "Lavandula angustifolia — Uçucu Yağ", reportName: "Preparatlar",
    stats: [st("Toplam Kayıt", 1)], body: renderPreparationsSection([PREP], { asMainSection: true }), frontMatter: "none", date: DATE });

  // 9. Tek Yöntem / Revizyonlar (none)
  await emit("Tek_Yontem_Revizyonlar", "none", { coverTitle2: "AROMATERAPİ — YÖNTEMLER & REVİZYONLAR", coverSubtitle: "Lavanta Uçucu Yağı", reportName: "Yöntemler",
    stats: [st("Toplam Kayıt", 1)], body: renderMethodsSection([METHOD], { asMainSection: true }), frontMatter: "none", date: DATE });

  // 10. Tek Bilgi Kaydı (none)
  await emit("Tek_Bilgi_Kaydi", "none", { coverTitle2: "AROMATERAPİ — BİLGİ KAYITLARI", coverSubtitle: "Güvenlik — Hamilelik", reportName: "Bilgi Kayıtları",
    stats: [st("Toplam Kayıt", 1)], body: renderKnowledgeSection([CLAIM], { asMainSection: true }), frontMatter: "none", date: DATE });

  // 11. Tek Kaynak / Pasajlar (none)
  await emit("Tek_Kaynak_Pasajlar", "none", { coverTitle2: "AROMATERAPİ — KAYNAKLAR", coverSubtitle: SOURCE.title, reportName: "Kaynaklar",
    stats: [st("Toplam Kayıt", 1)], body: [...renderSourcesSection([{ source: SOURCE, passages: [PASSAGE] }], { asMainSection: true }), ...renderBibliography([SOURCE])], frontMatter: "none", date: DATE });

  // 12. Sözlük (compact)
  await emit("Sozluk", classifyFrontMatter(GLOSSARY_3.length), { coverTitle2: "AROMATERAPİ — SÖZLÜK", coverSubtitle: "Seçili Terimler", reportName: "Sözlük",
    stats: [st("Toplam Terim", GLOSSARY_3.length)], body: renderGlossarySection(GLOSSARY_3, { asMainSection: true }), frontMatter: classifyFrontMatter(GLOSSARY_3.length), date: DATE });

  // 13. Genel Katalog (full) — count/parity: TÜM sayılar gerçek kayıtlardan türetilir
  const oilsGenel = OILS_MANY.slice(0, 4);
  const genelCounts: [string, number][] = [
    ["Yağ", oilsGenel.length], ["Bitki", 1], ["Preparat", 1], ["Karışım", 1],
    ["Yöntem", 1], ["Bilgi Kaydı", 1], ["Kaynak", 1], ["Terim", 1],
  ];
  const total = genelCounts.reduce((a, [, n]) => a + n, 0);
  const body: ReportChild[] = [];
  let first = true;
  const push = (r: (sb: boolean) => ReportChild[]) => { body.push(...r(first)); first = false; };
  push((sb) => renderOilsSection(oilsGenel, { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderTaxaSection([taxon()], { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderPreparationsSection([PREP], { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderBlendsSection([blend({})], { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderMethodsSection([METHOD], { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderKnowledgeSection([CLAIM], { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderSourcesSection([{ source: SOURCE, passages: [PASSAGE] }], { asMainSection: true, sectionBreak: sb }));
  push((sb) => renderGlossarySection([GLOSSARY_3[0]], { asMainSection: true, sectionBreak: sb }));
  body.push(...renderBibliography([SOURCE]));
  await emit("Genel_Katalog", "full", { coverTitle2: "AROMATERAPİ — GENEL KATALOG", coverSubtitle: "Profesyonel Bilgi ve Referans Kataloğu", reportName: "Aromaterapi Genel Katalog",
    stats: [st("Toplam Kayıt", total), ...genelCounts.map(([l, n]) => st(l, n))], body, frontMatter: "full", date: DATE });

  console.log(`\n${written.length} artefakt üretildi → ${OUT}`);
}
main().catch((e) => { console.error("GEN ERROR:", e); process.exit(1); });
