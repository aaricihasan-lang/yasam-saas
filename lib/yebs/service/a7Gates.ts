import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  executeTransition,
  type YebsCanonicalRow,
} from "./transitionService";
import { transitionErrorResponse } from "./transitionValidation";

/**
 * YEBS — FAZ A7 (Quality/Review/Approval/Publish Gates) servis çekirdeği.
 *
 * A7, API-TX'in kapalı bıraktığı ileri kalite geçişlerini (approved→published;
 * claim/relation needs_verification→verified, verified→approved, approved→published)
 * ve bağımlılık-korumalı published→approved / published→archived geçişlerini yönetir.
 *
 * DISPATCH (§8/§21): route body'yi DEĞİŞTİRMEZ. Önce A7 RPC denenir; A7 yalnız kendi
 * allowlist'indeki (from→to) çiftlerini kabul eder ve UPDATE/audit ÖNCESİ
 * `_INVALID_TRANSITION` RAISE eder → bu durumda mekanik API-TX servisine düşülür
 * (TOCTOU yok: her RPC kendi kilidini alır ve expected_updated_at'i yeniden doğrular).
 * Diğer A7 hataları (stale/noop/eligibility/dependency/graph) doğrudan döner.
 *
 * Güvenlik: `import "server-only"`. Ham DB message istemciye SIZMAZ (executeTransition
 * rawCode yalnız sınıflandırma için). Dynamic-table DML YOK; her RPC entity-specific.
 */

export type A7Entity =
  | "tradition" | "school" | "concept" | "source" | "claim" | "concept_relation";

type A7EntityConfig = {
  rpcTransition: string;
  rpcEligibility: string;
  idParam: string;
  invalidTransitionCode: string;
};

export const A7_ENTITY_CONFIG: Readonly<Record<A7Entity, A7EntityConfig>> = {
  tradition: {
    rpcTransition: "yebs_a7_transition_tradition_with_audit",
    rpcEligibility: "yebs_a7_tradition_eligibility",
    idParam: "p_tradition_id",
    invalidTransitionCode: "YEBS_TRADITION_INVALID_TRANSITION",
  },
  school: {
    rpcTransition: "yebs_a7_transition_school_with_audit",
    rpcEligibility: "yebs_a7_school_eligibility",
    idParam: "p_school_id",
    invalidTransitionCode: "YEBS_SCHOOL_INVALID_TRANSITION",
  },
  concept: {
    rpcTransition: "yebs_a7_transition_concept_with_audit",
    rpcEligibility: "yebs_a7_concept_eligibility",
    idParam: "p_concept_id",
    invalidTransitionCode: "YEBS_CONCEPT_INVALID_TRANSITION",
  },
  source: {
    rpcTransition: "yebs_a7_transition_source_with_audit",
    rpcEligibility: "yebs_a7_source_eligibility",
    idParam: "p_source_id",
    invalidTransitionCode: "YEBS_SOURCE_INVALID_TRANSITION",
  },
  claim: {
    rpcTransition: "yebs_a7_transition_claim_with_audit",
    rpcEligibility: "yebs_a7_claim_eligibility",
    idParam: "p_claim_id",
    invalidTransitionCode: "YEBS_CLAIM_INVALID_TRANSITION",
  },
  concept_relation: {
    rpcTransition: "yebs_a7_transition_concept_relation_with_audit",
    rpcEligibility: "yebs_a7_concept_relation_eligibility",
    idParam: "p_relation_id",
    invalidTransitionCode: "YEBS_RELATION_INVALID_TRANSITION",
  },
};

/** A7 RPC'lerinin döndürebileceği bilinen stabil kodlar (rawCode → typed). */
const A7_KNOWN_CODES: ReadonlySet<string> = new Set([
  "YEBS_REQUEST_ID_REQUIRED", "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED", "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND", "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_TRADITION_ID_REQUIRED", "YEBS_SCHOOL_ID_REQUIRED", "YEBS_CONCEPT_ID_REQUIRED",
  "YEBS_SOURCE_ID_REQUIRED", "YEBS_CLAIM_ID_REQUIRED", "YEBS_RELATION_ID_REQUIRED",
  "YEBS_TRADITION_NOT_FOUND", "YEBS_SCHOOL_NOT_FOUND", "YEBS_CONCEPT_NOT_FOUND",
  "YEBS_SOURCE_NOT_FOUND", "YEBS_CLAIM_NOT_FOUND", "YEBS_RELATION_NOT_FOUND",
  "YEBS_TRADITION_STALE_UPDATE", "YEBS_SCHOOL_STALE_UPDATE", "YEBS_CONCEPT_STALE_UPDATE",
  "YEBS_SOURCE_STALE_UPDATE", "YEBS_CLAIM_STALE_UPDATE", "YEBS_RELATION_STALE_UPDATE",
  "YEBS_TRADITION_STATUS_NOOP", "YEBS_SCHOOL_STATUS_NOOP", "YEBS_CONCEPT_STATUS_NOOP",
  "YEBS_SOURCE_STATUS_NOOP", "YEBS_CLAIM_STATUS_NOOP", "YEBS_RELATION_STATUS_NOOP",
  "YEBS_TRADITION_INVALID_TRANSITION", "YEBS_SCHOOL_INVALID_TRANSITION",
  "YEBS_CONCEPT_INVALID_TRANSITION", "YEBS_SOURCE_INVALID_TRANSITION",
  "YEBS_CLAIM_INVALID_TRANSITION", "YEBS_RELATION_INVALID_TRANSITION",
  // eligibility / dependency / graph blocker'ları
  "YEBS_TRADITION_NOT_PUBLISH_READY", "YEBS_SCHOOL_NOT_PUBLISH_READY", "YEBS_CONCEPT_NOT_PUBLISH_READY",
  "YEBS_SCHOOL_PARENT_TRADITION_NOT_PUBLISHED", "YEBS_CONCEPT_PARENT_NOT_PUBLISHED",
  "YEBS_CONCEPT_REQUIRED_LABEL_MISSING", "YEBS_SOURCE_METADATA_INCOMPLETE",
  "YEBS_CLAIM_NO_VERIFIED_EVIDENCE", "YEBS_CLAIM_SUPPORT_SOURCE_NOT_READY",
  "YEBS_CLAIM_NOT_APPROVAL_READY", "YEBS_CLAIM_PARENT_CONCEPT_NOT_PUBLISHED",
  "YEBS_CLAIM_PROVENANCE_INCOMPLETE",
  "YEBS_RELATION_NO_VERIFIED_EVIDENCE", "YEBS_RELATION_SUPPORT_SOURCE_NOT_READY",
  "YEBS_RELATION_NOT_APPROVAL_READY", "YEBS_RELATION_PARENT_CONCEPT_NOT_PUBLISHED",
  "YEBS_RELATION_PROVENANCE_INCOMPLETE", "YEBS_RELATION_GRAPH_CYCLE",
  "YEBS_PUBLISH_DEPENDENCY_BLOCKED",
]);

