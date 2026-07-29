import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";
import {
  buildOrIlike,
  type ParsedListParams,
} from "@/lib/aromaterapi/service/readValidation";

/**
 * Aromaterapi V2 — C3C Sözlük (glossary terms) okuma servisi.
 *
 * server-only + tenant-scoped SELECT. NOT: aromatherapy_glossary_terms'te ayrı
 * bir `language` kolonu YOKTUR (TR/EN ayrı kolonlardır: canonical_term_tr/en,
 * short_definition_tr, professional_definition_tr). Bu nedenle `language`
 * filtresi ŞEMA GEREĞİ uygulanmaz (C3D boşluğu); dil ayrımı gerekirse gelecekte
 * eklenir. Arama TR+EN terim ve kısa tanım üzerinde çalışır.
 */

const GLOSSARY_TABLE = "aromatherapy_glossary_terms";

export const GLOSSARY_STATUS = ["draft", "verified", "archived"] as const;

const GLOSSARY_SEARCH_COLS = [
  "canonical_term_tr",
  "canonical_term_en",
  "short_definition_tr",
] as const;
const GLOSSARY_LIST_COLS =
  "id, canonical_term_tr, canonical_term_en, short_definition_tr, professional_definition_tr, status, updated_at";

export async function listGlossaryTerms(
  db: SupabaseClient,
  tenantId: string,
  p: ParsedListParams,
): Promise<{ rows: GlossaryTermListItem[]; total: number }> {
  let query = db
    .from(GLOSSARY_TABLE)
    .select(GLOSSARY_LIST_COLS, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (p.q) query = query.or(buildOrIlike(GLOSSARY_SEARCH_COLS, p.q));
  for (const [col, val] of Object.entries(p.equals)) query = query.eq(col, val);

  const { data, error, count } = await query
    .order(p.sort.column, { ascending: p.sort.ascending })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) throw error;

  return { rows: (data ?? []) as unknown as GlossaryTermListItem[], total: count ?? 0 };
}
