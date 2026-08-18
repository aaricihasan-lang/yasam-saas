/**
 * Aromaterapi Word — Bitki (taxon) + Preparat renderer'ları. Saf.
 * Canonical taksonomi + preparat ilişkisi; short-form alanlar; null-omit.
 */

import { h1Colored, twoColTable, muted, spacer, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import type { PlantTaxonDetail, PreparationDetail } from "@/lib/aromaterapi/readTypes";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

const STATUS_LABEL: Record<string, string> = { draft: "Taslak", verified: "Doğrulanmış", approved: "Onaylanmış", archived: "Arşivlenmiş", under_review: "İncelemede", needs_verification: "Doğrulama Bekliyor" };
export const statusLabel = (v: string | null | undefined) => STATUS_LABEL[s(v)] ?? (s(v) || "—");

export function renderTaxonMonograph(t: PlantTaxonDetail, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const out: ReportChild[] = [];
  out.push(nameLevel === "h2" ? h2(s(t.canonical_name) || "İsimsiz Takson") : h3(s(t.canonical_name) || "İsimsiz Takson"));
  if (t.is_hybrid) out.push(muted("Hibrit takson"));
  const rows: [string, string][] = [];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add("Cins (Genus)", t.genus);
  add("Tür (Species)", t.species);
  add("Alt-tür Epiteti", t.infraspecific_epithet);
  add("Takson Rütbesi", t.taxon_rank);
  add("Familya", t.family);
  add("Yazar Atfı", t.author_citation);
  add("Yaygın Ad (TR)", t.primary_common_name_tr);
  rows.push(["Durum", statusLabel(t.status)]);
  out.push(twoColTable(rows), spacer());
  return out;
}

export function renderPreparationMonograph(p: PreparationDetail, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const out: ReportChild[] = [];
  const title = has(p.taxon_canonical_name) ? `${s(p.taxon_canonical_name)} — ${s(p.preparation_type)}` : s(p.preparation_type) || "Preparat";
  out.push(nameLevel === "h2" ? h2(title) : h3(title));
  const rows: [string, string][] = [];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add("Bağlı Takson", p.taxon_canonical_name);
  add("Preparat Türü", p.preparation_type);
  add("Kullanılan Bitki Bölümü", p.plant_part);
  add("Kemotip", p.chemotype);
  rows.push(["Durum", statusLabel(p.status)]);
  if (typeof p.knowledge_record_count === "number") rows.push(["Bağlı Bilgi Kaydı", String(p.knowledge_record_count)]);
  out.push(twoColTable(rows), spacer());
  return out;
}

export function renderTaxaSection(taxa: PlantTaxonDetail[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!taxa.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored("BİTKİLER (TAKSON KATALOĞU)", AROMA_COLORS.taxa, opts.sectionBreak ?? true));
  for (const t of taxa) out.push(...renderTaxonMonograph(t, "h2"));
  return out;
}

export function renderPreparationsSection(preps: PreparationDetail[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!preps.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored("PREPARATLAR", AROMA_COLORS.preparations, opts.sectionBreak ?? true));
  for (const p of preps) out.push(...renderPreparationMonograph(p, "h2"));
  return out;
}
