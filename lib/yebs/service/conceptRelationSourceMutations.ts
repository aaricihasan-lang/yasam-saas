import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A5B (yebs_concept_relation_sources) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: attachConceptRelationSource + updateConceptRelationSource +
 *     removeConceptRelationSource. Salt-okunur A5BR (conceptRelationSources.ts) ayrı.
 *   - Canonical mutasyon YALNIZ SECURITY DEFINER RPC üzerinden. Doğrudan tablo
 *     insert/update/delete YAPILMAZ (write-gate: service_role SELECT-only).
 *   - Actor kullanıcı input'undan yapısal ayrı; request/operation ID server-side.
 *   - Değerler coerce EDİLMEZ (route allowlist + tip; normalizasyon/coupling RPC'de).
 *   - verification_status hiçbir katmanda kullanıcıdan alınmaz (attach=unverified;
 *     PATCH/DELETE'te transition YOK). evidence_layer editoryal (AI atayamaz). Source
 *     künyesi junction'a kopyalanmaz.
 *
 * Güvenlik: `import "server-only"`.
 */

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

/** Canonical satırın 19 alanının exact tip sözleşmesini doğrular. */
function isCanonicalRelationSourceRow(value: unknown): value is YebsConceptRelationSourceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(r.id) &&
    isStr(r.concept_relation_id) &&
    isStr(r.source_id) &&
    isStr(r.evidence_layer) &&
    isStr(r.source_role) &&
    isStrOrNull(r.locator_text) &&
    isStrOrNull(r.url_fragment) &&
    isStrOrNull(r.source_original_excerpt) &&
    isStrOrNull(r.source_original_language_tag) &&
    isStrOrNull(r.source_original_script_code) &&
    isStrOrNull(r.transliteration) &&
    isStrOrNull(r.transliteration_scheme) &&
    isStrOrNull(r.faithful_translation) &&
    isStrOrNull(r.translation_language_tag) &&
    isStrOrNull(r.rationale) &&
    isStr(r.rationale_status) &&
    isStr(r.verification_status) &&
    isStr(r.created_at) &&
    isStr(r.updated_at)
  );
}

function coerceSingleRow(data: unknown, failLabel: string): unknown | null {
  let row: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      console.error(`[yebs] ${failLabel} beklenmeyen dönüş kardinalitesi:`, data.length);
      return null;
    }
    row = data[0];
  }
  return row;
}

/* ============================================================
 * ATTACH
 * ============================================================ */

/** Route tarafından doğrulanmış attach alanları (14 + reason). concept_relation_id path'ten. */
export type AttachConceptRelationSourceInput = {
  sourceId: string;
  evidenceLayer: string;
  sourceRole: string;
  rationaleStatus: string;
  locatorText: string | null;
  urlFragment: string | null;
  sourceOriginalExcerpt: string | null;
  sourceOriginalLanguageTag: string | null;
  sourceOriginalScriptCode: string | null;
  transliteration: string | null;
  transliterationScheme: string | null;
  faithfulTranslation: string | null;
  translationLanguageTag: string | null;
  rationale: string | null;
  reason: string | null;
};

export type AttachConceptRelationSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_RELATION_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_RELATION_SOURCE_INVALID_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_RELATION_SOURCE_RELATION_NOT_FOUND"
  | "YEBS_RELATION_SOURCE_RELATION_LOCKED"
  | "YEBS_RELATION_SOURCE_SOURCE_NOT_FOUND"
  | "YEBS_RELATION_SOURCE_ATTACH_FAILED";

export type AttachConceptRelationSourceResult =
  | { ok: true; row: YebsConceptRelationSourceRow }
  | { ok: false; code: AttachConceptRelationSourceErrorCode };

const ATTACH_RPC_ERROR_CODES: ReadonlySet<AttachConceptRelationSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_RELATION_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_RELATION_SOURCE_INVALID_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_RELATION_SOURCE_RELATION_NOT_FOUND",
  "YEBS_RELATION_SOURCE_RELATION_LOCKED",
  "YEBS_RELATION_SOURCE_SOURCE_NOT_FOUND",
]);

function classifyAttachRpcError(
  error: { message?: unknown },
): AttachConceptRelationSourceErrorCode {
  const msg = error?.message;
  if (
    typeof msg === "string" &&
    ATTACH_RPC_ERROR_CODES.has(msg as AttachConceptRelationSourceErrorCode)
  ) {
    return msg as AttachConceptRelationSourceErrorCode;
  }
  return "YEBS_RELATION_SOURCE_ATTACH_FAILED";
}

