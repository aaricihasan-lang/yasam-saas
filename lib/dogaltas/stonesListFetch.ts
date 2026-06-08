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

/**
 * Arama kolonları — YALNIZCA taş adı ve kısa açıklama.
 *
 * Neden sadece bu ikisi?
 * general_info / physical_effects / spiritual_effects / other_effects / warning_text
 * alanları başka taş adlarını sıkça referans verir (ör. "Ametist ile uyumludur").
 * Bu alanlarda arama yapılırsa alakasız taşlar (Malakit, Granat vb.) false-positive
 * olarak sonuçlara girer. Arama niyeti her zaman taş ADIYLA bulma olduğundan
 * yalnızca stone_name ve short_description aranır.
 */
export const STONES_LIST_SEARCH_TEXT_COLUMNS = [
  "stone_name",
  "short_description",
] as const;

/**
 * PostgREST .or() dizesini bozan karakterleri temizler.
 * chakras / assignments JSON cast kullanılmıyor (parse hatası).
 */
export function sanitizeOrSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[,()%']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Geniş kapsamlı liste araması — select hâlâ hafif kolonlar */
export function buildStonesListSearchOrFilter(term: string): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const pattern = `%${safeTerm}%`;
  return STONES_LIST_SEARCH_TEXT_COLUMNS.map(
    (col) => `${col}.ilike.${pattern}`,
  ).join(",");
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
