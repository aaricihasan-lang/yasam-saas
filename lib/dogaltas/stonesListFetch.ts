import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

// NOT (Faz 1-B): Bu modül artık tarayıcıdan doğrudan supabase.from("stones")
// ÇAĞIRMAZ. Tüm liste/sayım/arama/exclusion erişimi /api/dogaltas/* güvenli
// route'larına gider; tenant_id sunucuda oturumdan belirlenir. Demo showcase
// (kütüphane dahil) ve K-1 pagination mantığı SUNUCU TARAFINA taşındı (route).

// ─── Select ──────────────────────────────────────────────────────────────────

/** Liste görünümü — ağır metin alanları yok */
export const STONES_LIST_SELECT =
  "id, tenant_id, stone_name, short_description, chakras, images, updated_at";

/**
 * Tam içerik araması için genişletilmiş select — tüm metin alanları dahil.
 * Bu select ile gelen veriler client-side full-text aramasında kullanılır.
 */
export const STONES_LIST_EXTENDED_SELECT =
  "id, tenant_id, stone_name, short_description, general_info, source_note, physical_effects, spiritual_effects, other_effects, feng_shui, meditation, care, application, assignments, warning_text, warning_tags, chakras, images, updated_at";

export const STONES_LIST_PAGE_SIZE = 30;

// ─── Sıralama — tek kaynak ───────────────────────────────────────────────────
// Tüm liste sorguları ve demo referans tespiti bu sabitleri kullanır.
// Sıralama değişince yalnızca bu iki satırı güncelle.

export const STONES_LIST_ORDER_COLUMN = "stone_name" as const;
export const STONES_LIST_ORDER_OPTIONS = {
  ascending: true,
  nullsFirst: false,
} as const;

/** Türkçe alfabetik sıralama — Ç, Ğ, İ, Ö, Ş, Ü destekli */
function sortStonesByNameTr<T extends { stone_name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.stone_name.localeCompare(b.stone_name, "tr-TR", { sensitivity: "base" }),
  );
}

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
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  assignments: unknown;
  warning_text: string | null;
  warning_tags: string[] | null;
};

// ─── Arama sütunları ─────────────────────────────────────────────────────────

/**
 * TAŞ İSMİ MODU — yalnızca taş adı.
 * Türkçe İ/ı varyantları OR filtresine otomatik eklenir (bkz. buildIlikePatterns).
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
 * Türkçe i/İ/ı varyantlarını kapsayan ilike pattern dizisi üretir.
 *
 * Sorun: PostgreSQL C/en_US locale'de `ilike '%safir%'` "SAFİR" ile eşleşmez
 * çünkü İ (U+0130) ve i (U+0069) ASCII folding kapsamı dışında kalır.
 *
 * Çözüm: her terim için üç varyant üretilir:
 *   - orijinal: %safir%
 *   - dotted cap-İ: %safİr%  → C locale'de "SAFİR" ile eşleşir
 *   - dotless ı:   %safır%   → "SAFIR" (dotless) ile eşleşir
 */
function buildIlikePatterns(safeTerm: string): string[] {
  const base = `%${safeTerm}%`;
  const patterns = new Set<string>([base]);

  if (/[iıİ]/i.test(safeTerm)) {
    const capDotted = safeTerm.replace(/[iı]/gi, "İ");
    const dotless   = safeTerm.replace(/[iİ]/gi, "ı");
    patterns.add(`%${capDotted}%`);
    patterns.add(`%${dotless}%`);
  }

  return [...patterns];
}

/**
 * Seçilen moda göre PostgREST .or() filtre dizesi üretir.
 * Türkçe İ/ı varyantları her sütun için otomatik eklenir.
 */
