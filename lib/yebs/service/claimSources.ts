import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A4B (yebs_claim_sources) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (A4BR):
 *   - Yalnız okuma: listClaimSources(claimId) + getClaimSourceById(claimId, id).
 *   - Admin doğrulaması route sorumluluğu (verifyAdminRequest).
 *   - Yalnız enjekte edilen `db` (service_role); ham DB hata metni route'a taşınmaz.
 *   - Canonical row guard (fail-closed): beklenen 18 alanı taşımayan satır OKUMA
 *     HATASI olarak reddedilir.
 *   - Collection path'teki claimId ile SINIRLIDIR (parent existence kontrolü).
 *   - Mutation YOK; Source JOIN YOK; Claim Source gömme/usage-count YOK; Source
 *     künyesi satıra kopyalanmaz.
 *
 * Güvenlik: `import "server-only"`.
 */

/** D7 canonical kolonlar — AÇIK liste. select("*") YOK. */
export const YEBS_CLAIM_SOURCE_COLUMNS =
  "id, claim_id, source_id, source_role, locator_text, url_fragment, source_original_excerpt, source_original_language_tag, source_original_script_code, transliteration, transliteration_scheme, faithful_translation, translation_language_tag, rationale, rationale_status, verification_status, created_at, updated_at";

/** D7 source_role CHECK değer kümesi (4). */
export const YEBS_CLAIM_SOURCE_ROLES = [
  "primary_support",
  "supporting",
  "contradiction",
  "context",
] as const;
export type YebsClaimSourceRole = (typeof YEBS_CLAIM_SOURCE_ROLES)[number];

/** D7 rationale_status CHECK değer kümesi (2). */
export const YEBS_CLAIM_SOURCE_RATIONALE_STATUSES = [
  "from_source",
  "source_gives_no_rationale",
] as const;
export type YebsClaimSourceRationaleStatus = (typeof YEBS_CLAIM_SOURCE_RATIONALE_STATUSES)[number];

/** D7 verification_status CHECK değer kümesi (3). */
export const YEBS_CLAIM_SOURCE_VERIFICATION_STATUSES = [
  "unverified",
  "verified",
  "rejected",
] as const;
export type YebsClaimSourceVerificationStatus = (typeof YEBS_CLAIM_SOURCE_VERIFICATION_STATUSES)[number];

export type YebsClaimSourceRow = {
  id: string;
  claim_id: string;
  source_id: string;
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

export type ListClaimSourcesFilters = {
  limit: number;
  offset: number;
  sourceId?: string;
  sourceRole?: YebsClaimSourceRole;
  rationaleStatus?: YebsClaimSourceRationaleStatus;
  verificationStatus?: YebsClaimSourceVerificationStatus;
  hasExcerpt?: boolean;
  hasTranslation?: boolean;
};

export type ListClaimSourcesResult =
  | { ok: true; rows: YebsClaimSourceRow[]; count: number }
  | { ok: false; code: "YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND" | "YEBS_CLAIM_SOURCES_LIST_FAILED" };

export type GetClaimSourceResult =
  | { ok: true; row: YebsClaimSourceRow }
  | { ok: false; code: "YEBS_CLAIM_SOURCE_NOT_FOUND" | "YEBS_CLAIM_SOURCE_READ_FAILED" };

/** Canonical row guard (fail-closed): 18 alanın exact tip sözleşmesi. */
function isCanonicalClaimSourceRow(value: unknown): value is YebsClaimSourceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.claim_id) &&
    isStr(o.source_id) &&
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
 * Bir Claim'in kaynak bağlarını salt-okunur listeler (path claimId ile sınırlı).
 * Önce parent Claim varlığı doğrulanır (yoksa 404). Deterministik sıra:
 * created_at DESC, id DESC. JOIN yok; canonical 18 alan.
 */
export async function listClaimSources(
  db: SupabaseClient,
  claimId: string,
  filters: ListClaimSourcesFilters,
): Promise<ListClaimSourcesResult> {
  // Parent Claim existence (JOIN değil; yalnız varlık kontrolü).
  const parent = await db.from("yebs_claims").select("id").eq("id", claimId).maybeSingle();
  if (parent.error) {
    console.error("[yebs] listClaimSources parent check failed:", parent.error.message);
    return { ok: false, code: "YEBS_CLAIM_SOURCES_LIST_FAILED" };
  }
  if (!parent.data) {
    return { ok: false, code: "YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND" };
  }

  let query = db
    .from("yebs_claim_sources")
    .select(YEBS_CLAIM_SOURCE_COLUMNS, { count: "exact" })
    .eq("claim_id", claimId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.sourceId) query = query.eq("source_id", filters.sourceId);
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
    console.error("[yebs] listClaimSources failed:", error.message);
    return { ok: false, code: "YEBS_CLAIM_SOURCES_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalClaimSourceRow)) {
    console.error("[yebs] listClaimSources: canonical row guard failed");
    return { ok: false, code: "YEBS_CLAIM_SOURCES_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsClaimSourceRow[], count: count ?? 0 };
}

/**
 * Tek Claim Source kaydını salt-okunur getirir (path claimId aidiyeti şart).
 * UUID doğrulaması route sorumluluğu. Kayıt yoksa veya claimId'ye ait değilse
 * NOT_FOUND; DB/bozuk satırda READ_FAILED. JOIN yok.
 */
export async function getClaimSourceById(
  db: SupabaseClient,
  claimId: string,
  id: string,
): Promise<GetClaimSourceResult> {
  const { data, error } = await db
    .from("yebs_claim_sources")
    .select(YEBS_CLAIM_SOURCE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getClaimSourceById failed:", error.message);
    return { ok: false, code: "YEBS_CLAIM_SOURCE_READ_FAILED" };
  }
  if (!data) {
    return { ok: false, code: "YEBS_CLAIM_SOURCE_NOT_FOUND" };
  }
  if (!isCanonicalClaimSourceRow(data)) {
    console.error("[yebs] getClaimSourceById: canonical row guard failed");
    return { ok: false, code: "YEBS_CLAIM_SOURCE_READ_FAILED" };
  }
  // Path aidiyeti: satır path'teki claimId'ye ait olmalı.
  if (data.claim_id !== claimId) {
    return { ok: false, code: "YEBS_CLAIM_SOURCE_NOT_FOUND" };
  }
  return { ok: true, row: data };
}
