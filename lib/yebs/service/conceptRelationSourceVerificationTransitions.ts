import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-V) Concept Relation Source evidence verification transition servisi.
 *
 * verification_status değişikliği YALNIZ SECURITY DEFINER RPC
 * public.yebs_transition_concept_relation_source_verification_with_audit üzerinden.
 * Claim Source ile AYRI RPC/servis (Relation Source evidence_layer taşır). Parent
 * Relation status ∈ {draft,under_review,needs_verification} gate'i RPC'de zorlanır.
 */

export const RELATION_SOURCE_VERIFICATION_STATUS_VALUES = [
  "unverified",
  "verified",
  "rejected",
] as const;

export type RelationSourceVerificationErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_RELATION_ID_REQUIRED"
  | "YEBS_RELATION_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_RELATION_SOURCE_NOT_FOUND"
  | "YEBS_RELATION_SOURCE_PARENT_STATUS_LOCKED"
  | "YEBS_RELATION_SOURCE_STALE_UPDATE"
  | "YEBS_RELATION_SOURCE_VERIFICATION_NOOP"
  | "YEBS_RELATION_SOURCE_INVALID_VERIFICATION_TRANSITION"
  | "YEBS_RELATION_SOURCE_VERIFICATION_FAILED";

export type RelationSourceVerificationResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: RelationSourceVerificationErrorCode };

const RPC_ERROR_CODES: ReadonlySet<RelationSourceVerificationErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_RELATION_ID_REQUIRED",
  "YEBS_RELATION_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_RELATION_SOURCE_NOT_FOUND",
  "YEBS_RELATION_SOURCE_PARENT_STATUS_LOCKED",
  "YEBS_RELATION_SOURCE_STALE_UPDATE",
  "YEBS_RELATION_SOURCE_VERIFICATION_NOOP",
  "YEBS_RELATION_SOURCE_INVALID_VERIFICATION_TRANSITION",
]);

export async function transitionRelationSourceVerification(
  db: SupabaseClient,
  actorAdminId: string,
  relationId: string,
  relationSourceId: string,
  expectedUpdatedAt: string,
  verificationStatus: string,
  reason: string,
): Promise<RelationSourceVerificationResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(
    db,
    "yebs_transition_concept_relation_source_verification_with_audit",
    {
      p_actor_admin_id: actorAdminId,
      p_request_id: requestId,
      p_operation_id: operationId,
      p_relation_id: relationId,
      p_relation_source_id: relationSourceId,
      p_expected_updated_at: expectedUpdatedAt,
      p_target_verification_status: verificationStatus,
      p_reason: reason,
    },
  );

  if (res.ok) return { ok: true, row: res.row };

  const code: RelationSourceVerificationErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as RelationSourceVerificationErrorCode,
  )
    ? (res.rawCode as RelationSourceVerificationErrorCode)
    : "YEBS_RELATION_SOURCE_VERIFICATION_FAILED";
  return { ok: false, code };
}
