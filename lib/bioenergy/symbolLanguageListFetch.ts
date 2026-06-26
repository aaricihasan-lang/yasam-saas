import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import {
  BIOENERGY_SYMBOLS_LIST_SELECT,
  BIOENERGY_SYMBOLS_TEXT_SEARCH_COLUMNS,
  logBioenergySymbolsSchemaOnce,
} from "@/lib/bioenergy/symbolLanguageSchema";
import { bioApiCount, bioApiGetOne, bioApiList } from "@/lib/biyoenerji/secureApi";

const RESOURCE = "symbols";

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
  _tenantId: string,
  search?: string,
  category?: string,
): Promise<{ count: number; error: string | null }> {
  return bioApiCount(RESOURCE, search, category);
}

export async function fetchSymbolLanguageCount(
  tenantId: string,
  search?: string,
  category?: string,
): Promise<SymbolLanguageFetchResult<number>> {
  logBioenergySymbolsSchemaOnce();

  try {
    const primary = await runSymbolLanguageCountQuery(tenantId, search, category);
    if (!primary.error) {
      return { data: primary.count, error: null };
    }

    console.warn("[bioenergy_symbols] count sorgusu başarısız:", primary.error);

    if (search?.trim()) {
      const fallback = await runSymbolLanguageCountQuery(tenantId, undefined, category);
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
  _tenantId: string,
  options: { offset?: number; search?: string; limit?: number; category?: string },
): Promise<{ rows: SymbolLanguageListItem[]; error: string | null }> {
  const { rows, error } = await bioApiList(RESOURCE, {
    offset: options.offset,
    limit: options.limit ?? SYMBOL_LANGUAGE_PAGE_SIZE,
    search: options.search,
    category: options.category,
  });
  if (error) return { rows: [], error };
  return { rows: rows.map((row) => mapSymbolLanguageListRow(row)), error: null };
}

export async function fetchSymbolLanguagePage(
  tenantId: string,
  options: { offset?: number; search?: string; limit?: number; category?: string } = {},
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
        category: options.category,
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
  _tenantId: string,
  recordId: string,
): Promise<SymbolLanguageFetchResult<SymbolLanguageListItem | null>> {
  logBioenergySymbolsSchemaOnce();

  try {
    const { row, error } = await bioApiGetOne(RESOURCE, recordId);
    if (error) {
      console.warn("[bioenergy_symbols] detay sorgusu başarısız:", error);
      return { data: null, error };
    }
    if (!row) {
      return { data: null, error: null };
    }

    return {
      data: mapSymbolLanguageListRow(row),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bioenergy_symbols] detay exception:", message);
    return { data: null, error: message };
  }
}
