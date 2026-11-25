/**
 * Aromaterapi Word — Bitki (taxon) + Preparat renderer'ları. Saf.
 * Canonical taksonomi + preparat ilişkisi; short-form alanlar; null-omit.
 */

import { h1Colored, twoColTable, muted, spacer, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import type { PlantTaxonDetail, PreparationDetail } from "@/lib/aromaterapi/readTypes";
import { aromaText } from "../text";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

// Durum etiketi çıktı dilinde (reports.aromatherapy.status.*; TR: Taslak/Doğrulanmış/Onaylanmış/Arşivlenmiş/İncelemede/Doğrulama Bekliyor).
const STATUS_CODES = new Set(["draft", "verified", "approved", "archived", "under_review", "needs_verification"]);
export const statusLabel = (v: string | null | undefined) => (STATUS_CODES.has(s(v)) ? aromaText().t(`status.${s(v)}`) : s(v) || "—");

export function renderTaxonMonograph(t: PlantTaxonDetail, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const x = aromaText().t;
  const out: ReportChild[] = [];
  out.push(nameLevel === "h2" ? h2(s(t.canonical_name) || x("taxa.unnamed")) : h3(s(t.canonical_name) || x("taxa.unnamed")));
  if (t.is_hybrid) out.push(muted(x("taxa.hybrid")));
  const rows: [string, string][] = [];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add(x("taxa.field.genus"), t.genus);
  add(x("taxa.field.species"), t.species);
  add(x("taxa.field.infraspecific"), t.infraspecific_epithet);
  add(x("taxa.field.rank"), t.taxon_rank);
  add(x("taxa.field.family"), t.family);
  add(x("taxa.field.author"), t.author_citation);
  add(x("taxa.field.commonNameTr"), t.primary_common_name_tr);
  rows.push([x("field.status"), statusLabel(t.status)]);
  out.push(twoColTable(rows), spacer());
  return out;
}

export function renderPreparationMonograph(p: PreparationDetail, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const x = aromaText().t;
  const out: ReportChild[] = [];
  const title = has(p.taxon_canonical_name) ? `${s(p.taxon_canonical_name)} — ${s(p.preparation_type)}` : s(p.preparation_type) || x("prep.fallback");
  out.push(nameLevel === "h2" ? h2(title) : h3(title));
  const rows: [string, string][] = [];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add(x("prep.field.taxon"), p.taxon_canonical_name);
  add(x("prep.field.type"), p.preparation_type);
  add(x("prep.field.plantPart"), p.plant_part);
  add(x("prep.field.chemotype"), p.chemotype);
  rows.push([x("field.status"), statusLabel(p.status)]);
  if (typeof p.knowledge_record_count === "number") rows.push([x("prep.field.knowledgeCount"), String(p.knowledge_record_count)]);
  out.push(twoColTable(rows), spacer());
  return out;
}

export function renderTaxaSection(taxa: PlantTaxonDetail[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!taxa.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("taxa.section"), AROMA_COLORS.taxa, opts.sectionBreak ?? true));
  for (const t of taxa) out.push(...renderTaxonMonograph(t, "h2"));
  return out;
}

export function renderPreparationsSection(preps: PreparationDetail[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!preps.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("prep.section"), AROMA_COLORS.preparations, opts.sectionBreak ?? true));
  for (const p of preps) out.push(...renderPreparationMonograph(p, "h2"));
  return out;
}
