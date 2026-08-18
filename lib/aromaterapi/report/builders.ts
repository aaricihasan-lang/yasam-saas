/**
 * Aromaterapi Word — üst-seviye rapor kurucular (route'lar bunları çağırır).
 * reads (tenant-safe) → renderers (saf) → document (docx) → filename (safe).
 * Her route kendi DOCX tasarımını KOPYALAMAZ; tek kaynak burasıdır.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAromaDoc } from "./document";
import { reportFilename, oilTypeLabel, AROMA_MODULE_TITLE, classifyFrontMatter } from "./theme";
import {
  readOilsForExport, readBlendsForExport, readOneOil, readOneBlend,
  type ExportSelector, type OilExportRow,
} from "./reads";
import { renderOilMonograph, renderOilsSection } from "./render/oils";
import { renderBlendFormula, renderBlendsSection } from "./render/blends";
import { renderTaxaSection, renderPreparationsSection } from "./render/catalog";
import { renderMethodsSection } from "./render/methods";
import { renderKnowledgeSection } from "./render/knowledge";
import { renderSourcesSection, renderBibliography } from "./render/sources";
import { renderGlossarySection } from "./render/glossary";
import {
  fetchTaxaDetails, fetchPreparationDetails, fetchKnowledgeDetails, fetchSourceExports, fetchMethodExports, fetchGlossary,
} from "./resourceReads";
import type { ReportChild } from "@/lib/docx/reportHelpers";

export interface ReportCtx { expertName?: string | null; date: Date }
export type BuildResult =
  | { ok: true; buffer: Buffer; filename: string; count: number }
  | { ok: false; status: number; error: string };

function oilStats(oils: OilExportRow[]): { label: string; value: string }[] {
  const by: Record<string, number> = {};
  for (const o of oils) by[o.oil_type] = (by[o.oil_type] ?? 0) + 1;
  const stats: { label: string; value: string }[] = [{ label: "Toplam Yağ", value: String(oils.length) }];
  for (const [t, n] of Object.entries(by)) stats.push({ label: oilTypeLabel(t), value: String(n) });
  return stats;
}

// ─── Oils ──────────────────────────────────────────────────────────────────────

export async function buildSingleOilDoc(db: SupabaseClient, tenantId: string, id: string, ctx: ReportCtx): Promise<BuildResult> {
  const { row, error } = await readOneOil(db, tenantId, id);
  if (error) return { ok: false, status: 500, error };
  if (!row) return { ok: false, status: 404, error: "Yağ bulunamadı veya bu hesaba ait değil." };
  const buffer = await buildAromaDoc({
    coverTitle2: `${AROMA_MODULE_TITLE} — YAĞ MONOGRAFİSİ`,
    coverSubtitle: row.name, reportName: `Yağ: ${row.name}`,
    stats: [{ label: "Yağ", value: row.name }, { label: "Tip", value: oilTypeLabel(row.oil_type) }],
    body: renderOilMonograph(row, "h2"), expertName: ctx.expertName, frontMatter: "none", date: ctx.date,
  });
  return { ok: true, buffer, filename: reportFilename([row.name], ctx.date), count: 1 };
}

export async function buildOilsCatalogDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { rows, error } = await readOilsForExport(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  if (!rows.length) return { ok: false, status: 404, error: "Export edilecek yağ bulunamadı." };
  const scopeName = sel.mode === "selected" ? "Seçili Yağlar" : sel.oilType ? `${oilTypeLabel(sel.oilType)} Kataloğu` : "Tüm Yağlar";
  const buffer = await buildAromaDoc({
    coverTitle2: `${AROMA_MODULE_TITLE} — YAĞLAR KATALOĞU`,
    coverSubtitle: scopeName, reportName: scopeName, stats: oilStats(rows),
    body: renderOilsSection(rows, { asMainSection: true }), expertName: ctx.expertName,
    frontMatter: classifyFrontMatter(rows.length), date: ctx.date,
  });
  const namePart = sel.mode === "selected" ? "Secili_Yaglar" : sel.oilType ? oilTypeLabel(sel.oilType) : "Tum_Yaglar";
  return { ok: true, buffer, filename: reportFilename([namePart], ctx.date), count: rows.length };
}

// ─── Blends ──────────────────────────────────────────────────────────────────────

export async function buildSingleBlendDoc(db: SupabaseClient, tenantId: string, id: string, ctx: ReportCtx): Promise<BuildResult> {
  const { row, error } = await readOneBlend(db, tenantId, id);
  if (error) return { ok: false, status: 500, error };
  if (!row) return { ok: false, status: 404, error: "Karışım bulunamadı veya bu hesaba ait değil." };
  const buffer = await buildAromaDoc({
    coverTitle2: `${AROMA_MODULE_TITLE} — KARIŞIM REÇETESİ`,
    coverSubtitle: row.name, reportName: `Karışım: ${row.name}`,
    stats: [{ label: "Karışım", value: row.name }, { label: "Uçucu Yağ Sayısı", value: String((row.items ?? []).length) }],
    body: renderBlendFormula(row, "h2"), expertName: ctx.expertName, frontMatter: "none", date: ctx.date,
  });
  return { ok: true, buffer, filename: reportFilename([row.name], ctx.date), count: 1 };
}

export async function buildBlendsDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { rows, error } = await readBlendsForExport(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  if (!rows.length) return { ok: false, status: 404, error: "Export edilecek karışım bulunamadı." };
  const scopeName = sel.mode === "selected" ? "Seçili Karışımlar" : "Tüm Karışımlar";
  const buffer = await buildAromaDoc({
    coverTitle2: `${AROMA_MODULE_TITLE} — KARIŞIMLAR`,
    coverSubtitle: scopeName, reportName: scopeName, stats: [{ label: "Toplam Karışım", value: String(rows.length) }],
    body: renderBlendsSection(rows, { asMainSection: true }), expertName: ctx.expertName,
    frontMatter: classifyFrontMatter(rows.length), date: ctx.date,
  });
  const namePart = sel.mode === "selected" ? "Secili_Karisimlar" : "Tum_Karisimlar";
  return { ok: true, buffer, filename: reportFilename([namePart], ctx.date), count: rows.length };
}

// ─── Diğer kaynaklar (taxa/preparations/methods/knowledge/sources/glossary) ───────

async function packCatalog(
  body: ReportChild[], count: number,
  meta: { title2: string; subtitle: string; reportName: string; filenamePart: string; stats?: { label: string; value: string }[] },
  ctx: ReportCtx,
): Promise<BuildResult> {
  if (!count) return { ok: false, status: 404, error: "Export edilecek kayıt bulunamadı." };
  const buffer = await buildAromaDoc({
    coverTitle2: `${AROMA_MODULE_TITLE} — ${meta.title2}`, coverSubtitle: meta.subtitle, reportName: meta.reportName,
    stats: meta.stats ?? [{ label: "Toplam Kayıt", value: String(count) }], body, expertName: ctx.expertName,
    frontMatter: classifyFrontMatter(count), date: ctx.date,
  });
  return { ok: true, buffer, filename: reportFilename([meta.filenamePart], ctx.date), count };
}
const scopeLbl = (sel: ExportSelector, all: string) => (sel.mode === "selected" ? "Seçili Kayıtlar" : all);
const scopePart = (sel: ExportSelector, all: string) => (sel.mode === "selected" ? "Secili" : all);

export async function buildTaxaDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { items, error } = await fetchTaxaDetails(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  return packCatalog(renderTaxaSection(items, { asMainSection: true }), items.length,
    { title2: "BİTKİ KATALOĞU", subtitle: scopeLbl(sel, "Tüm Bitkiler"), reportName: "Bitki Kataloğu", filenamePart: `${scopePart(sel, "Tum")}_Bitkiler` }, ctx);
}
export async function buildPreparationsDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { items, error } = await fetchPreparationDetails(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  return packCatalog(renderPreparationsSection(items, { asMainSection: true }), items.length,
    { title2: "PREPARATLAR", subtitle: scopeLbl(sel, "Tüm Preparatlar"), reportName: "Preparatlar", filenamePart: `${scopePart(sel, "Tum")}_Preparatlar` }, ctx);
}
export async function buildMethodsDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { items, error } = await fetchMethodExports(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  return packCatalog(renderMethodsSection(items, { asMainSection: true }), items.length,
    { title2: "YÖNTEMLER & REVİZYONLAR", subtitle: scopeLbl(sel, "Tüm Yöntemler"), reportName: "Yöntemler", filenamePart: `${scopePart(sel, "Tum")}_Yontemler` }, ctx);
}
export async function buildKnowledgeDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { items, error } = await fetchKnowledgeDetails(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  return packCatalog(renderKnowledgeSection(items, { asMainSection: true }), items.length,
    { title2: "BİLGİ KAYITLARI", subtitle: scopeLbl(sel, "Tüm Bilgi Kayıtları"), reportName: "Bilgi Kayıtları", filenamePart: `${scopePart(sel, "Tum")}_Bilgi_Kayitlari` }, ctx);
}
export async function buildSourcesDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { items, sources, error } = await fetchSourceExports(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  const body = [...renderSourcesSection(items, { asMainSection: true }), ...renderBibliography(sources)];
  return packCatalog(body, items.length,
    { title2: "KAYNAKLAR", subtitle: scopeLbl(sel, "Tüm Kaynaklar"), reportName: "Kaynaklar", filenamePart: `${scopePart(sel, "Tum")}_Kaynaklar` }, ctx);
}
export async function buildGlossaryDoc(db: SupabaseClient, tenantId: string, sel: ExportSelector, ctx: ReportCtx): Promise<BuildResult> {
  const { items, error } = await fetchGlossary(db, tenantId, sel);
  if (error) return { ok: false, status: 500, error };
  return packCatalog(renderGlossarySection(items, { asMainSection: true }), items.length,
    { title2: "SÖZLÜK", subtitle: scopeLbl(sel, "Tüm Terimler"), reportName: "Sözlük", filenamePart: `${scopePart(sel, "Tum")}_Sozluk` }, ctx);
}

// ─── General Aromaterapi Word ────────────────────────────────────────────────────

export const GENERAL_SECTIONS = ["oils", "taxa", "preparations", "blends", "methods", "knowledge", "sources", "glossary"] as const;
export type GeneralSection = (typeof GENERAL_SECTIONS)[number];

/**
 * Genel Aromaterapi raporu: tenant'ın TÜM export-eligible aktif kaydını tek DOCX'te,
 * profesyonel bölüm sırasıyla + sonda deduplicated Kaynakça. Boş bölüm başlık üretmez.
 */
