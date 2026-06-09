import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

// ─── Select ──────────────────────────────────────────────────────────────────

/** Liste görünümü — ağır metin alanları yok */
export const STONES_LIST_SELECT =
  "id, tenant_id, stone_name, short_description, chakras, images, updated_at";

/**
 * Detay filtreler (burç, uyarı, mineral) için genişletilmiş select.
 * assignments, warning_text, warning_tags dahil — client-side filtreleme için.
 */
export const STONES_LIST_EXTENDED_SELECT =
  "id, tenant_id, stone_name, short_description, assignments, warning_text, warning_tags, chakras, images, updated_at";

export const STONES_LIST_PAGE_SIZE = 30;

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type StoneListItem = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  chakras: string[] | null;
  images: unknown;
  updated_at: string | null;
};

export type StoneListItemExtended = StoneListItem & {
  assignments: unknown;
  warning_text: string | null;
  warning_tags: string[] | null;
};

// ─── Arama sütunları ─────────────────────────────────────────────────────────

/**
 * TAŞ İSMİ MODU — yalnızca stone_name.
 * False-positive oluşturmaz; sadece adında eşleşen taşlar döner.
 */
export const NAME_SEARCH_COLUMNS = ["stone_name"] as const;

/**
 * İÇERİK MODU — metin alanları (JSON/dizi cast YOK → Supabase OR filter safe).
 * Ekip alanlarında eşleşme olursa diğer taş isimleri false-positive üretebilir;
 * bu kabul edilebilir — kullanıcı bunu bilerek seçiyor.
 */
export const CONTENT_SEARCH_COLUMNS = [
  "stone_name",
  "short_description",
  "general_info",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "warning_text",
  "source_note",
  "feng_shui",
  "meditation",
  "care",
  "application",
] as const;

export type SearchMode = "name" | "content";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** PostgREST .or() dizesini bozan karakterleri temizler. */
export function sanitizeOrSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[,()%']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Seçilen moda göre PostgREST .or() filtre dizesi üretir.
 * Yalnızca düz metin sütunları — JSON/dizi cast içermez.
 */
export function buildStonesListSearchOrFilter(
  term: string,
  mode: SearchMode = "name",
): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const columns =
    mode === "content" ? CONTENT_SEARCH_COLUMNS : NAME_SEARCH_COLUMNS;
  const pattern = `%${safeTerm}%`;
  return columns.map((col) => `${col}.ilike.${pattern}`).join(",");
}

// ─── Satır eşleyici ──────────────────────────────────────────────────────────

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

export function mapStoneExtendedRow(
  row: Record<string, unknown>,
): StoneListItemExtended {
  return {
    id: String(row.id ?? ""),
    tenant_id: String(row.tenant_id ?? ""),
    stone_name: String(row.stone_name ?? ""),
    short_description:
      row.short_description != null ? String(row.short_description) : null,
    assignments: row.assignments ?? null,
    warning_text:
      row.warning_text != null ? String(row.warning_text) : null,
    warning_tags: Array.isArray(row.warning_tags)
      ? (row.warning_tags as string[])
      : null,
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

// ─── Tenant yardımcısı ───────────────────────────────────────────────────────

/**
 * Liste sorgularında kütüphane taşlarının (ADMIN_LIBRARY_TENANT_ID) da
 * görünmesi için kullanıcı tenant_id'si ile birlikte döner.
 */
function tenantFilterIds(tenantId: string): string[] {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return [tenantId];
  return [tenantId, ADMIN_LIBRARY_TENANT_ID];
}

// ─── Sorgu fonksiyonları ─────────────────────────────────────────────────────

export async function fetchStonesListCount(
  tenantId: string,
  search?: string,
  searchMode?: SearchMode,
): Promise<{ count: number; error: string | null }> {
  const ids = tenantFilterIds(tenantId);
  const q = search?.trim();
  let query = supabase
    .from("stones")
    .select("id", { count: "exact", head: true })
    .in("tenant_id", ids);

  const searchOr = q
    ? buildStonesListSearchOrFilter(q, searchMode ?? "name")
    : null;
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function fetchStonesListPage(
  tenantId: string,
  options: {
    offset?: number;
    search?: string;
    limit?: number;
    searchMode?: SearchMode;
  } = {},
): Promise<{ rows: StoneListItem[]; error: string | null }> {
  const limit = options.limit ?? STONES_LIST_PAGE_SIZE;
  const from = options.offset ?? 0;
  const to = from + limit - 1;
  const ids = tenantFilterIds(tenantId);
  const q = options.search?.trim();

  let query = supabase
    .from("stones")
    .select(STONES_LIST_SELECT)
    .in("tenant_id", ids)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  const searchOr = q
    ? buildStonesListSearchOrFilter(q, options.searchMode ?? "name")
    : null;
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

/**
 * Detay filtreler aktifken TÜM taşları genişletilmiş alanlarla çeker.
 * Pagination yok — client-side filtre için tam set gerekli.
 */
export async function fetchAllStonesExtended(
  tenantId: string,
): Promise<{ rows: StoneListItemExtended[]; error: string | null }> {
  const { data, error } = await supabase
    .from("stones")
    .select(STONES_LIST_EXTENDED_SELECT)
    .in("tenant_id", tenantFilterIds(tenantId))
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) =>
    mapStoneExtendedRow(row as Record<string, unknown>),
  );
  return { rows, error: null };
}
