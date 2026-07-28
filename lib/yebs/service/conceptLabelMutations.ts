import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A2 (yebs_concept_labels) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: createConceptLabel + updateConceptLabel + deleteConceptLabel.
 *     Salt-okunur A2R servisi (lib/yebs/service/concepts.ts) DEĞİŞTİRİLMEZ.
 *   - Canonical mutation YALNIZ production SECURITY DEFINER RPC üzerinden yapılır
 *     (create/update/delete). Doğrudan tablo mutasyonu YOK (write-gate: service_role
 *     tabloda yalnız SELECT).
 *   - Actor kimliği (actorAdminId) kullanıcı input'undan yapısal olarak ayrıdır;
 *     yalnız guard.adminId'den gelir. request_id / operation_id server-side üretilir.
 *   - Kullanıcı değerleri trim/normalize/coerce EDİLMEZ; RPC'ye orijinal biçimiyle
 *     iletilir. Canonical validation'ın nihai kaynağı DB/RPC'dir.
 *   - Ham DB hata metni route'a/istemciye TAŞINMAZ; yalnız stabil makine kodu döner.
 *
 * Güvenlik: `import "server-only"`.
 */

/** RPC dönüşü public.yebs_concept_labels canonical satırı (D4 10 kolon). */
export type YebsConceptLabelRow = {
  id: string;
  concept_id: string;
  language_tag: string;
  script_code: string;
  label: string;
  label_kind: string;
  transliteration_scheme: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

/** Canonical label satırının beklenen 10 alanının exact tip sözleşmesi. */
function isCanonicalLabelRow(value: unknown): value is YebsConceptLabelRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.concept_id === "string" &&
    typeof r.language_tag === "string" &&
    typeof r.script_code === "string" &&
    typeof r.label === "string" &&
    typeof r.label_kind === "string" &&
    (r.transliteration_scheme === null || typeof r.transliteration_scheme === "string") &&
    typeof r.is_primary === "boolean" &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string"
  );
}

/** RPC dönüşünü tek canonical object'e indirger (array gelirse yalnız tek eleman). */
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
 * CREATE
 * ============================================================ */

export type CreateConceptLabelInput = {
  languageTag: string;
  scriptCode: string;
  label: string;
  labelKind: string;
  transliterationScheme: string | null;
  isPrimary: boolean;
  reason: string | null;
};

export type CreateConceptLabelErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_LABEL_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_NOT_FOUND"
  | "YEBS_CONCEPT_STATUS_LOCKED"
  | "YEBS_LABEL_DUPLICATE"
  | "YEBS_LABEL_PRIMARY_CONFLICT"
  | "YEBS_LABEL_CREATE_FAILED";

export type CreateConceptLabelResult =
  | { ok: true; row: YebsConceptLabelRow }
  | { ok: false; code: CreateConceptLabelErrorCode };

const CREATE_RPC_ERROR_CODES: ReadonlySet<CreateConceptLabelErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_LABEL_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_NOT_FOUND",
  "YEBS_CONCEPT_STATUS_LOCKED",
  "YEBS_LABEL_DUPLICATE",
  "YEBS_LABEL_PRIMARY_CONFLICT",
]);

function classifyCreateRpcError(error: { message?: unknown }): CreateConceptLabelErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && CREATE_RPC_ERROR_CODES.has(msg as CreateConceptLabelErrorCode)) {
    return msg as CreateConceptLabelErrorCode;
  }
  return "YEBS_LABEL_CREATE_FAILED";
}

/**
 * Yeni concept label kaydını audit'li ve atomik olarak oluşturur.
 */
export async function createConceptLabel(
  db: SupabaseClient,
  actorAdminId: string,
  conceptId: string,
  input: CreateConceptLabelInput,
): Promise<CreateConceptLabelResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_create_concept_label_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_id: conceptId,
    p_language_tag: input.languageTag,
    p_script_code: input.scriptCode,
    p_label: input.label,
    p_label_kind: input.labelKind,
    p_transliteration_scheme: input.transliterationScheme,
    p_is_primary: input.isPrimary,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] createConceptLabel RPC failed:", error.message);
    return { ok: false, code: classifyCreateRpcError(error) };
  }

  const row = coerceSingleRow(data, "createConceptLabel");
  if (row === null || !isCanonicalLabelRow(row)) {
    console.error("[yebs] createConceptLabel beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_LABEL_CREATE_FAILED" };
  }

  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch
 * ============================================================ */

/**
 * Route tarafından doğrulanmış partial patch: yalnız PRESENT canonical anahtarlar.
 * concept_id patch-dışıdır (başka concept'e taşıma yok).
 */
