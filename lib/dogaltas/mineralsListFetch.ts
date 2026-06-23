import { supabase } from "@/lib/supabase";
import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";

/** Liste kartı — hafif kolonlar */
export const MINERALS_LIST_SELECT =
  "id, tenant_id, source_id, name, aciklama, kategori, created_at";

/** Arama modunda tüm tablo taraması (dizi alanları dahil) */
export const MINERALS_LIST_SEARCH_SELECT =
  "id, tenant_id, source_id, name, aciklama, kategori, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

export const MINERALS_LIST_PAGE_SIZE = 30;

// ─── Sıralama — tek kaynak ───────────────────────────────────────────────────
// Tüm liste sorguları ve demo referans tespiti bu sabitleri kullanır.
// Sıralama değişince yalnızca bu iki satırı güncelle.

export const MINERALS_LIST_ORDER_COLUMN = "name" as const;
export const MINERALS_LIST_ORDER_OPTIONS = {
  ascending: true,
  nullsFirst: false,
} as const;

/** Liste sayfası "Kategorisiz" filtresi */
export const MINERALS_UNCATEGORIZED_FILTER = "__uncategorized__";

/** Supabase .or() — yalnızca text kolonlar (dizi/JSON cast yok) */
export const MINERALS_LIST_SEARCH_TEXT_COLUMNS = [
  "name",
  "aciklama",
  "kategori",
  "source_id",
] as const;

export type MineralListItem = {
  id: string;
  tenant_id: string;
  source_id: string;
  name: string;
  aciklama: string | null;
  kategori: string | null;
  created_at: string;
};

/** Türkçe alfabetik sıralama — Ç, Ğ, İ, Ö, Ş, Ü destekli */
function sortMineralsByNameTr(rows: MineralListItem[]): MineralListItem[] {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, "tr-TR", { sensitivity: "base" }),
  );
}

type MineralSearchRow = MineralListItem & {
  fiziksel: unknown;
  zihinsel: unknown;
  fizyoloji: unknown;
  eksiklik_belirtileri: unknown;
  fazlalik_belirtileri: unknown;
  doz_asimi: unknown;
  iceren_taslar: unknown;
  organ_etkileri: unknown;
  cakralar: unknown;
};

export function buildMineralsListSearchOrFilter(term: string): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const pattern = `%${safeTerm}%`;
  return MINERALS_LIST_SEARCH_TEXT_COLUMNS.map(
    (col) => `${col}.ilike.${pattern}`,
  ).join(",");
}

export function ensureMineralStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function mineralSearchableText(row: MineralSearchRow): string {
  const parts: string[] = [
    row.name,
    row.aciklama ?? "",
    row.kategori ?? "",
    row.source_id,
    ...ensureMineralStringArray(row.fiziksel),
    ...ensureMineralStringArray(row.zihinsel),
    ...ensureMineralStringArray(row.fizyoloji),
    ...ensureMineralStringArray(row.eksiklik_belirtileri),
    ...ensureMineralStringArray(row.fazlalik_belirtileri),
    ...ensureMineralStringArray(row.doz_asimi),
    ...ensureMineralStringArray(row.iceren_taslar),
    ...ensureMineralStringArray(row.organ_etkileri),
    ...ensureMineralStringArray(row.cakralar),
  ];
  return parts.filter(Boolean).join(" ");
}

