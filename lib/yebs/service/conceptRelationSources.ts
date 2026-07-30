import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A5B (yebs_concept_relation_sources) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (A5BR):
 *   - Yalnız okuma: listConceptRelationSources(relationId) +
 *     getConceptRelationSourceById(relationId, id).
 *   - Admin doğrulaması route sorumluluğu (verifyAdminRequest).
 *   - Yalnız enjekte edilen `db` (service_role); ham DB hata metni route'a taşınmaz.
 *   - Canonical row guard (fail-closed): beklenen 19 alanı taşımayan satır OKUMA
 *     HATASI olarak reddedilir.
 *   - Collection path'teki relationId ile SINIRLIDIR (parent existence kontrolü).
 *   - Mutation YOK; Source/Relation JOIN YOK; usage-count/gömme YOK; Source künyesi
 *     satıra kopyalanmaz (yalnız source_id FK).
 *
 * Güvenlik: `import "server-only"`.
 */

/** D9 canonical kolonlar — AÇIK liste. select("*") YOK. */
export const YEBS_CONCEPT_RELATION_SOURCE_COLUMNS =
  "id, concept_relation_id, source_id, evidence_layer, source_role, locator_text, url_fragment, source_original_excerpt, source_original_language_tag, source_original_script_code, transliteration, transliteration_scheme, faithful_translation, translation_language_tag, rationale, rationale_status, verification_status, created_at, updated_at";

/** D9 evidence_layer CHECK değer kümesi (9). */
export const YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS = [
  "classical_textual",
  "traditional",
  "ethnographic",
  "clinical",
  "experimental",
  "scientific_review",
  "regulatory",
  "experiential",
  "energetic_metaphysical",
] as const;
export type YebsConceptRelationSourceEvidenceLayer =
  (typeof YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS)[number];

/** D9 source_role CHECK değer kümesi (4). */
export const YEBS_CONCEPT_RELATION_SOURCE_ROLES = [
  "primary_support",
  "supporting",
  "contradiction",
  "context",
] as const;
export type YebsConceptRelationSourceRole =
  (typeof YEBS_CONCEPT_RELATION_SOURCE_ROLES)[number];

/** D9 rationale_status CHECK değer kümesi (2). */
export const YEBS_CONCEPT_RELATION_SOURCE_RATIONALE_STATUSES = [
  "from_source",
  "source_gives_no_rationale",
] as const;
export type YebsConceptRelationSourceRationaleStatus =
  (typeof YEBS_CONCEPT_RELATION_SOURCE_RATIONALE_STATUSES)[number];

/** D9 verification_status CHECK değer kümesi (3). */
export const YEBS_CONCEPT_RELATION_SOURCE_VERIFICATION_STATUSES = [
  "unverified",
  "verified",
  "rejected",
] as const;
export type YebsConceptRelationSourceVerificationStatus =
  (typeof YEBS_CONCEPT_RELATION_SOURCE_VERIFICATION_STATUSES)[number];

export type YebsConceptRelationSourceRow = {
  id: string;
  concept_relation_id: string;
  source_id: string;
  evidence_layer: string;
  source_role: string;
  locator_text: string | null;
  url_fragment: string | null;
  source_original_excerpt: string | null;
  source_original_language_tag: string | null;
  source_original_script_code: string | null;
  transliteration: string | null;
  transliteration_scheme: string | null;
  faithful_translation: string | null;
  translation_language_tag: string | null;
  rationale: string | null;
  rationale_status: string;
  verification_status: string;
  created_at: string;
  updated_at: string;
};

export type ListConceptRelationSourcesFilters = {
  limit: number;
  offset: number;
  sourceId?: string;
  evidenceLayer?: YebsConceptRelationSourceEvidenceLayer;
  sourceRole?: YebsConceptRelationSourceRole;
  rationaleStatus?: YebsConceptRelationSourceRationaleStatus;
  verificationStatus?: YebsConceptRelationSourceVerificationStatus;
  hasExcerpt?: boolean;
  hasTranslation?: boolean;
};

export type ListConceptRelationSourcesResult =
  | { ok: true; rows: YebsConceptRelationSourceRow[]; count: number }
  | {
      ok: false;
      code: "YEBS_RELATION_SOURCE_RELATION_NOT_FOUND" | "YEBS_RELATION_SOURCES_LIST_FAILED";
    };

export type GetConceptRelationSourceResult =
  | { ok: true; row: YebsConceptRelationSourceRow }
  | { ok: false; code: "YEBS_RELATION_SOURCE_NOT_FOUND" | "YEBS_RELATION_SOURCE_READ_FAILED" };

