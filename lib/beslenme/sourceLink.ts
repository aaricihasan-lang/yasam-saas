import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOURCE_COLUMNS, SOURCE_TYPES, cleanStr, cleanUrl, inEnum, isUuid } from "./contracts";

/**
 * Beslenme — kaynak oluşturma + kayda bağlama (besin / rehber) ortak sunucu yardımcıları.
 *
 * ORPHAN KORUMASI: "Oluştur ve Bağla" artık TEK istek: kaynak sunucuda oluşturulur, bağ
 * eklenir; bağ BAŞARISIZ olursa yeni oluşturulan kaynak aynı istekte geri silinir (boşta kaynak
 * bırakılmaz). Mevcut kaynak bağlamada kaynak kataloğu değişmez.
 */

export const SOURCE_CREATE_KEYS = [
  "title", "authors", "organization", "source_type", "publication_year",
  "edition", "page_range", "chapter", "url", "reference_code", "note",
] as const;

export function buildSourcePayload(body: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const title = cleanStr(body.title, 400);
  if (!title) return { error: "TITLE_REQUIRED" };
  if (body.source_type != null && !inEnum(body.source_type, SOURCE_TYPES)) return { error: "BAD_SOURCE_TYPE" };
  let year: number | null = null;
  if (body.publication_year != null) {
    if (!Number.isInteger(body.publication_year) || (body.publication_year as number) < 1000 || (body.publication_year as number) > 2200)
      return { error: "BAD_YEAR" };
    year = body.publication_year as number;
  }
  return {
    title,
    authors: cleanStr(body.authors, 500),
    organization: cleanStr(body.organization, 300),
    source_type: inEnum(body.source_type, SOURCE_TYPES) ? body.source_type : null,
    publication_year: year,
    edition: cleanStr(body.edition, 100),
    page_range: cleanStr(body.page_range, 100),
    chapter: cleanStr(body.chapter, 200),
    url: cleanUrl(body.url),
    reference_code: cleanStr(body.reference_code, 200),
    note: cleanStr(body.note, 4000),
  };
}

export type LinkTarget =
  | { table: "nutrition_food_sources"; parentColumn: "food_id"; parentId: string; columns: string }
  | { table: "nutrition_topic_sources"; parentColumn: "topic_id"; parentId: string; columns: string };

export type LinkResult =
  | { ok: true; link: Record<string, unknown>; source: Record<string, unknown> | null }
  | { ok: false; code: string; status: number };

/**
 * body: { source_id } (mevcut kaynak) VEYA { new_source: {...} } (oluştur + bağla) + locator/note/sort_order.
 * Çağıran route: modül guard + demo deny + parent sahipliği (tenant) doğrulanmış olmalı.
 */
export async function linkSourceWithOptionalCreate(
  db: SupabaseClient,
  tenantId: string,
  target: LinkTarget,
  body: Record<string, unknown>,
): Promise<LinkResult> {
  const hasExisting = body.source_id != null;
  const hasNew = body.new_source != null;
  if (hasExisting === hasNew) return { ok: false, code: "BAD_SOURCE", status: 400 };

  let sourceId: string;
  let created: Record<string, unknown> | null = null;
  if (hasExisting) {
    if (!isUuid(body.source_id)) return { ok: false, code: "BAD_SOURCE", status: 400 };
    sourceId = body.source_id as string;
  } else {
    const raw = body.new_source;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "BAD_SOURCE", status: 400 };
    const rawObj = raw as Record<string, unknown>;
    if (!Object.keys(rawObj).every((k) => (SOURCE_CREATE_KEYS as readonly string[]).includes(k)))
      return { ok: false, code: "UNKNOWN_FIELD", status: 400 };
    const payload = buildSourcePayload(rawObj);
    if ("error" in payload) return { ok: false, code: String(payload.error), status: 400 };
    const { data, error } = await db
      .from("nutrition_sources")
      .insert({ tenant_id: tenantId, ...payload })
      .select(SOURCE_COLUMNS)
      .single();
    if (error || !data) return { ok: false, code: "CREATE_FAILED", status: 500 };
    created = data as Record<string, unknown>;
    sourceId = created.id as string;
  }

  const insert = {
    tenant_id: tenantId,
    [target.parentColumn]: target.parentId,
    source_id: sourceId,
    locator: cleanStr(body.locator, 200),
    note: cleanStr(body.note, 2000),
    sort_order: Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0,
  };
  const { data: link, error: linkErr } = await db.from(target.table).insert(insert).select(target.columns).single();
  if (linkErr || !link) {
    // Kompanzasyon: bu istekte oluşturulan kaynak boşta kalmasın.
    if (created) await db.from("nutrition_sources").delete().eq("tenant_id", tenantId).eq("id", sourceId);
    if (linkErr?.code === "23505") return { ok: false, code: "DUPLICATE_LINK", status: 409 };
    if (linkErr?.code === "23503") return { ok: false, code: "NOT_FOUND", status: 404 };
    return { ok: false, code: "LINK_FAILED", status: 500 };
  }
  return { ok: true, link: link as unknown as Record<string, unknown>, source: created };
}
