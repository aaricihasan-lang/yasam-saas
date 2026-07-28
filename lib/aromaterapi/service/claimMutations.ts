import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aromaterapi Bilgi Sistemi V2 — FAZ C / C2T — Claim mutation server adapter.
 *
 * Sorumluluk sınırı:
 *   - Canonical create/update YALNIZ production SECURITY DEFINER RPC'leri ile:
 *       public.aromatherapy_create_claim_with_audit  (19 parametre)
 *       public.aromatherapy_update_claim_with_audit  (12 parametre)
 *     Bu katman claim tablolarına DOĞRUDAN insert/update/delete/upsert YAPMAZ
 *     (write-gate: service_role bu tablolarda yalnız SELECT'e sahiptir).
 *   - Actor (userId/label) ve tenantId kullanıcı input'undan YAPISAL olarak ayrıdır;
 *     yalnız route'un verifyUserRequest guard'ından gelir. Body'den tenant/actor
 *     KABUL EDİLMEZ (route 400 ile reddeder).
 *   - Kullanıcı değerleri (conclusion / child JSONB / reason / patch) trim/coerce/
 *     truncate EDİLMEZ; RPC'ye orijinal biçimiyle iletilir. Nihai validation DB/RPC'dir.
 *   - Ham DB hata metni (message/details/hint) route'a/istemciye TAŞINMAZ; server-side
 *     loglanır, yalnız stabil bir makine kodu döner.
 *
 * Güvenlik: `import "server-only"` — istemci paketine sızma build-time engellenir.
 */

/** RPC'nin P0001 kontrollü mesajları + native SQLSTATE'ten türetilen stabil kodlar. */
export type ClaimErrorCode =
  | "AROMA_ACTOR_ID_REQUIRED"
  | "AROMA_ACTOR_LABEL_INVALID"
  | "AROMA_REASON_INVALID"
  | "AROMA_INVALID_PAYLOAD"
  | "AROMA_IMMUTABLE_FIELD"
  | "AROMA_UNKNOWN_FIELD"
  | "AROMA_DUPLICATE_ROUTE"
  | "AROMA_DUPLICATE_POPULATION"
  | "AROMA_PASSAGE_SOURCE_NOT_LINKED"
  | "AROMA_SELF_RELATION"
  | "AROMA_RELATION_TARGET_NOT_FOUND"
  | "AROMA_CLAIM_NOT_FOUND"
  | "AROMA_STALE_CLAIM"
  | "AROMA_CHECK_VIOLATION"
  | "AROMA_UNIQUE_VIOLATION"
  | "AROMA_FK_VIOLATION"
  | "AROMA_CLAIM_WRITE_FAILED";

/** Stabil kod → HTTP status (C2T kilitli sözleşme). */
export const CLAIM_ERROR_HTTP: Readonly<Record<ClaimErrorCode, number>> = {
  AROMA_ACTOR_ID_REQUIRED: 500,
  AROMA_ACTOR_LABEL_INVALID: 500,
  AROMA_REASON_INVALID: 400,
  AROMA_INVALID_PAYLOAD: 400,
  AROMA_IMMUTABLE_FIELD: 400,
  AROMA_UNKNOWN_FIELD: 400,
  AROMA_DUPLICATE_ROUTE: 422,
  AROMA_DUPLICATE_POPULATION: 422,
  AROMA_PASSAGE_SOURCE_NOT_LINKED: 422,
  AROMA_SELF_RELATION: 422,
  AROMA_RELATION_TARGET_NOT_FOUND: 422,
  AROMA_CLAIM_NOT_FOUND: 404,
  AROMA_STALE_CLAIM: 409,
  AROMA_CHECK_VIOLATION: 422,
  AROMA_UNIQUE_VIOLATION: 409,
  AROMA_FK_VIOLATION: 422,
  AROMA_CLAIM_WRITE_FAILED: 500,
};

/** RPC'nin RAISE EXCEPTION ... ERRCODE='P0001' mesajları — EXACT allowlist (Set.has). */
const RPC_P0001_CODES: ReadonlySet<ClaimErrorCode> = new Set<ClaimErrorCode>([
  "AROMA_ACTOR_ID_REQUIRED",
  "AROMA_ACTOR_LABEL_INVALID",
  "AROMA_REASON_INVALID",
  "AROMA_INVALID_PAYLOAD",
  "AROMA_IMMUTABLE_FIELD",
  "AROMA_UNKNOWN_FIELD",
  "AROMA_DUPLICATE_ROUTE",
  "AROMA_DUPLICATE_POPULATION",
  "AROMA_PASSAGE_SOURCE_NOT_LINKED",
  "AROMA_SELF_RELATION",
  "AROMA_RELATION_TARGET_NOT_FOUND",
  "AROMA_CLAIM_NOT_FOUND",
  "AROMA_STALE_CLAIM",
]);

/**
 * RPC hatasını EXACT eşitlikle stabil koda sınıflandırır.
 *   - Native SQLSTATE (error.code): 23514→CHECK, 23505→UNIQUE, 23503→FK.
 *   - P0001 kontrollü mesaj (error.message): Set.has ile TAM eşitlik (includes/regex YOK).
 *   - Tanınmayan → AROMA_CLAIM_WRITE_FAILED. Ham metin DÖNDÜRÜLMEZ.
 */
export function classifyClaimRpcError(error: unknown): ClaimErrorCode {
  const sqlstate =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (sqlstate === "23514") return "AROMA_CHECK_VIOLATION";
  if (sqlstate === "23505") return "AROMA_UNIQUE_VIOLATION";
  if (sqlstate === "23503") return "AROMA_FK_VIOLATION";

  const message =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  if (typeof message === "string" && RPC_P0001_CODES.has(message as ClaimErrorCode)) {
    return message as ClaimErrorCode;
  }
  return "AROMA_CLAIM_WRITE_FAILED";
}

/**
 * Actor label snapshot — güvenilir profilden türetilir (C2T kilitli sözleşme):
 *   trim(full_name) → trim(name) → email. Seçilen değer boş olmayacak ve 320
 *   karakteri aşmayacak; UZUN profil adı KESİLMEZ, email fallback'e düşülür.
 */
export function resolveActorLabel(
  profile: Record<string, unknown> | undefined,
  email: string,
): string {
  const pick = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 320) return null;
    return trimmed;
  };
  return pick(profile?.full_name) ?? pick(profile?.name) ?? email;
}

