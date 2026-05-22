import { supabase } from "@/lib/supabase";
import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import {
  BIOENERGY_SYMBOLS_LIST_SELECT,
  BIOENERGY_SYMBOLS_TEXT_SEARCH_COLUMNS,
  logBioenergySymbolsSchemaOnce,
} from "@/lib/bioenergy/symbolLanguageSchema";

export const SYMBOL_LANGUAGE_LIST_PATH = "/dashboard/biyoenerji/sembol-dili";

export const SYMBOL_LANGUAGE_LIST_SELECT = BIOENERGY_SYMBOLS_LIST_SELECT;

export const SYMBOL_LANGUAGE_PAGE_SIZE = 30;

export const SYMBOL_LANGUAGE_SEARCH_TEXT_COLUMNS = BIOENERGY_SYMBOLS_TEXT_SEARCH_COLUMNS;

export type SymbolLanguageListItem = {
  id: string;
  tenant_id: string;
  symbol: string | null;
  title: string | null;
  category: string | null;
  meaning: string | null;
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

export type SymbolLanguageFetchResult<T> = {
  data: T;
  error: string | null;
  /** Birincil sorgu başarısız, yedek sorgu kullanıldı */
  usedFallback?: boolean;
};

async function runSymbolLanguageCountQuery(
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

export async function fetchSymbolLanguageCount(
  tenantId: string,
  search?: string,
): Promise<SymbolLanguageFetchResult<number>> {
  logBioenergySymbolsSchemaOnce();

  try {
    const primary = await runSymbolLanguageCountQuery(tenantId, search);
    if (!primary.error) {
      return { data: primary.count, error: null };
    }

    console.warn("[bioenergy_symbols] count sorgusu başarısız:", primary.error);

    if (search?.trim()) {
      const fallback = await runSymbolLanguageCountQuery(tenantId);
      if (!fallback.error) {
        return { data: fallback.count, error: primary.error, usedFallback: true };
      }
    }

    return { data: 0, error: primary.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bioenergy_symbols] count exception:", message);
    return { data: 0, error: message };
  }
}

async function runSymbolLanguagePageQuery(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number },
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
    mapSymbolLanguageListRow(row as unknown as Record<string, unknown>),
  );
  return { rows, error: null };
}

export async function fetchSymbolLanguagePage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number } = {},
): Promise<SymbolLanguageFetchResult<SymbolLanguageListItem[]>> {
  logBioenergySymbolsSchemaOnce();

  try {
    const primary = await runSymbolLanguagePageQuery(tenantId, options);
    if (!primary.error) {
      return { data: primary.rows, error: null };
    }

    console.warn("[bioenergy_symbols] liste sorgusu başarısız:", primary.error);

    if (options.search?.trim()) {
      const fallback = await runSymbolLanguagePageQuery(tenantId, {
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
    console.error("[bioenergy_symbols] liste exception:", message);
    return { data: [], error: message };
  }
}

export async function fetchSymbolLanguageRecordById(
  tenantId: string,
  recordId: string,
): Promise<SymbolLanguageFetchResult<SymbolLanguageListItem | null>> {
  logBioenergySymbolsSchemaOnce();

  try {
    const { data, error } = await supabase
      .from("bioenergy_symbols")
      .select(SYMBOL_LANGUAGE_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", recordId)
      .maybeSingle();

    if (error) {
      console.warn("[bioenergy_symbols] detay sorgusu başarısız:", error.message);
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return {
      data: mapSymbolLanguageListRow(data as unknown as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bioenergy_symbols] detay exception:", message);
    return { data: null, error: message };
  }
}
