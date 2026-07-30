import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A4A (yebs_claims) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: createClaim + updateClaim. Salt-okunur A4AR (claims.ts) ayrı.
 *   - Canonical create/update YALNIZ SECURITY DEFINER RPC üzerinden
 *     (yebs_create_claim_with_audit / yebs_update_claim_with_audit). Doğrudan
 *     tablo insert/update/delete YAPILMAZ (write-gate: service_role SELECT-only).
 *   - Actor (actorAdminId) kullanıcı input'undan yapısal ayrı; request/operation ID
 *     server-side üretilir.
 *   - Değerler coerce EDİLMEZ (route allowlist + tip kontrolü yapar; kanonik
 *     normalizasyon + enum/coupling DB/RPC'de yapılır). Ham DB hata metni TAŞINMAZ.
 *   - Claim Source (D7) mutation'ı BU KATMANDA YOK (A4B).
 *
 * Güvenlik: `import "server-only"`.
 */

export type YebsClaimRow = {
  id: string;
  concept_id: string;
  claim_type: string;
  claim_text: string;
  provenance_kind: string;
  evidence_layer: string;
  outcome_type: string | null;
  safety_topic: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

/** Canonical satırın 11 alanının exact tip sözleşmesini doğrular. */
function isCanonicalClaimRow(value: unknown): value is YebsClaimRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(r.id) &&
    isStr(r.concept_id) &&
    isStr(r.claim_type) &&
    isStr(r.claim_text) &&
    isStr(r.provenance_kind) &&
    isStr(r.evidence_layer) &&
    isStrOrNull(r.outcome_type) &&
    isStrOrNull(r.safety_topic) &&
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

/** Route tarafından doğrulanmış, kullanıcı-editable create alanları (7 + reason). */
export type CreateClaimInput = {
  conceptId: string;
  claimType: string;
  claimText: string;
  provenanceKind: string;
  evidenceLayer: string;
  outcomeType: string | null;
  safetyTopic: string | null;
  reason: string | null;
};

export type CreateClaimErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_CLAIM_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_CONCEPT_NOT_FOUND"
  | "YEBS_CLAIM_CREATE_FAILED";

export type CreateClaimResult =
  | { ok: true; row: YebsClaimRow }
  | { ok: false; code: CreateClaimErrorCode };

const CREATE_RPC_ERROR_CODES: ReadonlySet<CreateClaimErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_CLAIM_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_CONCEPT_NOT_FOUND",
]);

function classifyCreateRpcError(error: { message?: unknown }): CreateClaimErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && CREATE_RPC_ERROR_CODES.has(msg as CreateClaimErrorCode)) {
    return msg as CreateClaimErrorCode;
  }
  return "YEBS_CLAIM_CREATE_FAILED";
}

/** Yeni Claim kaydını audit'li ve atomik olarak oluşturur. */
export async function createClaim(
  db: SupabaseClient,
  actorAdminId: string,
  input: CreateClaimInput,
): Promise<CreateClaimResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_create_claim_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_id: input.conceptId,
    p_claim_type: input.claimType,
    p_claim_text: input.claimText,
    p_provenance_kind: input.provenanceKind,
    p_evidence_layer: input.evidenceLayer,
    p_outcome_type: input.outcomeType,
    p_safety_topic: input.safetyTopic,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] createClaim RPC failed:", error.message);
    return { ok: false, code: classifyCreateRpcError(error) };
  }

  const row = coerceSingleRow(data, "createClaim");
  if (row === null || !isCanonicalClaimRow(row)) {
    console.error("[yebs] createClaim beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CLAIM_CREATE_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch (6 mutable alan)
 * ============================================================ */

/** Yalnız PRESENT mutable anahtarları taşıyan partial patch (route doğrular). */
export type UpdateClaimPatch = {
  claim_type?: string;
  claim_text?: string;
  provenance_kind?: string;
  evidence_layer?: string;
  outcome_type?: string | null;
  safety_topic?: string | null;
};

export type UpdateClaimErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CLAIM_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_INVALID_CLAIM_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_NOT_FOUND"
  | "YEBS_CLAIM_STATUS_LOCKED"
  | "YEBS_CLAIM_STALE_UPDATE"
  | "YEBS_CLAIM_NO_CHANGES"
  | "YEBS_CLAIM_UPDATE_FAILED";

export type UpdateClaimResult =
  | { ok: true; row: YebsClaimRow }
  | { ok: false; code: UpdateClaimErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateClaimErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CLAIM_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_INVALID_CLAIM_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_NOT_FOUND",
  "YEBS_CLAIM_STATUS_LOCKED",
  "YEBS_CLAIM_STALE_UPDATE",
  "YEBS_CLAIM_NO_CHANGES",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateClaimErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateClaimErrorCode)) {
    return msg as UpdateClaimErrorCode;
  }
  return "YEBS_CLAIM_UPDATE_FAILED";
}

/** Mevcut Claim kaydını audit'li ve atomik olarak günceller. */
export async function updateClaim(
  db: SupabaseClient,
  actorAdminId: string,
  claimId: string,
  expectedUpdatedAt: string,
  patch: UpdateClaimPatch,
  reason: string,
): Promise<UpdateClaimResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_claim_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_claim_id: claimId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateClaim RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateClaim");
  if (row === null || !isCanonicalClaimRow(row)) {
    console.error("[yebs] updateClaim beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CLAIM_UPDATE_FAILED" };
  }
  return { ok: true, row };
}
