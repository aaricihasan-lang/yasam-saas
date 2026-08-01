import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTransition, type YebsCanonicalRow } from "./transitionService";

/**
 * YEBS — FAZ API-TX (TX-C) Tradition lifecycle transition servisi.
 *
 * status değişikliği YALNIZ SECURITY DEFINER RPC
 * public.yebs_transition_tradition_with_audit üzerinden yapılır (doğrudan tablo
 * mutasyonu YOK; write-gate: service_role SELECT-only). Actor güvenilir parametredir;
 * request/operation ID server-side üretilir. Değerler coerce EDİLMEZ.
 */

export const TRADITION_STATUS_VALUES = [
  "draft",
  "verified",
  "approved",
  "published",
] as const;

export type TransitionTraditionErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_TRADITION_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_TRADITION_NOT_FOUND"
  | "YEBS_TRADITION_STALE_UPDATE"
  | "YEBS_TRADITION_STATUS_NOOP"
  | "YEBS_TRADITION_INVALID_TRANSITION"
  | "YEBS_TRADITION_TRANSITION_FAILED";

export type TransitionTraditionResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: TransitionTraditionErrorCode };

const RPC_ERROR_CODES: ReadonlySet<TransitionTraditionErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_TRADITION_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_TRADITION_NOT_FOUND",
  "YEBS_TRADITION_STALE_UPDATE",
  "YEBS_TRADITION_STATUS_NOOP",
  "YEBS_TRADITION_INVALID_TRANSITION",
]);

export async function transitionTradition(
  db: SupabaseClient,
  actorAdminId: string,
  traditionId: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<TransitionTraditionResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const res = await executeTransition(db, "yebs_transition_tradition_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_tradition_id: traditionId,
    p_expected_updated_at: expectedUpdatedAt,
    p_target_status: targetStatus,
    p_reason: reason,
  });

  if (res.ok) return { ok: true, row: res.row };

  const code: TransitionTraditionErrorCode = RPC_ERROR_CODES.has(
    res.rawCode as TransitionTraditionErrorCode,
  )
    ? (res.rawCode as TransitionTraditionErrorCode)
    : "YEBS_TRADITION_TRANSITION_FAILED";
  return { ok: false, code };
}
