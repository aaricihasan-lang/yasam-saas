import { supabase } from "@/lib/supabase";
import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";

export const IMAGINATIONS_LIST_PATH = "/dashboard/biyoenerji/imajinasyonlar";

export const IMAGINATIONS_LIST_SELECT =
  "id, tenant_id, source_id, title, category, text, notes, source, created_at";

export const IMAGINATIONS_PAGE_SIZE = 30;

export const IMAGINATIONS_SEARCH_TEXT_COLUMNS = [
  "title",
  "category",
  "text",
  "notes",
  "source",
] as const;

export type ImaginationListItem = {
  id: string;
  tenant_id: string;
  source_id: string;
  title: string | null;
  category: string | null;
  text: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
};

export function buildImaginationsSearchOrFilter(term: string): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const pattern = `%${safeTerm}%`;
  return IMAGINATIONS_SEARCH_TEXT_COLUMNS.map((col) => `${col}.ilike.${pattern}`).join(
    ",",
  );
}

export function mapImaginationListRow(row: Record<string, unknown>): ImaginationListItem {
  return {
    id: String(row.id ?? "").trim(),
    tenant_id: String(row.tenant_id ?? ""),
    source_id: String(row.source_id ?? ""),
    title: row.title != null ? String(row.title) : null,
    category: row.category != null ? String(row.category) : null,
    text: row.text != null ? String(row.text) : null,
    notes: row.notes != null ? String(row.notes) : null,
    source: row.source != null ? String(row.source) : null,
    created_at: String(row.created_at ?? ""),
  };
}

export function previewImaginationText(
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

export async function fetchImaginationsCount(
  tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  const q = search?.trim();
  let query = supabase
    .from("bioenergy_imaginations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const searchOr = q ? buildImaginationsSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchImaginationsPage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<{ rows: ImaginationListItem[]; error: string | null }> {
  const limit = options.limit ?? IMAGINATIONS_PAGE_SIZE;
  const from = options.offset ?? 0;
  const to = from + limit - 1;
  const q = options.search?.trim();

  let query = supabase
    .from("bioenergy_imaginations")
    .select(IMAGINATIONS_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("title", { ascending: true, nullsFirst: false })
    .range(from, to);

  const searchOr = q ? buildImaginationsSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) =>
    mapImaginationListRow(row as Record<string, unknown>),
  );
  return { rows, error: null };
}
