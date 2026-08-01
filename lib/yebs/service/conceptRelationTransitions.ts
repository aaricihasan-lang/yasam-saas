import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-C) Concept Relation lifecycle transition servisi.
 * status değişikliği YALNIZ public.yebs_transition_concept_relation_with_audit üzerinden.
 * 7-durumlu makine + archive/unarchive. needs_verification→verified, verified→approved,
 * approved→published A7'ye kadar KAPALI.
 */

export const CONCEPT_RELATION_STATUS_VALUES = [
  "draft",
  "under_review",
  "needs_verification",
  "verified",
  "approved",
  "published",
  "archived",
] as const;

export type TransitionConceptRelationErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_RELATION_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_RELATION_NOT_FOUND"
  | "YEBS_CONCEPT_RELATION_STALE_UPDATE"
  | "YEBS_CONCEPT_RELATION_STATUS_NOOP"
  | "YEBS_CONCEPT_RELATION_INVALID_TRANSITION"
  | "YEBS_CONCEPT_RELATION_TRANSITION_FAILED";

export type TransitionConceptRelationResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: TransitionConceptRelationErrorCode };

const RPC_ERROR_CODES: ReadonlySet<TransitionConceptRelationErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_RELATION_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_RELATION_NOT_FOUND",
  "YEBS_CONCEPT_RELATION_STALE_UPDATE",
  "YEBS_CONCEPT_RELATION_STATUS_NOOP",
  "YEBS_CONCEPT_RELATION_INVALID_TRANSITION",
]);

export async function transitionConceptRelation(
  db: SupabaseClient,
  actorAdminId: string,
  relationId: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<TransitionConceptRelationResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(
    db,
    "yebs_transition_concept_relation_with_audit",
    {
      p_actor_admin_id: actorAdminId,
      p_request_id: requestId,
      p_operation_id: operationId,
      p_relation_id: relationId,
      p_expected_updated_at: expectedUpdatedAt,
      p_target_status: targetStatus,
      p_reason: reason,
    },
  );

  if (res.ok) return { ok: true, row: res.row };

  const code: TransitionConceptRelationErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as TransitionConceptRelationErrorCode,
  )
    ? (res.rawCode as TransitionConceptRelationErrorCode)
    : "YEBS_CONCEPT_RELATION_TRANSITION_FAILED";
  return { ok: false, code };
}
