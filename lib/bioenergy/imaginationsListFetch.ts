import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import { bioApiCount, bioApiList } from "@/lib/biyoenerji/secureApi";

const RESOURCE = "imaginations";

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
  /** P4 provenance — 'admin_transfer' ise "Admin Kütüphanesi" rozeti. */
  origin_type?: string | null;
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
  _tenantId: string,
  search?: string,
  category?: string,
): Promise<{ count: number; error: string | null }> {
  return bioApiCount(RESOURCE, search, category);
}

export async function fetchImaginationsPage(
  _tenantId: string,
  options: { offset?: number; search?: string; limit?: number; category?: string } = {},
): Promise<{ rows: ImaginationListItem[]; error: string | null }> {
  const { rows, error } = await bioApiList(RESOURCE, {
    offset: options.offset,
    limit: options.limit ?? IMAGINATIONS_PAGE_SIZE,
    search: options.search,
    category: options.category,
  });
  if (error) return { rows: [], error };
  return { rows: rows.map((row) => mapImaginationListRow(row)), error: null };
}
