import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import { dogaltasApiGet } from "@/lib/dogaltas/dogaltasApi";

// NOT (Faz 1-B): Mineral liste/sayım/arama artık /api/dogaltas/minerals üzerinden;
// tarayıcı doğrudan supabase.from("minerals") ÇAĞIRMAZ. tenant sunucudan.

/** Liste kartı — hafif kolonlar */
export const MINERALS_LIST_SELECT =
  "id, tenant_id, source_id, name, aciklama, kategori, created_at";

/** Arama modunda tüm tablo taraması (dizi alanları dahil) */
export const MINERALS_LIST_SEARCH_SELECT =
  "id, tenant_id, source_id, name, aciklama, kategori, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

export const MINERALS_LIST_PAGE_SIZE = 30;

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

function buildMineralsQuery(
  mode: string,
  opts: { offset?: number; limit?: number; search?: string; category?: string } = {},
): string {
  const p = new URLSearchParams({ mode });
  if (opts.offset != null) p.set("offset", String(opts.offset));
  if (opts.limit != null) p.set("limit", String(opts.limit));
  const q = opts.search?.trim();
  if (q) p.set("q", q);
  const c = opts.category?.trim();
  if (c) p.set("category", c);
  return `/api/dogaltas/minerals?${p.toString()}`;
}

export async function fetchMineralsListCount(
  _tenantId: string,
  search?: string,
  category?: string,
): Promise<{ count: number; error: string | null }> {
  const r = await dogaltasApiGet<{ count?: number }>(buildMineralsQuery("count", { search, category }));
  if (!r.ok) return { count: 0, error: r.error ?? "Okuma hatası" };
  return { count: r.data?.count ?? 0, error: null };
}

export async function fetchMineralsListPage(
  _tenantId: string,
  options: {
    offset?: number;
    search?: string;
    category?: string;
    limit?: number;
  } = {},
): Promise<{ rows: MineralListItem[]; error: string | null }> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(buildMineralsQuery("list", options));
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  return { rows: (r.data?.rows ?? []).map(mapMineralListRow), error: null };
}

/**
 * Demo referans mineral — liste sıralamasındaki ilk görünen kayıt (server: limit=1).
 */
export async function getDemoReferenceMineralId(
  _tenantId: string,
  options: { search?: string; category?: string } = {},
): Promise<string | null> {
  const r = await dogaltasApiGet<{ rows?: { id?: unknown }[] }>(
    buildMineralsQuery("list", { limit: 1, search: options.search, category: options.category }));
  if (!r.ok) return null;
  const first = r.data?.rows?.[0]?.id;
  return typeof first === "string" ? first : null;
}
