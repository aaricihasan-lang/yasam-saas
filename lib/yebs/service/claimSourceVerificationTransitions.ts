import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-V) Claim Source evidence verification transition servisi.
 *
 * verification_status değişikliği YALNIZ SECURITY DEFINER RPC
 * public.yebs_transition_claim_source_verification_with_audit üzerinden yapılır.
 * Parent Claim status ∈ {draft,under_review,needs_verification} gate'i RPC'de zorlanır;
 * parent status OTOMATİK değişmez. rationale_status/evidence_layer bu servisin DIŞINDA.
 */

export const VERIFICATION_STATUS_VALUES = [
  "unverified",
  "verified",
  "rejected",
] as const;

export type ClaimSourceVerificationErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CLAIM_ID_REQUIRED"
  | "YEBS_CLAIM_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_SOURCE_NOT_FOUND"
  | "YEBS_CLAIM_SOURCE_PARENT_STATUS_LOCKED"
  | "YEBS_CLAIM_SOURCE_STALE_UPDATE"
  | "YEBS_CLAIM_SOURCE_VERIFICATION_NOOP"
  | "YEBS_CLAIM_SOURCE_INVALID_VERIFICATION_TRANSITION"
  | "YEBS_CLAIM_SOURCE_VERIFICATION_FAILED";

export type ClaimSourceVerificationResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: ClaimSourceVerificationErrorCode };

const RPC_ERROR_CODES: ReadonlySet<ClaimSourceVerificationErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CLAIM_ID_REQUIRED",
  "YEBS_CLAIM_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_SOURCE_NOT_FOUND",
  "YEBS_CLAIM_SOURCE_PARENT_STATUS_LOCKED",
  "YEBS_CLAIM_SOURCE_STALE_UPDATE",
  "YEBS_CLAIM_SOURCE_VERIFICATION_NOOP",
  "YEBS_CLAIM_SOURCE_INVALID_VERIFICATION_TRANSITION",
]);

export async function transitionClaimSourceVerification(
  db: SupabaseClient,
  actorAdminId: string,
  claimId: string,
  claimSourceId: string,
  expectedUpdatedAt: string,
  verificationStatus: string,
  reason: string,
): Promise<ClaimSourceVerificationResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(
    db,
    "yebs_transition_claim_source_verification_with_audit",
    {
      p_actor_admin_id: actorAdminId,
      p_request_id: requestId,
      p_operation_id: operationId,
      p_claim_id: claimId,
      p_claim_source_id: claimSourceId,
      p_expected_updated_at: expectedUpdatedAt,
      p_target_verification_status: verificationStatus,
      p_reason: reason,
    },
  );

  if (res.ok) return { ok: true, row: res.row };

  const code: ClaimSourceVerificationErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as ClaimSourceVerificationErrorCode,
  )
    ? (res.rawCode as ClaimSourceVerificationErrorCode)
    : "YEBS_CLAIM_SOURCE_VERIFICATION_FAILED";
  return { ok: false, code };
}