export type UpdateConceptLabelPatch = {
  language_tag?: string;
  script_code?: string;
  label?: string;
  label_kind?: string;
  transliteration_scheme?: string | null;
  is_primary?: boolean;
};

export type UpdateConceptLabelErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_ID_REQUIRED"
  | "YEBS_LABEL_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_INVALID_LABEL_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_NOT_FOUND"
  | "YEBS_CONCEPT_STATUS_LOCKED"
  | "YEBS_LABEL_NOT_FOUND"
  | "YEBS_LABEL_STALE_UPDATE"
  | "YEBS_LABEL_NO_CHANGES"
  | "YEBS_LABEL_DUPLICATE"
  | "YEBS_LABEL_PRIMARY_CONFLICT"
  | "YEBS_LABEL_UPDATE_FAILED";

export type UpdateConceptLabelResult =
  | { ok: true; row: YebsConceptLabelRow }
  | { ok: false; code: UpdateConceptLabelErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateConceptLabelErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_ID_REQUIRED",
  "YEBS_LABEL_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_INVALID_LABEL_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_NOT_FOUND",
  "YEBS_CONCEPT_STATUS_LOCKED",
  "YEBS_LABEL_NOT_FOUND",
  "YEBS_LABEL_STALE_UPDATE",
  "YEBS_LABEL_NO_CHANGES",
  "YEBS_LABEL_DUPLICATE",
  "YEBS_LABEL_PRIMARY_CONFLICT",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateConceptLabelErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateConceptLabelErrorCode)) {
    return msg as UpdateConceptLabelErrorCode;
  }
  return "YEBS_LABEL_UPDATE_FAILED";
}

/**
 * Mevcut concept label kaydını audit'li ve atomik olarak günceller.
 */
export async function updateConceptLabel(
  db: SupabaseClient,
  actorAdminId: string,
  conceptId: string,
  labelId: string,
  expectedUpdatedAt: string,
  patch: UpdateConceptLabelPatch,
  reason: string,
): Promise<UpdateConceptLabelResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_concept_label_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_id: conceptId,
    p_label_id: labelId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateConceptLabel RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateConceptLabel");
  if (row === null || !isCanonicalLabelRow(row)) {
    console.error("[yebs] updateConceptLabel beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_LABEL_UPDATE_FAILED" };
  }

  return { ok: true, row };
}

/* ============================================================
 * DELETE
 * ============================================================ */

export type DeleteConceptLabelErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_ID_REQUIRED"
  | "YEBS_LABEL_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_NOT_FOUND"
  | "YEBS_CONCEPT_STATUS_LOCKED"
  | "YEBS_LABEL_NOT_FOUND"
  | "YEBS_LABEL_STALE_UPDATE"
  | "YEBS_LABEL_DELETE_FAILED";

export type DeleteConceptLabelResult =
  | { ok: true; row: YebsConceptLabelRow }
  | { ok: false; code: DeleteConceptLabelErrorCode };

const DELETE_RPC_ERROR_CODES: ReadonlySet<DeleteConceptLabelErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_ID_REQUIRED",
  "YEBS_LABEL_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_NOT_FOUND",
  "YEBS_CONCEPT_STATUS_LOCKED",
  "YEBS_LABEL_NOT_FOUND",
  "YEBS_LABEL_STALE_UPDATE",
]);

function classifyDeleteRpcError(error: { message?: unknown }): DeleteConceptLabelErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && DELETE_RPC_ERROR_CODES.has(msg as DeleteConceptLabelErrorCode)) {
    return msg as DeleteConceptLabelErrorCode;
  }
  return "YEBS_LABEL_DELETE_FAILED";
}

/**
 * Mevcut concept label kaydını audit'li ve atomik olarak siler. SİLİNEN canonical
 * satır (audit previous_state ile birebir) döner.
 */
export async function deleteConceptLabel(
  db: SupabaseClient,
  actorAdminId: string,
  conceptId: string,
  labelId: string,
  expectedUpdatedAt: string,
  reason: string,
): Promise<DeleteConceptLabelResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_delete_concept_label_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_id: conceptId,
    p_label_id: labelId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] deleteConceptLabel RPC failed:", error.message);
    return { ok: false, code: classifyDeleteRpcError(error) };
  }

  const row = coerceSingleRow(data, "deleteConceptLabel");
  if (row === null || !isCanonicalLabelRow(row)) {
    console.error("[yebs] deleteConceptLabel beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_LABEL_DELETE_FAILED" };
  }

  return { ok: true, row };
}
