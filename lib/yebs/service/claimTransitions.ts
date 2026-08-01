import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-C) Claim lifecycle transition servisi.
 * status değişikliği YALNIZ public.yebs_transition_claim_with_audit üzerinden.
 * 7-durumlu makine + archive/unarchive. needs_verification→verified, verified→approved,
 * approved→published A7'ye kadar KAPALI (RPC reddeder → INVALID_TRANSITION).
 */

export const CLAIM_STATUS_VALUES = [
  "draft",
  "under_review",
  "needs_verification",
  "verified",
  "approved",
  "published",
  "archived",
] as const;

export type TransitionClaimErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CLAIM_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_NOT_FOUND"
  | "YEBS_CLAIM_STALE_UPDATE"
  | "YEBS_CLAIM_STATUS_NOOP"
  | "YEBS_CLAIM_INVALID_TRANSITION"
  | "YEBS_CLAIM_TRANSITION_FAILED";

export type TransitionClaimResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: TransitionClaimErrorCode };

const RPC_ERROR_CODES: ReadonlySet<TransitionClaimErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CLAIM_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_NOT_FOUND",
  "YEBS_CLAIM_STALE_UPDATE",
  "YEBS_CLAIM_STATUS_NOOP",
  "YEBS_CLAIM_INVALID_TRANSITION",
]);

export async function transitionClaim(
  db: SupabaseClient,
  actorAdminId: string,
  claimId: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<TransitionClaimResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(db, "yebs_transition_claim_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_claim_id: claimId,
    p_expected_updated_at: expectedUpdatedAt,
    p_target_status: targetStatus,
    p_reason: reason,
  });

  if (res.ok) return { ok: true, row: res.row };

  const code: TransitionClaimErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as TransitionClaimErrorCode,
  )
    ? (res.rawCode as TransitionClaimErrorCode)
    : "YEBS_CLAIM_TRANSITION_FAILED";
  return { ok: false, code };
}