/** Doğrulanmış actor/tenant bağlamı — yalnız route guard'ından. */
export type ClaimActor = {
  userId: string;
  label: string;
  tenantId: string;
};

/** Create — route tarafından şekli doğrulanmış, kullanıcı-editable alanlar. */
export type CreateClaimInput = {
  preparationId: string;
  claimType: string;
  conclusion: string;
  conclusionProvenance: string;
  evidenceLayer: string;
  rationaleStatus: string;
  safetyTopic?: string | null;
  preparationContext?: string | null;
  outcomeType?: string | null;
  rationale?: string | null;
  routes?: unknown[];
  populations?: unknown[];
  sources?: unknown[];
  passages?: unknown[];
  relations?: unknown[];
  reason?: string | null;
};

/** Update — şekli doğrulanmış alanlar. Child: undefined=omit(preserve), []=clear, [...]=replace. */
export type UpdateClaimInput = {
  reason: string;
  patch?: Record<string, unknown>;
  routes?: unknown[];
  populations?: unknown[];
  sources?: unknown[];
  passages?: unknown[];
  relations?: unknown[];
  expectedUpdatedAt?: string | null;
};

export type ClaimWriteResult =
  | { ok: true; claimId: string; warnings: unknown[] }
  | { ok: false; code: ClaimErrorCode };

/** RPC dönüşü {claim_id, warnings} — tek jsonb object; array gelirse yalnız tek-eleman kabul. */
function normalizeWriteResult(data: unknown): ClaimWriteResult {
  let obj: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) return { ok: false, code: "AROMA_CLAIM_WRITE_FAILED" };
    obj = data[0];
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, code: "AROMA_CLAIM_WRITE_FAILED" };
  }
  const row = obj as Record<string, unknown>;
  const claimId = row.claim_id;
  if (typeof claimId !== "string" || claimId.length === 0) {
    return { ok: false, code: "AROMA_CLAIM_WRITE_FAILED" };
  }
  const warnings = Array.isArray(row.warnings) ? row.warnings : [];
  return { ok: true, claimId, warnings };
}

/**
 * Atomik + audit'li claim create. Canonical create RPC (19 parametre) üzerinden.
 * Değerler coerce EDİLMEZ; actor/tenant yalnız güvenilir `actor` bağlamından.
 */
export async function createClaim(
  db: SupabaseClient,
  actor: ClaimActor,
  input: CreateClaimInput,
): Promise<ClaimWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_create_claim_with_audit", {
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_tenant_id: actor.tenantId,
    p_preparation_id: input.preparationId,
    p_claim_type: input.claimType,
    p_conclusion: input.conclusion,
    p_conclusion_provenance: input.conclusionProvenance,
    p_evidence_layer: input.evidenceLayer,
    p_rationale_status: input.rationaleStatus,
    p_safety_topic: input.safetyTopic ?? null,
    p_preparation_context: input.preparationContext ?? null,
    p_outcome_type: input.outcomeType ?? null,
    p_rationale: input.rationale ?? null,
    p_routes: input.routes ?? [],
    p_populations: input.populations ?? [],
    p_sources: input.sources ?? [],
    p_passages: input.passages ?? [],
    p_relations: input.relations ?? [],
    p_reason: input.reason ?? null,
  });

  if (error) {
    console.error("[aromaterapi] createClaim RPC failed:", (error as { message?: unknown }).message);
    return { ok: false, code: classifyClaimRpcError(error) };
  }
  return normalizeWriteResult(data);
}

/**
 * Atomik + audit'li claim update. Canonical update RPC (12 parametre) üzerinden.
 * Child koleksiyonları: input alanı `undefined` ise param GÖNDERİLMEZ (RPC NULL default
 * = omit/preserve); `[]` clear; dolu dizi replace. Reason ZORUNLUDUR.
 */
export async function updateClaim(
  db: SupabaseClient,
  actor: ClaimActor,
  claimId: string,
  input: UpdateClaimInput,
): Promise<ClaimWriteResult> {
  const params: Record<string, unknown> = {
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_tenant_id: actor.tenantId,
    p_claim_id: claimId,
    p_reason: input.reason,
    p_claim_patch: input.patch ?? {},
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  };
  if (input.routes !== undefined) params.p_routes = input.routes;
  if (input.populations !== undefined) params.p_populations = input.populations;
  if (input.sources !== undefined) params.p_sources = input.sources;
  if (input.passages !== undefined) params.p_passages = input.passages;
  if (input.relations !== undefined) params.p_relations = input.relations;

  const { data, error } = await db.rpc("aromatherapy_update_claim_with_audit", params);

  if (error) {
    console.error("[aromaterapi] updateClaim RPC failed:", (error as { message?: unknown }).message);
    return { ok: false, code: classifyClaimRpcError(error) };
  }
  return normalizeWriteResult(data);
}
