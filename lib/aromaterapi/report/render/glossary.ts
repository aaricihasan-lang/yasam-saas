/**
 * Aromaterapi Word — Sözlük (glossary) renderer'ı. Saf.
 * Mevcut erişilebilir 7 alan: canonical TR/EN, kısa + profesyonel tanım, durum.
 */

import { h1Colored, bodyText, muted, spacer, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import { statusLabel } from "./catalog";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";
import { aromaText } from "../text";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

export function renderGlossaryTerm(t: GlossaryTermListItem, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const x = aromaText().t;
  const out: ReportChild[] = [];
  out.push(nameLevel === "h2" ? h2(s(t.canonical_term_tr) || x("glossary.termFallback")) : h3(s(t.canonical_term_tr) || x("glossary.termFallback")));
  if (has(t.canonical_term_en)) out.push(muted(x("glossary.metaWithEn", { en: s(t.canonical_term_en), status: statusLabel(t.status) })));
  else out.push(muted(x("glossary.meta", { status: statusLabel(t.status) })));
  if (has(t.short_definition_tr)) out.push(bodyText(s(t.short_definition_tr)));
  if (has(t.professional_definition_tr)) out.push(h3(x("glossary.professional")), bodyText(s(t.professional_definition_tr)));
  out.push(spacer());
  return out;
}

export function renderGlossarySection(list: GlossaryTermListItem[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!list.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("glossary.section"), AROMA_COLORS.glossary, opts.sectionBreak ?? true));
  for (const t of list) out.push(...renderGlossaryTerm(t, "h2"));
  return out;
}
