import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-C) Concept lifecycle transition servisi.
 * status değişikliği YALNIZ public.yebs_transition_concept_with_audit üzerinden.
 */

export const CONCEPT_STATUS_VALUES = [
  "draft",
  "verified",
  "approved",
  "published",
] as const;

export type TransitionConceptErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_NOT_FOUND"
  | "YEBS_CONCEPT_STALE_UPDATE"
  | "YEBS_CONCEPT_STATUS_NOOP"
  | "YEBS_CONCEPT_INVALID_TRANSITION"
  | "YEBS_CONCEPT_TRANSITION_FAILED";

export type TransitionConceptResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: TransitionConceptErrorCode };

const RPC_ERROR_CODES: ReadonlySet<TransitionConceptErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_NOT_FOUND",
  "YEBS_CONCEPT_STALE_UPDATE",
  "YEBS_CONCEPT_STATUS_NOOP",
  "YEBS_CONCEPT_INVALID_TRANSITION",
]);

export async function transitionConcept(
  db: SupabaseClient,
  actorAdminId: string,
  conceptId: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<TransitionConceptResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(db, "yebs_transition_concept_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_id: conceptId,
    p_expected_updated_at: expectedUpdatedAt,
    p_target_status: targetStatus,
    p_reason: reason,
  });

  if (res.ok) return { ok: true, row: res.row };

  const code: TransitionConceptErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as TransitionConceptErrorCode,
  )
    ? (res.rawCode as TransitionConceptErrorCode)
    : "YEBS_CONCEPT_TRANSITION_FAILED";
  return { ok: false, code };
}
