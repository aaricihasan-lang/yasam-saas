import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A4B (yebs_claim_sources) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: attachClaimSource + updateClaimSource + removeClaimSource.
 *     Salt-okunur A4BR (claimSources.ts) ayrı.
 *   - Canonical mutasyon YALNIZ SECURITY DEFINER RPC üzerinden. Doğrudan tablo
 *     insert/update/delete YAPILMAZ (write-gate: service_role SELECT-only).
 *   - Actor kullanıcı input'undan yapısal ayrı; request/operation ID server-side.
 *   - Değerler coerce EDİLMEZ (route allowlist + tip; normalizasyon/coupling RPC'de).
 *   - verification_status hiçbir katmanda kullanıcıdan alınmaz (attach=unverified;
 *     PATCH/DELETE'te transition YOK). Source künyesi junction'a kopyalanmaz.
 *
 * Güvenlik: `import "server-only"`.
 */

export type YebsClaimSourceRow = {
  id: string;
  claim_id: string;
  source_id: string;
  source_role: string;
  locator_text: string | null;
  url_fragment: string | null;
  source_original_excerpt: string | null;
  source_original_language_tag: string | null;
  source_original_script_code: string | null;
  transliteration: string | null;
  transliteration_scheme: string | null;
  faithful_translation: string | null;
  translation_language_tag: string | null;
  rationale: string | null;
  rationale_status: string;
  verification_status: string;
  created_at: string;
  updated_at: string;
};

/** Canonical satırın 18 alanının exact tip sözleşmesini doğrular. */
function isCanonicalClaimSourceRow(value: unknown): value is YebsClaimSourceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(r.id) &&
    isStr(r.claim_id) &&
    isStr(r.source_id) &&
    isStr(r.source_role) &&
    isStrOrNull(r.locator_text) &&
    isStrOrNull(r.url_fragment) &&
    isStrOrNull(r.source_original_excerpt) &&
    isStrOrNull(r.source_original_language_tag) &&
    isStrOrNull(r.source_original_script_code) &&
    isStrOrNull(r.transliteration) &&
    isStrOrNull(r.transliteration_scheme) &&
    isStrOrNull(r.faithful_translation) &&
    isStrOrNull(r.translation_language_tag) &&
    isStrOrNull(r.rationale) &&
    isStr(r.rationale_status) &&
    isStr(r.verification_status) &&
    isStr(r.created_at) &&
    isStr(r.updated_at)
  );
}

function coerceSingleRow(data: unknown, failLabel: string): unknown | null {
  let row: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      console.error(`[yebs] ${failLabel} beklenmeyen dönüş kardinalitesi:`, data.length);
      return null;
    }
    row = data[0];
  }
  return row;
}

/* ============================================================
 * ATTACH
 * ============================================================ */

/** Route tarafından doğrulanmış attach alanları (13 + reason). claim_id path'ten. */
export type AttachClaimSourceInput = {
  sourceId: string;
  sourceRole: string;
  rationaleStatus: string;
  locatorText: string | null;
  urlFragment: string | null;
  sourceOriginalExcerpt: string | null;
  sourceOriginalLanguageTag: string | null;
  sourceOriginalScriptCode: string | null;
  transliteration: string | null;
  transliterationScheme: string | null;
  faithfulTranslation: string | null;
  translationLanguageTag: string | null;
  rationale: string | null;
  reason: string | null;
};

export type AttachClaimSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CLAIM_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_CLAIM_SOURCE_INVALID_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND"
  | "YEBS_CLAIM_SOURCE_CLAIM_LOCKED"
  | "YEBS_CLAIM_SOURCE_SOURCE_NOT_FOUND"
  | "YEBS_CLAIM_SOURCE_ATTACH_FAILED";

export type AttachClaimSourceResult =
  | { ok: true; row: YebsClaimSourceRow }
  | { ok: false; code: AttachClaimSourceErrorCode };

const ATTACH_RPC_ERROR_CODES: ReadonlySet<AttachClaimSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CLAIM_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_CLAIM_SOURCE_INVALID_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND",
  "YEBS_CLAIM_SOURCE_CLAIM_LOCKED",
  "YEBS_CLAIM_SOURCE_SOURCE_NOT_FOUND",
]);

function classifyAttachRpcError(error: { message?: unknown }): AttachClaimSourceErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && ATTACH_RPC_ERROR_CODES.has(msg as AttachClaimSourceErrorCode)) {
    return msg as AttachClaimSourceErrorCode;
  }
  return "YEBS_CLAIM_SOURCE_ATTACH_FAILED";
}