export function normalizeTrSearch(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function mineralRowMatchesSearch(row: MineralSearchRow, term: string): boolean {
  const safe = sanitizeOrSearchTerm(term);
  if (!safe) return true;
  const haystack = normalizeTrSearch(mineralSearchableText(row));
  const needle = normalizeTrSearch(safe);
  return Boolean(needle) && haystack.includes(needle);
}

function mineralMatchesCategory(
  kategori: string | null | undefined,
  category?: string,
): boolean {
  if (!category) return true;
  if (category === MINERALS_UNCATEGORIZED_FILTER) {
    return !kategori?.trim();
  }
  return (kategori?.trim() || "") === category;
}

export function mapMineralListRow(row: Record<string, unknown>): MineralListItem {
  return {
    id: String(row.id ?? ""),
    tenant_id: String(row.tenant_id ?? ""),
    source_id: String(row.source_id ?? ""),
    name: String(row.name ?? ""),
    aciklama: row.aciklama != null ? String(row.aciklama) : null,
    kategori: row.kategori != null ? String(row.kategori) : null,
    created_at: String(row.created_at ?? ""),
  };
}

function mapSearchRow(row: Record<string, unknown>): MineralSearchRow {
  return {
    ...mapMineralListRow(row),
    fiziksel: row.fiziksel,
    zihinsel: row.zihinsel,
    fizyoloji: row.fizyoloji,
    eksiklik_belirtileri: row.eksiklik_belirtileri,
    fazlalik_belirtileri: row.fazlalik_belirtileri,
    doz_asimi: row.doz_asimi,
    iceren_taslar: row.iceren_taslar,
    organ_etkileri: row.organ_etkileri,
    cakralar: row.cakralar,
  };
}

export async function fetchMineralsListCount(
  tenantId: string,
  search?: string,
  category?: string,
): Promise<{ count: number; error: string | null }> {
  const q = search?.trim();
  const categoryTrim = category?.trim();

  if (!q) {
    let query = supabase
      .from("minerals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (categoryTrim === MINERALS_UNCATEGORIZED_FILTER) {
      query = query.or("kategori.is.null,kategori.eq.");
    } else if (categoryTrim) {
      query = query.eq("kategori", categoryTrim);
    }

    const { count, error } = await query;
    if (error) return { count: 0, error: error.message };
    return { count: count ?? 0, error: null };
  }

  const { rows, error } = await fetchAllMineralsForSearch(tenantId, q, categoryTrim);
  if (error) return { count: 0, error };
  return { count: rows.length, error: null };
}

async function fetchAllMineralsForSearch(
  tenantId: string,
  term: string,
  category?: string,
): Promise<{ rows: MineralListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("minerals")
    .select(MINERALS_LIST_SEARCH_SELECT)
    .eq("tenant_id", tenantId)
    .order(MINERALS_LIST_ORDER_COLUMN, MINERALS_LIST_ORDER_OPTIONS);

  if (error) return { rows: [], error: error.message };

  const categoryTrim = category?.trim();
  const filtered = (data ?? [])
    .map((row) => mapSearchRow(row as Record<string, unknown>))
    .filter((row) => {
      if (!mineralMatchesCategory(row.kategori, categoryTrim)) return false;
      return mineralRowMatchesSearch(row, term);
    })
    .map(mapMineralListRow);

  return { rows: sortMineralsByNameTr(filtered), error: null };
}

/**
 * Demo referans mineral — liste sıralamasındaki ilk görünen kayıt.
 * Sıralama (name ASC) ve filtreler fetchMineralsListPage ile eşleşir;
 * böylece detay sayfasındaki referans tespiti liste görünümüyle tutarlı kalır.
 */
export async function getDemoReferenceMineralId(
  tenantId: string,
  options: { search?: string; category?: string } = {},
): Promise<string | null> {
  let query = supabase
    .from("minerals")
    .select("id")
    .eq("tenant_id", tenantId)
    .order(MINERALS_LIST_ORDER_COLUMN, MINERALS_LIST_ORDER_OPTIONS)
    .limit(1);

  const categoryTrim = options.category?.trim();
  if (categoryTrim === MINERALS_UNCATEGORIZED_FILTER) {
    query = query.or("kategori.is.null,kategori.eq.");
  } else if (categoryTrim) {
    query = query.eq("kategori", categoryTrim);
  }

  const q = options.search?.trim();
  if (q) {
    const orFilter = buildMineralsListSearchOrFilter(q);
    if (orFilter) query = query.or(orFilter);
  }

  const { data } = await query.maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

export async function fetchMineralsListPage(
  tenantId: string,
  options: {
    offset?: number;
    search?: string;
    category?: string;
    limit?: number;
  } = {},
): Promise<{ rows: MineralListItem[]; error: string | null }> {
  const limit = options.limit ?? MINERALS_LIST_PAGE_SIZE;
  const from = options.offset ?? 0;
  const q = options.search?.trim();
  const categoryTrim = options.category?.trim();

  if (!q) {
    let query = supabase
      .from("minerals")
      .select(MINERALS_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .order(MINERALS_LIST_ORDER_COLUMN, MINERALS_LIST_ORDER_OPTIONS)
      .range(from, from + limit - 1);

    if (categoryTrim === MINERALS_UNCATEGORIZED_FILTER) {
      query = query.or("kategori.is.null,kategori.eq.");
    } else if (categoryTrim) {
      query = query.eq("kategori", categoryTrim);
    }

    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };

    const rows = (data ?? []).map((row) =>
      mapMineralListRow(row as Record<string, unknown>),
    );
    return { rows: sortMineralsByNameTr(rows), error: null };
  }

  const { rows: allMatches, error } = await fetchAllMineralsForSearch(
    tenantId,
    q,
    categoryTrim,
  );
  if (error) return { rows: [], error };

  return {
    rows: allMatches.slice(from, from + limit),
    error: null,
  };
}
