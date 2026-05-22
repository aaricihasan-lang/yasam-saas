import { supabase } from "@/lib/supabase";

/** Liste görünümü — ağır metin alanları yok */
export const STONES_LIST_SELECT =
  "id, tenant_id, stone_name, short_description, chakras, images, updated_at";

export const STONES_LIST_PAGE_SIZE = 30;

export type StoneListItem = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  chakras: string[] | null;
  images: unknown;
  updated_at: string | null;
};

function escapeIlikePattern(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

/** Metin kolonları — arama dolu iken .or ilike (case-insensitive) */
export const STONES_LIST_SEARCH_TEXT_COLUMNS = [
  "stone_name",
  "short_description",
  "general_info",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "warning_text",
  "source_note",
] as const;

/** Dizi / JSON — PostgREST ::text cast ile ilike */
export const STONES_LIST_SEARCH_CAST_COLUMNS = [
  "chakras::text",
  "assignments::text",
] as const;

function wrapPostgrestOrValue(pattern: string): string {
  if (/[,.()]/.test(pattern)) {
    return `"${pattern.replace(/"/g, '""')}"`;
  }
  return pattern;
}

/** Geniş kapsamlı liste araması — select hâlâ hafif kolonlar */
export function buildStonesListSearchOrFilter(term: string): string | null {
  const q = term.trim();
  if (!q) return null;

  const pattern = wrapPostgrestOrValue(`%${escapeIlikePattern(q)}%`);
  const clauses = [
    ...STONES_LIST_SEARCH_TEXT_COLUMNS.map((col) => `${col}.ilike.${pattern}`),
    ...STONES_LIST_SEARCH_CAST_COLUMNS.map((col) => `${col}.ilike.${pattern}`),
  ];
  return clauses.join(",");
}

export function mapStoneListRow(row: Record<string, unknown>): StoneListItem {
  return {
    id: String(row.id ?? ""),
    tenant_id: String(row.tenant_id ?? ""),
    stone_name: String(row.stone_name ?? ""),
    short_description:
      row.short_description != null ? String(row.short_description) : null,
    chakras: Array.isArray(row.chakras)
      ? row.chakras.map((c) => String(c))
      : null,
    images: row.images,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  };
}

/** Liste kartı — yalnızca ilk görsel URL */
export function getFirstStoneImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (!first || typeof first !== "object") return null;
  const url = (first as Record<string, unknown>).url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

export function stoneListImageCount(images: unknown): number {
  return Array.isArray(images) ? images.length : 0;
}

export async function fetchStonesListCount(
  tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  const q = search?.trim();
  let query = supabase
    .from("stones")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const searchOr = q ? buildStonesListSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchStonesListPage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<{ rows: StoneListItem[]; error: string | null }> {
  const limit = options.limit ?? STONES_LIST_PAGE_SIZE;
  const from = options.offset ?? 0;
  const to = from + limit - 1;
  const q = options.search?.trim();

  let query = supabase
    .from("stones")
    .select(STONES_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  const searchOr = q ? buildStonesListSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) =>
    mapStoneListRow(row as Record<string, unknown>),
  );
  return { rows, error: null };
}