/** Relation'a Source bağını audit'li ve atomik olarak ekler. */
export async function attachConceptRelationSource(
  db: SupabaseClient,
  actorAdminId: string,
  relationId: string,
  input: AttachConceptRelationSourceInput,
): Promise<AttachConceptRelationSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_attach_concept_relation_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_relation_id: relationId,
    p_source_id: input.sourceId,
    p_evidence_layer: input.evidenceLayer,
    p_source_role: input.sourceRole,
    p_rationale_status: input.rationaleStatus,
    p_locator_text: input.locatorText,
    p_url_fragment: input.urlFragment,
    p_source_original_excerpt: input.sourceOriginalExcerpt,
    p_source_original_language_tag: input.sourceOriginalLanguageTag,
    p_source_original_script_code: input.sourceOriginalScriptCode,
    p_transliteration: input.transliteration,
    p_transliteration_scheme: input.transliterationScheme,
    p_faithful_translation: input.faithfulTranslation,
    p_translation_language_tag: input.translationLanguageTag,
    p_rationale: input.rationale,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] attachConceptRelationSource RPC failed:", error.message);
    return { ok: false, code: classifyAttachRpcError(error) };
  }

  const row = coerceSingleRow(data, "attachConceptRelationSource");
  if (row === null || !isCanonicalRelationSourceRow(row)) {
    console.error("[yebs] attachConceptRelationSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_RELATION_SOURCE_ATTACH_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch (13 mutable alan; evidence_layer dahil)
 * ============================================================ */

/** Yalnız PRESENT mutable anahtarları taşıyan partial patch (route doğrular). */
export type UpdateConceptRelationSourcePatch = {
  evidence_layer?: string;
  source_role?: string;
  locator_text?: string | null;
  url_fragment?: string | null;
  source_original_excerpt?: string | null;
  source_original_language_tag?: string | null;
  source_original_script_code?: string | null;
  transliteration?: string | null;
  transliteration_scheme?: string | null;
  faithful_translation?: string | null;
  translation_language_tag?: string | null;
  rationale?: string | null;
  rationale_status?: string;
};

export type UpdateConceptRelationSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_RELATION_ID_REQUIRED"
  | "YEBS_RELATION_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_RELATION_SOURCE_INVALID_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_RELATION_SOURCE_NOT_FOUND"
  | "YEBS_RELATION_SOURCE_RELATION_LOCKED"
  | "YEBS_RELATION_SOURCE_STALE_UPDATE"
  | "YEBS_RELATION_SOURCE_NO_CHANGES"
  | "YEBS_RELATION_SOURCE_UPDATE_FAILED";

export type UpdateConceptRelationSourceResult =
  | { ok: true; row: YebsConceptRelationSourceRow }
  | { ok: false; code: UpdateConceptRelationSourceErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateConceptRelationSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_RELATION_ID_REQUIRED",
  "YEBS_RELATION_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_RELATION_SOURCE_INVALID_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_RELATION_SOURCE_NOT_FOUND",
  "YEBS_RELATION_SOURCE_RELATION_LOCKED",
  "YEBS_RELATION_SOURCE_STALE_UPDATE",
  "YEBS_RELATION_SOURCE_NO_CHANGES",
]);

function classifyUpdateRpcError(
  error: { message?: unknown },
): UpdateConceptRelationSourceErrorCode {
  const msg = error?.message;
  if (
    typeof msg === "string" &&
    UPDATE_RPC_ERROR_CODES.has(msg as UpdateConceptRelationSourceErrorCode)
  ) {
    return msg as UpdateConceptRelationSourceErrorCode;
  }
  return "YEBS_RELATION_SOURCE_UPDATE_FAILED";
}

/** Mevcut Relation Source bağını audit'li ve atomik olarak günceller. */
export async function updateConceptRelationSource(
  db: SupabaseClient,
  actorAdminId: string,
  relationId: string,
  relationSourceId: string,
  expectedUpdatedAt: string,
  patch: UpdateConceptRelationSourcePatch,
  reason: string,
): Promise<UpdateConceptRelationSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_concept_relation_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_relation_id: relationId,
    p_relation_source_id: relationSourceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateConceptRelationSource RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateConceptRelationSource");
  if (row === null || !isCanonicalRelationSourceRow(row)) {
    console.error("[yebs] updateConceptRelationSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_RELATION_SOURCE_UPDATE_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * REMOVE — detach (yalnız junction fiziksel silme; audit-önce)
 * ============================================================ */

export type RemoveConceptRelationSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_RELATION_ID_REQUIRED"
  | "YEBS_RELATION_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_RELATION_SOURCE_NOT_FOUND"
  | "YEBS_RELATION_SOURCE_RELATION_LOCKED"
  | "YEBS_RELATION_SOURCE_STALE_UPDATE"
  | "YEBS_RELATION_SOURCE_REMOVE_FAILED";

export type RemoveConceptRelationSourceResult =
  | { ok: true; row: YebsConceptRelationSourceRow }
  | { ok: false; code: RemoveConceptRelationSourceErrorCode };

const REMOVE_RPC_ERROR_CODES: ReadonlySet<RemoveConceptRelationSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_RELATION_ID_REQUIRED",
  "YEBS_RELATION_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_RELATION_SOURCE_NOT_FOUND",
  "YEBS_RELATION_SOURCE_RELATION_LOCKED",
  "YEBS_RELATION_SOURCE_STALE_UPDATE",
]);

function classifyRemoveRpcError(
  error: { message?: unknown },
): RemoveConceptRelationSourceErrorCode {
  const msg = error?.message;
  if (
    typeof msg === "string" &&
    REMOVE_RPC_ERROR_CODES.has(msg as RemoveConceptRelationSourceErrorCode)
  ) {
    return msg as RemoveConceptRelationSourceErrorCode;
  }
  return "YEBS_RELATION_SOURCE_REMOVE_FAILED";
}

/** Relation Source bağını audit'li kaldırır (yalnız junction satırı; Relation/Source korunur). */
export async function removeConceptRelationSource(
  db: SupabaseClient,
  actorAdminId: string,
  relationId: string,
  relationSourceId: string,
  expectedUpdatedAt: string,
  reason: string,
): Promise<RemoveConceptRelationSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_remove_concept_relation_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_relation_id: relationId,
    p_relation_source_id: relationSourceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] removeConceptRelationSource RPC failed:", error.message);
    return { ok: false, code: classifyRemoveRpcError(error) };
  }

  const row = coerceSingleRow(data, "removeConceptRelationSource");
  if (row === null || !isCanonicalRelationSourceRow(row)) {
    console.error("[yebs] removeConceptRelationSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_RELATION_SOURCE_REMOVE_FAILED" };
  }
  return { ok: true, row };
}
