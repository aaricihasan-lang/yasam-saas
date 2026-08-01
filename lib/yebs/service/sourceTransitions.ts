import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-C) Source lifecycle transition servisi.
 * status değişikliği YALNIZ public.yebs_transition_source_with_audit üzerinden.
 * archive/unarchive dahil (D5 archived enum'u vardır).
 */

export const SOURCE_STATUS_VALUES = [
  "draft",
  "verified",
  "approved",
  "published",
  "archived",
] as const;

export type TransitionSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_SOURCE_NOT_FOUND"
  | "YEBS_SOURCE_STALE_UPDATE"
  | "YEBS_SOURCE_STATUS_NOOP"
  | "YEBS_SOURCE_INVALID_TRANSITION"
  | "YEBS_SOURCE_TRANSITION_FAILED";

export type TransitionSourceResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: TransitionSourceErrorCode };

const RPC_ERROR_CODES: ReadonlySet<TransitionSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_SOURCE_NOT_FOUND",
  "YEBS_SOURCE_STALE_UPDATE",
  "YEBS_SOURCE_STATUS_NOOP",
  "YEBS_SOURCE_INVALID_TRANSITION",
]);

export async function transitionSource(
  db: SupabaseClient,
  actorAdminId: string,
  sourceId: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<TransitionSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(db, "yebs_transition_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_source_id: sourceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_target_status: targetStatus,
    p_reason: reason,
  });

  if (res.ok) return { ok: true, row: res.row };

  const code: TransitionSourceErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as TransitionSourceErrorCode,
  )
    ? (res.rawCode as TransitionSourceErrorCode)
    : "YEBS_SOURCE_TRANSITION_FAILED";
  return { ok: false, code };
}
