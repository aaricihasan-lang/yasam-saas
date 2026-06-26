import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import { bioApiCount, bioApiList } from "@/lib/biyoenerji/secureApi";

const RESOURCE = "subconscious-causes";

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
  _tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  return bioApiCount(RESOURCE, search);
}

export async function fetchSubconsciousCausesPage(
  _tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<{ rows: SubconsciousCauseListItem[]; error: string | null }> {
  const { rows, error } = await bioApiList(RESOURCE, {
    offset: options.offset,
    limit: options.limit ?? SUBCONSCIOUS_CAUSES_PAGE_SIZE,
    search: options.search,
  });
  if (error) return { rows: [], error };
  return { rows: rows.map((row) => mapSubconsciousCauseListRow(row)), error: null };
}
