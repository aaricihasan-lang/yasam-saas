/**
 * Aromaterapi Word — Kaynak (source) + pasaj renderer'ı. Saf.
 * Profesyonel bibliyografik künye + DOI/URL hyperlink + pasaj katmanları (özgün metin /
 * sadık çeviri / editoryal açıklama / editoryal yorum). Katmanlar AYRI; long-form TAM.
 */

import { h1Colored, twoColTable, bodyText, muted, spacer, fieldInline, linkField, doiField, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import { statusLabel } from "./catalog";
import { formatSourceType, formatPassageKind } from "../labels";
import type { SourceDetail, PassageDetail } from "@/lib/aromaterapi/readTypes";
import { aromaText } from "../text";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

/** Bibliyografik künye satırı (kaynakça / atıf) — tek satır referans. */
export function sourceCitation(src: SourceDetail): string {
  const parts = [s(src.authors), src.publication_year ? `(${src.publication_year})` : "", s(src.title), s(src.organization)].map(s).filter(Boolean);
  return parts.join(". ").replace(/\.\./g, ".") + ".";
}

export function renderSource(src: SourceDetail, passages: PassageDetail[], nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const x = aromaText().t;
  const out: ReportChild[] = [];
  out.push(nameLevel === "h2" ? h2(s(src.title) || x("sources.unnamed")) : h3(s(src.title) || x("sources.unnamed")));

  const rows: [string, string][] = [];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add(x("sources.field.authors"), src.authors);
  add(x("sources.field.organization"), src.organization);
  if (src.publication_year != null) rows.push([x("sources.field.year"), String(src.publication_year)]);
  if (has(src.source_type)) rows.push([x("sources.field.type"), formatSourceType(s(src.source_type))]);
  add(x("sources.field.documentNo"), src.document_no);
  rows.push([x("field.status"), statusLabel(src.status)]);
  out.push(twoColTable(rows));

  // Tanımlayıcılar (hyperlink/DOI)
  out.push(...doiField(src.doi));
  out.push(...linkField("URL", src.url));
  if (has(src.pmid)) out.push(fieldInline("PMID", s(src.pmid)));
  if (has(src.isbn)) out.push(fieldInline("ISBN", s(src.isbn)));
  if (has(src.notes)) out.push(h3(x("sources.notes")), bodyText(s(src.notes)));

  // Pasajlar + katmanlar (özgün / çeviri / editoryal açıklama / editoryal yorum)
  for (const p of passages) {
    const label = s(p.locator_label) || s(p.id);
    out.push(h3(has(p.passage_kind) ? x("sources.passageWithKind", { label, kind: formatPassageKind(s(p.passage_kind)) }) : x("sources.passage", { label })));
    if (has(p.original_text)) out.push(bodyText(x("sources.originalText", { value: s(p.original_text) })));
    for (const t of p.translations ?? []) if (has(t.translated_text)) out.push(bodyText(x("sources.translation", { lang: s(t.target_lang), value: s(t.translated_text) })));
    for (const e of p.editorial_explanations ?? []) if (has(e.note_text)) out.push(bodyText(x("sources.editorialExplanation", { value: s(e.note_text) })));
    for (const e of p.editorial_interpretations ?? []) if (has(e.note_text)) out.push(bodyText(x("sources.editorialInterpretation", { value: s(e.note_text) })));
  }
  out.push(spacer());
  return out;
}

export interface SourceExport { source: SourceDetail; passages: PassageDetail[] }

export function renderSourcesSection(list: SourceExport[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!list.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("sources.section"), AROMA_COLORS.sources, opts.sectionBreak ?? true));
  for (const e of list) out.push(...renderSource(e.source, e.passages, "h2"));
  return out;
}

/** Deduplicated Kaynakça appendix — source id'ye göre tek künye (bilgi kaybı yok: locator/pasaj/alıntı ilgili bölümde tam kalır). */
export function renderBibliography(sources: SourceDetail[]): ReportChild[] {
  const seen = new Set<string>();
  const uniq = sources.filter((s2) => (seen.has(s2.id) ? false : (seen.add(s2.id), true)));
  if (!uniq.length) return [];
  const sorted = [...uniq].sort((a, b) => s(a.authors || a.title).localeCompare(s(b.authors || b.title), "tr"));
  const x = aromaText().t;
  const out: ReportChild[] = [h1Colored(x("sources.bibliography"), AROMA_COLORS.general, true), muted(x("sources.bibliographyNote"))];
  for (const src of sorted) {
    out.push(bodyText(sourceCitation(src)));
    out.push(...doiField(src.doi));
    out.push(...linkField("URL", src.url));
  }
  out.push(spacer());
  return out;
}
