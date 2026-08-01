import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-C) School lifecycle transition servisi.
 * status değişikliği YALNIZ public.yebs_transition_school_with_audit üzerinden.
 */

export const SCHOOL_STATUS_VALUES = [
  "draft",
  "verified",
  "approved",
  "published",
] as const;

export type TransitionSchoolErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_SCHOOL_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_SCHOOL_NOT_FOUND"
  | "YEBS_SCHOOL_STALE_UPDATE"
  | "YEBS_SCHOOL_STATUS_NOOP"
  | "YEBS_SCHOOL_INVALID_TRANSITION"
  | "YEBS_SCHOOL_TRANSITION_FAILED";

export type TransitionSchoolResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: TransitionSchoolErrorCode };

const RPC_ERROR_CODES: ReadonlySet<TransitionSchoolErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_SCHOOL_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_SCHOOL_NOT_FOUND",
  "YEBS_SCHOOL_STALE_UPDATE",
  "YEBS_SCHOOL_STATUS_NOOP",
  "YEBS_SCHOOL_INVALID_TRANSITION",
]);

export async function transitionSchool(
  db: SupabaseClient,
  actorAdminId: string,
  schoolId: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<TransitionSchoolResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(db, "yebs_transition_school_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_school_id: schoolId,
    p_expected_updated_at: expectedUpdatedAt,
    p_target_status: targetStatus,
    p_reason: reason,
  });

  if (res.ok) return { ok: true, row: res.row };

  const code: TransitionSchoolErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as TransitionSchoolErrorCode,
  )
    ? (res.rawCode as TransitionSchoolErrorCode)
    : "YEBS_SCHOOL_TRANSITION_FAILED";
  return { ok: false, code };
}
