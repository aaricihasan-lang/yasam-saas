import { sanitizeOrSearchTerm } from "@/lib/dogaltas/stonesListFetch";
import {
  BIOENERGY_CHAKRAS_TEXT_SEARCH_COLUMNS,
  logBioenergyChakrasSchemaOnce,
} from "@/lib/bioenergy/chakrasSchema";
import { bioApiCount, bioApiGetOne, bioApiList } from "@/lib/biyoenerji/secureApi";

const RESOURCE = "chakras";

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
  /** P4 provenance — 'admin_transfer' ise "Admin Kütüphanesi" rozeti. */
  origin_type?: string | null;
};

export type ChakraDetailItem = ChakraListItem & {
  glands: string | null;
  physical: string | null;
  mental: string | null;
  /**
   * FAZ 3.2C — parent additive quick-fact kolonları (migration DORMANT).
   * Kolonlar production'da henüz uygulanmadığından prod'da `select("*")` bunları
   * DÖNDÜRMEZ → defensif okuma null verir (mevcut davranış korunur). İçerik gelince
   * (FAZ 3.3) Genel Bakış compact satırlarını besler.
   */
  sanskrit_name: string | null;
  element: string | null;
  location: string | null;
  bija_mantra: string | null;
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
    // FAZ 3.2C additive quick facts — kolon yoksa (dormant) undefined → null.
    sanskrit_name: row.sanskrit_name != null ? String(row.sanskrit_name) : null,
    element: row.element != null ? String(row.element) : null,
    location: row.location != null ? String(row.location) : null,
    bija_mantra: row.bija_mantra != null ? String(row.bija_mantra) : null,
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
  _tenantId: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  return bioApiCount(RESOURCE, search);
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
  _tenantId: string,
  options: { offset?: number; search?: string; limit?: number },
): Promise<{ rows: ChakraListItem[]; error: string | null }> {
  const { rows, error } = await bioApiList(RESOURCE, {
    offset: options.offset,
    limit: options.limit ?? CHAKRAS_PAGE_SIZE,
    search: options.search,
  });
  if (error) return { rows: [], error };
  return { rows: rows.map((row) => mapChakraListRow(row)), error: null };
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
  _tenantId: string,
  recordId: string,
): Promise<ChakrasFetchResult<ChakraDetailItem | null>> {
  logBioenergyChakrasSchemaOnce();
  try {
    const { row, error } = await bioApiGetOne(RESOURCE, recordId);
    if (error) return { data: null, error };
    if (!row) return { data: null, error: null };

    return {
      data: mapChakraDetailRow(row),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}