export type A7TransitionResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; code: string };

/** A7 transition RPC'sini çağırır; rawCode'u bilinen A7 kodlarına eşler. */
async function a7Transition(
  db: SupabaseClient,
  entity: A7Entity,
  actorAdminId: string,
  id: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
): Promise<A7TransitionResult> {
  const cfg = A7_ENTITY_CONFIG[entity];
  const res = await executeTransition(db, cfg.rpcTransition, {
    p_actor_admin_id: actorAdminId,
    p_request_id: crypto.randomUUID(),
    p_operation_id: crypto.randomUUID(),
    [cfg.idParam]: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_target_status: targetStatus,
    p_reason: reason,
  });
  if (res.ok) return { ok: true, row: res.row };
  const code = A7_KNOWN_CODES.has(res.rawCode) ? res.rawCode : "YEBS_A7_TRANSITION_FAILED";
  return { ok: false, code };
}

/** Mekanik (API-TX) fallback servis imzası — tüm entity servisleri bu şekli taşır. */
export type MechanicalTransitionFn = (
  db: SupabaseClient,
  actorAdminId: string,
  id: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
) => Promise<{ ok: true; row: YebsCanonicalRow } | { ok: false; code: string }>;

/**
 * Route dispatch: önce A7 (kalite/publish/bağımlılık), A7 `_INVALID_TRANSITION`
 * derse mekanik API-TX servisine düşer. HTTP yanıtını üretir.
 */
export async function dispatchA7OrMechanical(
  entity: A7Entity,
  db: SupabaseClient,
  actorAdminId: string,
  id: string,
  expectedUpdatedAt: string,
  targetStatus: string,
  reason: string,
  mechanicalFallback: MechanicalTransitionFn,
): Promise<Response> {
  const cfg = A7_ENTITY_CONFIG[entity];
  const a7 = await a7Transition(db, entity, actorAdminId, id, expectedUpdatedAt, targetStatus, reason);
  if (a7.ok) return NextResponse.json({ ok: true, row: a7.row }, { status: 200 });

  // Yalnız "A7 kapsamı DIŞI geçiş" durumunda mekanik servise düş. Diğer tüm A7
  // hataları (stale/noop/eligibility/dependency/graph) doğrudan döner.
  if (a7.code !== cfg.invalidTransitionCode) {
    return transitionErrorResponse(a7.code);
  }

  const mech = await mechanicalFallback(db, actorAdminId, id, expectedUpdatedAt, targetStatus, reason);
  if (!mech.ok) return transitionErrorResponse(mech.code);
  return NextResponse.json({ ok: true, row: mech.row }, { status: 200 });
}

/* ============================================================
 * READ-ONLY eligibility (write path ile AYNI entity-specific internal helper'ı
 * kullanan A7 eligibility RPC'sini çağırır). Sonuç authoritative DEĞİLDİR;
 * write RPC row-lock sonrası eligibility'yi yeniden değerlendirir.
 * ============================================================ */

export type A7EligibilityResult =
  | { ok: true; eligibility: unknown }
  | { ok: false; code: string };

export async function a7Eligibility(
  db: SupabaseClient,
  entity: A7Entity,
  actorAdminId: string,
  id: string,
  targetStatus: string,
): Promise<A7EligibilityResult> {
  const cfg = A7_ENTITY_CONFIG[entity];
  const { data, error } = await db.rpc(cfg.rpcEligibility, {
    p_actor_admin_id: actorAdminId,
    [cfg.idParam]: id,
    p_target_status: targetStatus,
  });
  if (error) {
    console.error(`[yebs] ${cfg.rpcEligibility} RPC failed:`, error.message);
    const raw = typeof error.message === "string" ? error.message : "";
    const code = A7_KNOWN_CODES.has(raw) ? raw : "YEBS_A7_ELIGIBILITY_FAILED";
    return { ok: false, code };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, code: "YEBS_A7_ELIGIBILITY_FAILED" };
  }
  return { ok: true, eligibility: data };
}