/** Claim'e Source bağını audit'li ve atomik olarak ekler. */
export async function attachClaimSource(
  db: SupabaseClient,
  actorAdminId: string,
  claimId: string,
  input: AttachClaimSourceInput,
): Promise<AttachClaimSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_attach_claim_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_claim_id: claimId,
    p_source_id: input.sourceId,
    p_source_role: input.sourceRole,
    p_rationale_status: input.rationaleStatus,
    p_locator_text: input.locatorText,
    p_url_fragment: input.urlFragment,
    p_source_original_excerpt: input.sourceOriginalExcerpt,
    p_source_original_language_tag: input.sourceOriginalLanguageTag,
    p_source_original_script_code: input.sourceOriginalScriptCode,
    p_transliteration: input.transliteration,
    p_transliteration_scheme: input.transliterationScheme,
    p_faithful_translation: input.faithfulTranslation,
    p_translation_language_tag: input.translationLanguageTag,
    p_rationale: input.rationale,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] attachClaimSource RPC failed:", error.message);
    return { ok: false, code: classifyAttachRpcError(error) };
  }

  const row = coerceSingleRow(data, "attachClaimSource");
  if (row === null || !isCanonicalClaimSourceRow(row)) {
    console.error("[yebs] attachClaimSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CLAIM_SOURCE_ATTACH_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch (12 mutable alan)
 * ============================================================ */

/** Yalnız PRESENT mutable anahtarları taşıyan partial patch (route doğrular). */
export type UpdateClaimSourcePatch = {
  source_role?: string;
  locator_text?: string | null;
  url_fragment?: string | null;
  source_original_excerpt?: string | null;
  source_original_language_tag?: string | null;
  source_original_script_code?: string | null;
  transliteration?: string | null;
  transliteration_scheme?: string | null;
  faithful_translation?: string | null;
  translation_language_tag?: string | null;
  rationale?: string | null;
  rationale_status?: string;
};

export type UpdateClaimSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CLAIM_ID_REQUIRED"
  | "YEBS_CLAIM_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_CLAIM_SOURCE_INVALID_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_SOURCE_NOT_FOUND"
  | "YEBS_CLAIM_SOURCE_CLAIM_LOCKED"
  | "YEBS_CLAIM_SOURCE_STALE_UPDATE"
  | "YEBS_CLAIM_SOURCE_NO_CHANGES"
  // API-TX (TX-V): verification_status IN (verified,rejected) iken içerik edit kilidi
  // (evidence-lock trigger'ı → RAISE). Değişiklik yalnız verification transition ile.
  | "YEBS_CLAIM_SOURCE_VERIFICATION_LOCKED"
  | "YEBS_CLAIM_SOURCE_UPDATE_FAILED";

export type UpdateClaimSourceResult =
  | { ok: true; row: YebsClaimSourceRow }
  | { ok: false; code: UpdateClaimSourceErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateClaimSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CLAIM_ID_REQUIRED",
  "YEBS_CLAIM_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_CLAIM_SOURCE_INVALID_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_SOURCE_NOT_FOUND",
  "YEBS_CLAIM_SOURCE_CLAIM_LOCKED",
  "YEBS_CLAIM_SOURCE_STALE_UPDATE",
  "YEBS_CLAIM_SOURCE_NO_CHANGES",
  "YEBS_CLAIM_SOURCE_VERIFICATION_LOCKED",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateClaimSourceErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateClaimSourceErrorCode)) {
    return msg as UpdateClaimSourceErrorCode;
  }
  return "YEBS_CLAIM_SOURCE_UPDATE_FAILED";
}

/** Mevcut Claim Source bağını audit'li ve atomik olarak günceller. */
export async function updateClaimSource(
  db: SupabaseClient,
  actorAdminId: string,
  claimId: string,
  claimSourceId: string,
  expectedUpdatedAt: string,
  patch: UpdateClaimSourcePatch,
  reason: string,
): Promise<UpdateClaimSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_claim_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_claim_id: claimId,
    p_claim_source_id: claimSourceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateClaimSource RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateClaimSource");
  if (row === null || !isCanonicalClaimSourceRow(row)) {
    console.error("[yebs] updateClaimSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CLAIM_SOURCE_UPDATE_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * REMOVE — detach (yalnız junction fiziksel silme; audit-önce)
 * ============================================================ */

export type RemoveClaimSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CLAIM_ID_REQUIRED"
  | "YEBS_CLAIM_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CLAIM_SOURCE_NOT_FOUND"
  | "YEBS_CLAIM_SOURCE_CLAIM_LOCKED"
  | "YEBS_CLAIM_SOURCE_STALE_UPDATE"
  | "YEBS_CLAIM_SOURCE_REMOVE_FAILED";

export type RemoveClaimSourceResult =
  | { ok: true; row: YebsClaimSourceRow }
  | { ok: false; code: RemoveClaimSourceErrorCode };

const REMOVE_RPC_ERROR_CODES: ReadonlySet<RemoveClaimSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CLAIM_ID_REQUIRED",
  "YEBS_CLAIM_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CLAIM_SOURCE_NOT_FOUND",
  "YEBS_CLAIM_SOURCE_CLAIM_LOCKED",
  "YEBS_CLAIM_SOURCE_STALE_UPDATE",
]);

function classifyRemoveRpcError(error: { message?: unknown }): RemoveClaimSourceErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && REMOVE_RPC_ERROR_CODES.has(msg as RemoveClaimSourceErrorCode)) {
    return msg as RemoveClaimSourceErrorCode;
  }
  return "YEBS_CLAIM_SOURCE_REMOVE_FAILED";
}

/** Claim Source bağını audit'li kaldırır (yalnız junction satırı; Claim/Source korunur). */
export async function removeClaimSource(
  db: SupabaseClient,
  actorAdminId: string,
  claimId: string,
  claimSourceId: string,
  expectedUpdatedAt: string,
  reason: string,
): Promise<RemoveClaimSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_remove_claim_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_claim_id: claimId,
    p_claim_source_id: claimSourceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] removeClaimSource RPC failed:", error.message);
    return { ok: false, code: classifyRemoveRpcError(error) };
  }

  const row = coerceSingleRow(data, "removeClaimSource");
  if (row === null || !isCanonicalClaimSourceRow(row)) {
    console.error("[yebs] removeClaimSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CLAIM_SOURCE_REMOVE_FAILED" };
  }
  return { ok: true, row };
}