/** Canonical row guard (fail-closed): 19 alanın exact tip sözleşmesi. */
function isCanonicalRelationSourceRow(value: unknown): value is YebsConceptRelationSourceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.concept_relation_id) &&
    isStr(o.source_id) &&
    isStr(o.evidence_layer) &&
    isStr(o.source_role) &&
    isStrOrNull(o.locator_text) &&
    isStrOrNull(o.url_fragment) &&
    isStrOrNull(o.source_original_excerpt) &&
    isStrOrNull(o.source_original_language_tag) &&
    isStrOrNull(o.source_original_script_code) &&
    isStrOrNull(o.transliteration) &&
    isStrOrNull(o.transliteration_scheme) &&
    isStrOrNull(o.faithful_translation) &&
    isStrOrNull(o.translation_language_tag) &&
    isStrOrNull(o.rationale) &&
    isStr(o.rationale_status) &&
    isStr(o.verification_status) &&
    isStr(o.created_at) &&
    isStr(o.updated_at)
  );
}

/**
 * Bir Relation'ın kaynak bağlarını salt-okunur listeler (path relationId ile sınırlı).
 * Önce parent Relation varlığı doğrulanır (yoksa 404). Deterministik sıra:
 * created_at DESC, id DESC. JOIN yok; canonical 19 alan.
 */
export async function listConceptRelationSources(
  db: SupabaseClient,
  relationId: string,
  filters: ListConceptRelationSourcesFilters,
): Promise<ListConceptRelationSourcesResult> {
  // Parent Relation existence (JOIN değil; yalnız varlık kontrolü).
  const parent = await db
    .from("yebs_concept_relations")
    .select("id")
    .eq("id", relationId)
    .maybeSingle();
  if (parent.error) {
    console.error("[yebs] listConceptRelationSources parent check failed:", parent.error.message);
    return { ok: false, code: "YEBS_RELATION_SOURCES_LIST_FAILED" };
  }
  if (!parent.data) {
    return { ok: false, code: "YEBS_RELATION_SOURCE_RELATION_NOT_FOUND" };
  }

  let query = db
    .from("yebs_concept_relation_sources")
    .select(YEBS_CONCEPT_RELATION_SOURCE_COLUMNS, { count: "exact" })
    .eq("concept_relation_id", relationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.sourceId) query = query.eq("source_id", filters.sourceId);
  if (filters.evidenceLayer) query = query.eq("evidence_layer", filters.evidenceLayer);
  if (filters.sourceRole) query = query.eq("source_role", filters.sourceRole);
  if (filters.rationaleStatus) query = query.eq("rationale_status", filters.rationaleStatus);
  if (filters.verificationStatus) query = query.eq("verification_status", filters.verificationStatus);
  if (filters.hasExcerpt !== undefined) {
    query = filters.hasExcerpt
      ? query.not("source_original_excerpt", "is", null)
      : query.is("source_original_excerpt", null);
  }
  if (filters.hasTranslation !== undefined) {
    query = filters.hasTranslation
      ? query.not("faithful_translation", "is", null)
      : query.is("faithful_translation", null);
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    console.error("[yebs] listConceptRelationSources failed:", error.message);
    return { ok: false, code: "YEBS_RELATION_SOURCES_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalRelationSourceRow)) {
    console.error("[yebs] listConceptRelationSources: canonical row guard failed");
    return { ok: false, code: "YEBS_RELATION_SOURCES_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsConceptRelationSourceRow[], count: count ?? 0 };
}

/**
 * Tek Relation Source kaydını salt-okunur getirir (path relationId aidiyeti şart).
 * UUID doğrulaması route sorumluluğu. Kayıt yoksa veya relationId'ye ait değilse
 * NOT_FOUND; DB/bozuk satırda READ_FAILED. JOIN yok.
 */
export async function getConceptRelationSourceById(
  db: SupabaseClient,
  relationId: string,
  id: string,
): Promise<GetConceptRelationSourceResult> {
  const { data, error } = await db
    .from("yebs_concept_relation_sources")
    .select(YEBS_CONCEPT_RELATION_SOURCE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getConceptRelationSourceById failed:", error.message);
    return { ok: false, code: "YEBS_RELATION_SOURCE_READ_FAILED" };
  }
  if (!data) {
    return { ok: false, code: "YEBS_RELATION_SOURCE_NOT_FOUND" };
  }
  if (!isCanonicalRelationSourceRow(data)) {
    console.error("[yebs] getConceptRelationSourceById: canonical row guard failed");
    return { ok: false, code: "YEBS_RELATION_SOURCE_READ_FAILED" };
  }
  // Path aidiyeti: satır path'teki relationId'ye ait olmalı.
  if (data.concept_relation_id !== relationId) {
    return { ok: false, code: "YEBS_RELATION_SOURCE_NOT_FOUND" };
  }
  return { ok: true, row: data };
}