export function buildStonesListSearchOrFilter(
  term: string,
  mode: SearchMode = "name",
): string | null {
  const safeTerm = sanitizeOrSearchTerm(term);
  if (!safeTerm) return null;

  const columns =
    mode === "content" ? CONTENT_SEARCH_COLUMNS : NAME_SEARCH_COLUMNS;
  const patterns = buildIlikePatterns(safeTerm);

  const parts: string[] = [];
  for (const col of columns) {
    for (const pattern of patterns) {
      parts.push(`${col}.ilike.${pattern}`);
    }
  }
  return parts.join(",");
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

const strOrNull = (v: unknown) => (v != null ? String(v) : null);

export function mapStoneExtendedRow(
  row: Record<string, unknown>,
): StoneListItemExtended {
  return {
    id: String(row.id ?? ""),
    tenant_id: String(row.tenant_id ?? ""),
    stone_name: String(row.stone_name ?? ""),
    short_description: strOrNull(row.short_description),
    general_info: strOrNull(row.general_info),
    source_note: strOrNull(row.source_note),
    physical_effects: strOrNull(row.physical_effects),
    spiritual_effects: strOrNull(row.spiritual_effects),
    other_effects: strOrNull(row.other_effects),
    feng_shui: strOrNull(row.feng_shui),
    meditation: strOrNull(row.meditation),
    care: strOrNull(row.care),
    application: strOrNull(row.application),
    assignments: row.assignments ?? null,
    warning_text: strOrNull(row.warning_text),
    warning_tags: Array.isArray(row.warning_tags)
      ? (row.warning_tags as string[])
      : null,
    chakras: Array.isArray(row.chakras)
      ? row.chakras.map((c) => String(c))
      : null,
    images: row.images,
    updated_at: strOrNull(row.updated_at),
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

/** Detay drawer'ı için web'de gösterilebilir (http/https) tüm görsel URL'leri. */
export function getStoneImageUrls(
  images: unknown,
): { url: string; name: string }[] {
  if (!Array.isArray(images)) return [];
  const out: { url: string; name: string }[] = [];
  images.forEach((img, index) => {
    if (!img || typeof img !== "object") return;
    const rec = img as Record<string, unknown>;
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!url || !/^https?:\/\//i.test(url)) return;
    out.push({
      url,
      name: typeof rec.name === "string" && rec.name.trim()
        ? rec.name
        : `Görsel ${index + 1}`,
    });
  });
  return out;
}

// ─── Sorgu fonksiyonları (artık /api/dogaltas/stones üzerinden) ──────────────
// İmzalar KORUNDU (tenantId parametresi geriye-uyum için kalır ama kullanılmaz;
// tenant sunucuda oturumdan gelir). Demo/exclusion/pagination/arama SUNUCUDA.

function buildStonesQuery(
  mode: string,
  opts: { offset?: number; limit?: number; search?: string; searchMode?: SearchMode; withCount?: boolean } = {},
): string {
  const p = new URLSearchParams({ mode });
  if (opts.offset != null) p.set("offset", String(opts.offset));
  if (opts.limit != null) p.set("limit", String(opts.limit));
  if (opts.withCount) p.set("withCount", "1");
  const q = opts.search?.trim();
  if (q) { p.set("q", q); p.set("searchMode", opts.searchMode ?? "name"); }
  return `/api/dogaltas/stones?${p.toString()}`;
}

export async function fetchStonesListCount(
  _tenantId: string,
  search?: string,
  searchMode?: SearchMode,
): Promise<{ count: number; error: string | null }> {
  const r = await dogaltasApiGet<{ count?: number }>(
    buildStonesQuery("count", { search, searchMode }));
  if (!r.ok) return { count: 0, error: r.error ?? "Okuma hatası" };
  return { count: r.data?.count ?? 0, error: null };
}

export async function fetchStonesListPage(
  _tenantId: string,
  options: {
    offset?: number;
    search?: string;
    limit?: number;
    searchMode?: SearchMode;
    /** O-3: true → liste ile birlikte toplam sayı (count) TEK çağrıda döner. */
    withCount?: boolean;
  } = {},
): Promise<{ rows: StoneListItem[]; count?: number; error: string | null }> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[]; count?: number }>(
    buildStonesQuery("list", options));
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  const rows = (r.data?.rows ?? []).map(mapStoneListRow);
  return {
    rows: sortStonesByNameTr(rows),
    count: typeof r.data?.count === "number" ? r.data.count : undefined,
    error: null,
  };
}

/**
 * Detay filtreler aktifken TÜM taşları genişletilmiş alanlarla çeker.
 * Pagination yok — client-side filtre için tam set gerekli.
 */
export async function fetchAllStonesExtended(
  _tenantId: string,
): Promise<{ rows: StoneListItemExtended[]; error: string | null }> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(
    buildStonesQuery("extended"));
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  const rows = (r.data?.rows ?? []).map(mapStoneExtendedRow);
  return { rows: sortStonesByNameTr(rows), error: null };
}

// ─── Kullanıcı bazlı exclusion yardımcısı ────────────────────────────────────

/**
 * Bu tenant için gizlenmiş (kaldırılmış) taş ID'lerini döner.
 * Kütüphane taşı "soft-delete" mantığı için kullanılır.
 */
export async function fetchStoneExclusions(_tenantId: string): Promise<Set<string>> {
  const r = await dogaltasApiGet<{ stoneIds?: string[] }>("/api/dogaltas/stone-exclusions");
  if (!r.ok) return new Set();
  return new Set((r.data?.stoneIds ?? []).map((s) => String(s)));
}

/**
 * Demo hesapta referans taş ID'sini döner — liste sıralamasındaki ilk görünen taş.
 * Liste route'uyla AYNI kaynak (mode=list, limit=1): tenant/exclusion/arama sunucuda.
 */
export async function getDemoReferenceStoneId(
  _tenantId: string,
  options: { search?: string; searchMode?: SearchMode } = {},
): Promise<string | null> {
  const r = await dogaltasApiGet<{ rows?: { id?: unknown }[] }>(
    buildStonesQuery("list", { limit: 1, search: options.search, searchMode: options.searchMode }));
  if (!r.ok) return null;
  const first = r.data?.rows?.[0]?.id;
  return typeof first === "string" ? first : null;
}

/**
 * Kütüphane taşlarını bu tenant için gizler (server: upsert, tenant oturumdan).
 */
export async function excludeStonesForTenant(
  _tenantId: string,
  stoneIds: string[],
): Promise<{ error: string | null }> {
  if (stoneIds.length === 0) return { error: null };
  const r = await dogaltasApiSend("/api/dogaltas/stone-exclusions", "POST", { stoneIds });
  return { error: r.ok ? null : (r.error ?? "Gizlenemedi") };
}
