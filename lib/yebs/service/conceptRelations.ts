import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A5A (yebs_concept_relations) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (A5AR):
 *   - Yalnız okuma: listConceptRelations + getConceptRelationById.
 *   - Admin doğrulaması route sorumluluğu (verifyAdminRequest).
 *   - Yalnız enjekte edilen `db` (service_role); ham DB hata metni route'a taşınmaz.
 *   - Canonical row guard (fail-closed): beklenen 7 alanı taşımayan satır OKUMA
 *     HATASI olarak reddedilir.
 *   - Mutation YOK; Concept adı/label JOIN YOK; Relation Sources gömme YOK;
 *     source count / sentetik inverse row DÖNMEZ.
 *   - Relation = kayıt-yönlü canonical ilişki gövdesi; provenans D9'da.
 *
 * Güvenlik: `import "server-only"`.
 */

/** D8 canonical kolonlar — AÇIK liste. select("*") YOK. */
export const YEBS_CONCEPT_RELATION_COLUMNS =
  "id, source_concept_id, target_concept_id, relation_type, status, created_at, updated_at";

/** D8 relation_type CHECK değer kümesi (5). */
export const YEBS_CONCEPT_RELATION_TYPES = [
  "broader_than",
  "part_of",
  "related_to",
  "contrasted_with",
  "corresponds_to",
] as const;
export type YebsConceptRelationType = (typeof YEBS_CONCEPT_RELATION_TYPES)[number];

/** D8 status CHECK değer kümesi (7; rejected YOK). */
export const YEBS_CONCEPT_RELATION_STATUSES = [
  "draft",
  "under_review",
  "needs_verification",
  "verified",
  "approved",
  "published",
  "archived",
] as const;
export type YebsConceptRelationStatus = (typeof YEBS_CONCEPT_RELATION_STATUSES)[number];

export type YebsConceptRelationRow = {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ListConceptRelationsFilters = {
  limit: number;
  offset: number;
  sourceConceptId?: string;
  targetConceptId?: string;
  /** source_concept_id VEYA target_concept_id eşleşmesi (herhangi bir uç). */
  conceptId?: string;
  relationType?: YebsConceptRelationType;
  status?: YebsConceptRelationStatus;
  hasSources?: boolean;
  sourceId?: string;
};

export type ListConceptRelationsResult =
  | { ok: true; rows: YebsConceptRelationRow[]; count: number }
  | { ok: false; code: "YEBS_CONCEPT_RELATIONS_LIST_FAILED" };

export type GetConceptRelationResult =
  | { ok: true; row: YebsConceptRelationRow }
  | { ok: false; code: "YEBS_CONCEPT_RELATION_NOT_FOUND" | "YEBS_CONCEPT_RELATION_READ_FAILED" };

/** Canonical row guard (fail-closed): 7 alanın exact tip sözleşmesi. */
function isCanonicalRelationRow(value: unknown): value is YebsConceptRelationRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.source_concept_id) &&
    isStr(o.target_concept_id) &&
    isStr(o.relation_type) &&
    isStr(o.status) &&
    isStr(o.created_at) &&
    isStr(o.updated_at)
  );
}

/**
 * Concept relation kayıtlarını salt-okunur listeler.
 * Deterministik sıra: created_at DESC, id DESC. JOIN yok; canonical 7 alan.
 * has_sources/source_id filtreleri D9 junction üzerinden id-listesiyle uygulanır;
 * response'a HİÇBİR junction alanı eklenmez.
 */
export async function listConceptRelations(
  db: SupabaseClient,
  filters: ListConceptRelationsFilters,
): Promise<ListConceptRelationsResult> {
  let query = db
    .from("yebs_concept_relations")
    .select(YEBS_CONCEPT_RELATION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.sourceConceptId) query = query.eq("source_concept_id", filters.sourceConceptId);
  if (filters.targetConceptId) query = query.eq("target_concept_id", filters.targetConceptId);
  if (filters.conceptId) {
    query = query.or(
      `source_concept_id.eq.${filters.conceptId},target_concept_id.eq.${filters.conceptId}`,
    );
  }
  if (filters.relationType) query = query.eq("relation_type", filters.relationType);
  if (filters.status) query = query.eq("status", filters.status);

  // has_sources / source_id → D9 junction'dan relation id kümesi (JOIN response YOK).
  if (filters.hasSources !== undefined || filters.sourceId) {
    let jq = db.from("yebs_concept_relation_sources").select("concept_relation_id");
    if (filters.sourceId) jq = jq.eq("source_id", filters.sourceId);
    const { data: jrows, error: jerr } = await jq;
    if (jerr) {
      console.error("[yebs] listConceptRelations junction filter failed:", jerr.message);
      return { ok: false, code: "YEBS_CONCEPT_RELATIONS_LIST_FAILED" };
    }
    const relIds = [...new Set((jrows ?? []).map((r) => (r as { concept_relation_id: string }).concept_relation_id))];
    const wantWithSources = filters.sourceId !== undefined || filters.hasSources === true;
    if (wantWithSources) {
      if (relIds.length === 0) return { ok: true, rows: [], count: 0 };
      query = query.in("id", relIds);
    } else {
      // hasSources === false (ve source_id yok): kaynağı olan relation'ları hariç tut.
      if (relIds.length > 0) query = query.not("id", "in", `(${relIds.join(",")})`);
    }
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    console.error("[yebs] listConceptRelations failed:", error.message);
    return { ok: false, code: "YEBS_CONCEPT_RELATIONS_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalRelationRow)) {
    console.error("[yebs] listConceptRelations: canonical row guard failed");
    return { ok: false, code: "YEBS_CONCEPT_RELATIONS_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsConceptRelationRow[], count: count ?? 0 };
}

/**
 * Tek Concept relation kaydını salt-okunur getirir. UUID doğrulaması route
 * sorumluluğu. Kayıt yoksa NOT_FOUND, DB/bozuk satırda READ_FAILED. JOIN yok.
 */
export async function getConceptRelationById(
  db: SupabaseClient,
  id: string,
): Promise<GetConceptRelationResult> {
  const { data, error } = await db
    .from("yebs_concept_relations")
    .select(YEBS_CONCEPT_RELATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getConceptRelationById failed:", error.message);
    return { ok: false, code: "YEBS_CONCEPT_RELATION_READ_FAILED" };
  }
  if (!data) {
    return { ok: false, code: "YEBS_CONCEPT_RELATION_NOT_FOUND" };
  }
  if (!isCanonicalRelationRow(data)) {
    console.error("[yebs] getConceptRelationById: canonical row guard failed");
    return { ok: false, code: "YEBS_CONCEPT_RELATION_READ_FAILED" };
  }
  return { ok: true, row: data };
}
