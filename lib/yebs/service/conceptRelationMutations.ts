import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A5A (yebs_concept_relations) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: createConceptRelation + updateConceptRelation. A5AR ayrı.
 *   - Canonical mutasyon YALNIZ SECURITY DEFINER RPC üzerinden. Doğrudan tablo
 *     insert/update/delete YAPILMAZ (write-gate: service_role SELECT-only).
 *   - Actor kullanıcı input'undan yapısal ayrı; request/operation ID server-side.
 *   - Değerler coerce EDİLMEZ; normalizasyon/enum/cross-tradition/mirror/hierarchy
 *     RPC'de. Ham DB hata metni TAŞINMAZ. Otomatik inverse/paired satır YOK.
 *   - Relation Source (D9) mutation'ı BU KATMANDA YOK (A5B).
 *
 * Güvenlik: `import "server-only"`.
 */

export type YebsConceptRelationRow = {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/** Canonical satırın 7 alanının exact tip sözleşmesini doğrular. */
function isCanonicalRelationRow(value: unknown): value is YebsConceptRelationRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  return (
    isStr(r.id) &&
    isStr(r.source_concept_id) &&
    isStr(r.target_concept_id) &&
    isStr(r.relation_type) &&
    isStr(r.status) &&
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
 * CREATE
 * ============================================================ */

/** Route tarafından doğrulanmış create alanları (3 + reason). */
export type CreateConceptRelationInput = {
  sourceConceptId: string;
  targetConceptId: string;
  relationType: string;
  reason: string | null;
};

export type CreateConceptRelationErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_CONCEPT_RELATION_INVALID_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND"
  | "YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND"
  | "YEBS_CONCEPT_RELATION_CROSS_TRADITION"
  | "YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE"
  | "YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE"
  | "YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT"
  | "YEBS_CONCEPT_RELATION_DUPLICATE"
  | "YEBS_CONCEPT_RELATION_CREATE_FAILED";

export type CreateConceptRelationResult =
  | { ok: true; row: YebsConceptRelationRow }
  | { ok: false; code: CreateConceptRelationErrorCode };

const CREATE_RPC_ERROR_CODES: ReadonlySet<CreateConceptRelationErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_CONCEPT_RELATION_INVALID_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND",
  "YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND",
  "YEBS_CONCEPT_RELATION_CROSS_TRADITION",
  "YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE",
  "YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE",
  "YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT",
  "YEBS_CONCEPT_RELATION_DUPLICATE",
]);

function classifyCreateRpcError(error: { message?: unknown }): CreateConceptRelationErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && CREATE_RPC_ERROR_CODES.has(msg as CreateConceptRelationErrorCode)) {
    return msg as CreateConceptRelationErrorCode;
  }
  return "YEBS_CONCEPT_RELATION_CREATE_FAILED";
}

/** Yeni Concept relation kaydını audit'li ve atomik olarak oluşturur. */
export async function createConceptRelation(
  db: SupabaseClient,
  actorAdminId: string,
  input: CreateConceptRelationInput,
): Promise<CreateConceptRelationResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_create_concept_relation_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_source_concept_id: input.sourceConceptId,
    p_target_concept_id: input.targetConceptId,
    p_relation_type: input.relationType,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] createConceptRelation RPC failed:", error.message);
    return { ok: false, code: classifyCreateRpcError(error) };
  }

  const row = coerceSingleRow(data, "createConceptRelation");
  if (row === null || !isCanonicalRelationRow(row)) {
    console.error("[yebs] createConceptRelation beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CONCEPT_RELATION_CREATE_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch (yalnız relation_type)
 * ============================================================ */

/** Yalnız relation_type mutable (route doğrular). */
export type UpdateConceptRelationPatch = {
  relation_type?: string;
};

export type UpdateConceptRelationErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_RELATION_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_CONCEPT_RELATION_INVALID_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_RELATION_NOT_FOUND"
  | "YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND"
  | "YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND"
  | "YEBS_CONCEPT_RELATION_STATUS_LOCKED"
  | "YEBS_CONCEPT_RELATION_STALE_UPDATE"
  | "YEBS_CONCEPT_RELATION_HAS_SOURCES"
  | "YEBS_CONCEPT_RELATION_CROSS_TRADITION"
  | "YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE"
  | "YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE"
  | "YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT"
  | "YEBS_CONCEPT_RELATION_DUPLICATE"
  | "YEBS_CONCEPT_RELATION_NO_CHANGES"
  | "YEBS_CONCEPT_RELATION_UPDATE_FAILED";

export type UpdateConceptRelationResult =
  | { ok: true; row: YebsConceptRelationRow }
  | { ok: false; code: UpdateConceptRelationErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateConceptRelationErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_RELATION_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_CONCEPT_RELATION_INVALID_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_RELATION_NOT_FOUND",
  "YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND",
  "YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND",
  "YEBS_CONCEPT_RELATION_STATUS_LOCKED",
  "YEBS_CONCEPT_RELATION_STALE_UPDATE",
  "YEBS_CONCEPT_RELATION_HAS_SOURCES",
  "YEBS_CONCEPT_RELATION_CROSS_TRADITION",
  "YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE",
  "YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE",
  "YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT",
  "YEBS_CONCEPT_RELATION_DUPLICATE",
  "YEBS_CONCEPT_RELATION_NO_CHANGES",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateConceptRelationErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateConceptRelationErrorCode)) {
    return msg as UpdateConceptRelationErrorCode;
  }
  return "YEBS_CONCEPT_RELATION_UPDATE_FAILED";
}

/** Mevcut Concept relation kaydını audit'li ve atomik olarak günceller (relation_type). */
export async function updateConceptRelation(
  db: SupabaseClient,
  actorAdminId: string,
  relationId: string,
  expectedUpdatedAt: string,
  patch: UpdateConceptRelationPatch,
  reason: string,
): Promise<UpdateConceptRelationResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_concept_relation_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_relation_id: relationId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateConceptRelation RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateConceptRelation");
  if (row === null || !isCanonicalRelationRow(row)) {
    console.error("[yebs] updateConceptRelation beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CONCEPT_RELATION_UPDATE_FAILED" };
  }
  return { ok: true, row };
}
