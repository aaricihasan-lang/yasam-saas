import { supabase } from "@/lib/supabase";
import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";

export const SYMBOL_LANGUAGE_LIST_PATH = "/dashboard/biyoenerji/sembol-dili";

/** bioenergy_symbols — yalnızca tabloda doğrulanmış kolonlar */
export const SYMBOL_LANGUAGE_LIST_SELECT =
  "id, tenant_id, symbol, title, category, meaning, note, source, created_at";

export const SYMBOL_LANGUAGE_PAGE_SIZE = 30;

/** .or() araması — olmayan kolon eklenmez */
export const SYMBOL_LANGUAGE_SEARCH_TEXT_COLUMNS = [
  "symbol",
  "title",
  "category",
  "meaning",
  "note",
  "source",
] as const;

export type SymbolLanguageListItem = {
  id: string;
  tenant_id: string;
  symbol: string | null;
  title: string | null;
  category: string | null;
  meaning: string | null;
  note: string | null;
  source: string | null;
  created_at: string;
};

export function buildSymbolLanguageSearchOrFilter(term: string): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const pattern = `%${safeTerm}%`;
  return SYMBOL_LANGUAGE_SEARCH_TEXT_COLUMNS.map((col) => `${col}.ilike.${pattern}`).join(
    ",",
  );
}

export function mapSymbolLanguageListRow(row: Record<string, unknown>): SymbolLanguageListItem {
  return {
    id: String(row.id ?? "").trim(),
    tenant_id: String(row.tenant_id ?? ""),
    symbol: row.symbol != null ? String(row.symbol) : null,
    title: row.title != null ? String(row.title) : null,
    category: row.category != null ? String(row.category) : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    note: row.note != null ? String(row.note) : null,
    source: row.source != null ? String(row.source) : null,
    created_at: String(row.created_at ?? ""),
  };
}

export function symbolDisplayName(row: Pick<SymbolLanguageListItem, "symbol" | "title">) {
  return row.symbol?.trim() || row.title?.trim() || "İsimsiz sembol";
}

export function previewSymbolLanguageText(
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

export async function fetchSymbolLanguageCount(
  tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  const q = search?.trim();
  let query = supabase
    .from("bioenergy_symbols")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const searchOr = q ? buildSymbolLanguageSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchSymbolLanguagePage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<{ rows: SymbolLanguageListItem[]; error: string | null }> {
  const limit = options.limit ?? SYMBOL_LANGUAGE_PAGE_SIZE;
  const from = options.offset ?? 0;
  const to = from + limit - 1;
  const q = options.search?.trim();

  let query = supabase
    .from("bioenergy_symbols")
    .select(SYMBOL_LANGUAGE_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("title", { ascending: true, nullsFirst: false })
    .range(from, to);

  const searchOr = q ? buildSymbolLanguageSearchOrFilter(q) : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) =>
    mapSymbolLanguageListRow(row as Record<string, unknown>),
  );
  return { rows, error: null };
}