export async function buildGeneralDoc(db: SupabaseClient, tenantId: string, sections: string[] | null, ctx: ReportCtx): Promise<BuildResult> {
  const want = (k: GeneralSection) => !sections || sections.includes(k);
  const all: ExportSelector = { mode: "all" };
  const body: ReportChild[] = [];
  const stats: { label: string; value: string }[] = [];
  let allSources: import("@/lib/aromaterapi/readTypes").SourceDetail[] = [];

  // İlk dolu ana bölüm İçindekiler sonrası yeni sayfada başlar (sectionBreak=true);
  // sonraki bölümler ZORLA yeni sayfaya itilmez (keepNext ile akar) → küçük bölümlerin
  // ardından gereksiz boş sayfa/orphan oluşmaz (bkz. UAT bulgu #4).
  let firstSection = true;
  const add = (render: (sb: boolean) => ReportChild[], label: string, n: number) => {
    if (n) { body.push(...render(firstSection)); stats.push({ label, value: String(n) }); firstSection = false; }
  };

  if (want("oils")) { const r = await readOilsForExport(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderOilsSection(r.rows, { asMainSection: true, sectionBreak: sb }), "Yağ", r.rows.length); }
  if (want("taxa")) { const r = await fetchTaxaDetails(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderTaxaSection(r.items, { asMainSection: true, sectionBreak: sb }), "Bitki", r.items.length); }
  if (want("preparations")) { const r = await fetchPreparationDetails(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderPreparationsSection(r.items, { asMainSection: true, sectionBreak: sb }), "Preparat", r.items.length); }
  if (want("blends")) { const r = await readBlendsForExport(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderBlendsSection(r.rows, { asMainSection: true, sectionBreak: sb }), "Karışım", r.rows.length); }
  if (want("methods")) { const r = await fetchMethodExports(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderMethodsSection(r.items, { asMainSection: true, sectionBreak: sb }), "Yöntem", r.items.length); }
  if (want("knowledge")) { const r = await fetchKnowledgeDetails(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderKnowledgeSection(r.items, { asMainSection: true, sectionBreak: sb }), "Bilgi Kaydı", r.items.length); }
  if (want("sources")) { const r = await fetchSourceExports(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; allSources = r.sources; add((sb) => renderSourcesSection(r.items, { asMainSection: true, sectionBreak: sb }), "Kaynak", r.items.length); }
  if (want("glossary")) { const r = await fetchGlossary(db, tenantId, all); if (r.error) return { ok: false, status: 500, error: r.error }; add((sb) => renderGlossarySection(r.items, { asMainSection: true, sectionBreak: sb }), "Terim", r.items.length); }

  if (!body.length) return { ok: false, status: 404, error: "Export edilecek aktif Aromaterapi kaydı bulunamadı." };
  if (allSources.length) body.push(...renderBibliography(allSources)); // dedup Kaynakça (bilgi kaybı yok)

  const total = stats.reduce((a, s) => a + Number(s.value), 0);
  const buffer = await buildAromaDoc({
    coverTitle2: `${AROMA_MODULE_TITLE} — GENEL KATALOG`, coverSubtitle: "Profesyonel Bilgi ve Referans Kataloğu",
    reportName: "Aromaterapi Genel Katalog", stats: [{ label: "Toplam Kayıt", value: String(total) }, ...stats],
    body, expertName: ctx.expertName, frontMatter: "full", date: ctx.date,
  });
  return { ok: true, buffer, filename: reportFilename(["Genel_Katalog"], ctx.date), count: total };
}
