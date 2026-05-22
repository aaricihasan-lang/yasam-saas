import { supabase } from "@/lib/supabase";
import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";

export const SUBCONSCIOUS_CAUSES_LIST_PATH =
  "/dashboard/biyoenerji/bilincalti-sebepleri";

/** Liste kartı kolonları */
export const SUBCONSCIOUS_CAUSES_LIST_SELECT =
  "id, tenant_id, source_uid, title, category, content, note_text, created_at";

export const SUBCONSCIOUS_CAUSES_PAGE_SIZE = 30;

export const SUBCONSCIOUS_CAUSES_SEARCH_TEXT_COLUMNS = [
  "title",
  "category",
  "content",
  "note_text",
] as const;

export type SubconsciousCauseListItem = {
  id: string;
  tenant_id: string;
  source_uid: string;
  title: string | null;
  category: string | null;
  content: string | null;
  note_text: string | null;
  created_at: string;
};

export function buildSubconsciousCausesSearchOrFilter(term: string): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const pattern = `%${safeTerm}%`;
  return SUBCONSCIOUS_CAUSES_SEARCH_TEXT_COLUMNS.map(
    (col) => `${col}.ilike.${pattern}`,
  ).join(",");
}

export function mapSubconsciousCauseListRow(
  row: Record<string, unknown>,
): SubconsciousCauseListItem {
  return {
    id: String(row.id ?? "").trim(),
    tenant_id: String(row.tenant_id ?? ""),
    source_uid: String(row.source_uid ?? ""),
    title: row.title != null ? String(row.title) : null,
    category: row.category != null ? String(row.category) : null,
    content: row.content != null ? String(row.content) : null,
    note_text: row.note_text != null ? String(row.note_text) : null,
    created_at: String(row.created_at ?? ""),
  };
}

export function previewSubconsciousText(
  ...parts: (string | null | undefined)[]
): string {
  const combined = parts
    .filter((p) => p?.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!combined) return "Önizleme yok.";
  return combined.length > 100 ? `${combined.slice(0, 100)}…` : combined;
}

export async function fetchSubconsciousCausesCount(
  tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  const q = search?.trim();
  let query = supabase
    .from("bioenergy_subconscious_causes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const searchOr = q ? buildSubconsciousCausesSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchSubconsciousCausesPage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<{ rows: SubconsciousCauseListItem[]; error: string | null }> {
  const limit = options.limit ?? SUBCONSCIOUS_CAUSES_PAGE_SIZE;
  const from = options.offset ?? 0;
  const to = from + limit - 1;
  const q = options.search?.trim();

  let query = supabase
    .from("bioenergy_subconscious_causes")
    .select(SUBCONSCIOUS_CAUSES_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("title", { ascending: true, nullsFirst: false })
    .range(from, to);

  const searchOr = q ? buildSubconsciousCausesSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) =>
    mapSubconsciousCauseListRow(row as Record<string, unknown>),
  );
  return { rows, error: null };
}
