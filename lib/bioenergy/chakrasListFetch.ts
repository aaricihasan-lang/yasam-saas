import { supabase } from "@/lib/supabase";
import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import {
  BIOENERGY_CHAKRAS_DETAIL_SELECT,
  BIOENERGY_CHAKRAS_LIST_SELECT,
  BIOENERGY_CHAKRAS_TEXT_SEARCH_COLUMNS,
  logBioenergyChakrasSchemaOnce,
} from "@/lib/bioenergy/chakrasSchema";

export const CHAKRAS_LIST_PATH = "/dashboard/biyoenerji/cakralar";

export const CHAKRAS_PAGE_SIZE = 30;

export type ChakraListItem = {
  id: string;
  tenant_id: string;
  source_uid: string;
  name: string | null;
  organs: string | null;
  color: string | null;
  stones: string | null;
  causes: string | null;
  notes: string | null;
  created_at: string;
};

export type ChakraDetailItem = ChakraListItem & {
  glands: string | null;
  physical: string | null;
  mental: string | null;
};

export function buildChakrasSearchOrFilter(term: string): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const pattern = `%${safeTerm}%`;
  return BIOENERGY_CHAKRAS_TEXT_SEARCH_COLUMNS.map((col) => `${col}.ilike.${pattern}`).join(
    ",",
  );
}

export function mapChakraListRow(row: Record<string, unknown>): ChakraListItem {
  return {
    id: String(row.id ?? "").trim(),
    tenant_id: String(row.tenant_id ?? ""),
    source_uid: String(row.source_uid ?? ""),
    name: row.name != null ? String(row.name) : null,
    organs: row.organs != null ? String(row.organs) : null,
    color: row.color != null ? String(row.color) : null,
    stones: row.stones != null ? String(row.stones) : null,
    causes: row.causes != null ? String(row.causes) : null,
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at ?? ""),
  };
}

export function mapChakraDetailRow(row: Record<string, unknown>): ChakraDetailItem {
  return {
    ...mapChakraListRow(row),
    glands: row.glands != null ? String(row.glands) : null,
    physical: row.physical != null ? String(row.physical) : null,
    mental: row.mental != null ? String(row.mental) : null,
  };
}

export function chakraDisplayName(row: Pick<ChakraListItem, "name">) {
  return row.name?.trim() || "İsimsiz çakra";
}

export function chakraCardBadge(row: Pick<ChakraListItem, "color" | "organs">) {
  return row.color?.trim() || row.organs?.trim() || "";
}

export function previewChakraText(...parts: (string | null | undefined)[]): string {
  const combined = parts
    .filter((p) => p?.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!combined) return "Önizleme yok.";
  return combined;
}

export type ChakrasFetchResult<T> = {
  data: T;
  error: string | null;
  usedFallback?: boolean;
};

async function runChakrasCountQuery(
  tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  const q = search?.trim();
  let query = supabase
    .from("bioenergy_chakras")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const searchOr = q ? buildChakrasSearchOrFilter(q) : null;
  if (searchOr) query = query.or(searchOr);

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchChakrasCount(
  tenantId: string,
  search?: string,
): Promise<ChakrasFetchResult<number>> {
  logBioenergyChakrasSchemaOnce();
  try {
    const primary = await runChakrasCountQuery(tenantId, search);
    if (!primary.error) return { data: primary.count, error: null };
    console.warn("[bioenergy_chakras] count başarısız:", primary.error);
    if (search?.trim()) {
      const fallback = await runChakrasCountQuery(tenantId);
      if (!fallback.error) {
        return { data: fallback.count, error: primary.error, usedFallback: true };
      }
    }
    return { data: 0, error: primary.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: 0, error: message };
  }
}

async function runChakrasPageQuery(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number },
): Promise<{ rows: ChakraListItem[]; error: string | null }> {
  const limit = options.limit ?? CHAKRAS_PAGE_SIZE;
  const from = options.offset ?? 0;
  const to = from + limit - 1;
  const q = options.search?.trim();

  let query = supabase
    .from("bioenergy_chakras")
    .select(BIOENERGY_CHAKRAS_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true, nullsFirst: false })
    .range(from, to);

  const searchOr = q ? buildChakrasSearchOrFilter(q) : null;
  if (searchOr) query = query.or(searchOr);

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) =>
    mapChakraListRow(row as unknown as Record<string, unknown>),
  );
  return { rows, error: null };
}

export async function fetchChakrasPage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<ChakrasFetchResult<ChakraListItem[]>> {
  logBioenergyChakrasSchemaOnce();
  try {
    const primary = await runChakrasPageQuery(tenantId, options);
    if (!primary.error) return { data: primary.rows, error: null };
    console.warn("[bioenergy_chakras] liste başarısız:", primary.error);
    if (options.search?.trim()) {
      const fallback = await runChakrasPageQuery(tenantId, {
        offset: options.offset,
        limit: options.limit,
      });
      if (!fallback.error) {
        return { data: fallback.rows, error: primary.error, usedFallback: true };
      }
    }
    return { data: [], error: primary.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: [], error: message };
  }
}

export async function fetchChakraRecordById(
  tenantId: string,
  recordId: string,
): Promise<ChakrasFetchResult<ChakraDetailItem | null>> {
  logBioenergyChakrasSchemaOnce();
  try {
    const { data, error } = await supabase
      .from("bioenergy_chakras")
      .select(BIOENERGY_CHAKRAS_DETAIL_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", recordId)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: null };

    return {
      data: mapChakraDetailRow(data as unknown as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}
