import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A2 (yebs_concepts) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: createConcept + updateConcept. Salt-okunur A2R servisi
 *     (lib/yebs/service/concepts.ts) DEĞİŞTİRİLMEZ; bu dosya ondan ayrıdır.
 *   - Canonical create/update YALNIZ production SECURITY DEFINER RPC
 *     public.yebs_create_concept_with_audit / public.yebs_update_concept_with_audit
 *     üzerinden yapılır. Bu katman yebs_concepts'e DOĞRUDAN insert/update/delete
 *     YAPMAZ (write-gate: service_role tabloda yalnız SELECT'e sahiptir).
 *   - Actor kimliği (actorAdminId) kullanıcı input'undan YAPISAL olarak ayrıdır;
 *     yalnız route'un verifyAdminRequest → guard.adminId'sinden gelir. request_id /
 *     operation_id server-side üretilir (istemci veremez).
 *   - Kullanıcı değerleri trim/lowercase/truncate/coerce EDİLMEZ; RPC'ye orijinal
 *     biçimiyle iletilir. Canonical validation'ın nihai kaynağı DB/RPC'dir.
 *   - Ham DB hata metni route'a/istemciye TAŞINMAZ; server-side loglanır ve yalnız
 *     stabil bir makine kodu döner.
 *
 * Güvenlik: `import "server-only"`.
 */

/** RPC dönüşü public.yebs_concepts canonical satırı (D3 8 kolon). */
export type YebsConceptRow = {
  id: string;
  tradition_id: string;
  school_id: string | null;
  slug: string;
  concept_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/* ============================================================
 * CREATE
 * ============================================================ */

/** POST body'den route tarafından doğrulanmış, kullanıcı-editable create alanları. */
export type CreateConceptInput = {
  traditionId: string;
  schoolId: string | null;
  slug: string;
  conceptType: string;
  reason: string | null;
};

export type CreateConceptErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_TRADITION_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_CONCEPT_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_PARENT_TRADITION_NOT_FOUND"
  | "YEBS_PARENT_SCHOOL_NOT_FOUND"
  | "YEBS_CONCEPT_DUPLICATE"
  | "YEBS_CONCEPT_CREATE_FAILED";

export type CreateConceptResult =
  | { ok: true; row: YebsConceptRow }
  | { ok: false; code: CreateConceptErrorCode };

const CREATE_RPC_ERROR_CODES: ReadonlySet<CreateConceptErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_TRADITION_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_CONCEPT_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_PARENT_TRADITION_NOT_FOUND",
  "YEBS_PARENT_SCHOOL_NOT_FOUND",
  "YEBS_CONCEPT_DUPLICATE",
]);

function classifyCreateRpcError(error: { message?: unknown }): CreateConceptErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && CREATE_RPC_ERROR_CODES.has(msg as CreateConceptErrorCode)) {
    return msg as CreateConceptErrorCode;
  }
  return "YEBS_CONCEPT_CREATE_FAILED";
}

/** Canonical concept satırının beklenen alanları + geçerli string `id` taşıdığını doğrular. */
function isCanonicalConceptRow(value: unknown): value is YebsConceptRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.tradition_id === "string" &&
    (r.school_id === null || typeof r.school_id === "string") &&
    typeof r.slug === "string" &&
    typeof r.concept_type === "string" &&
    typeof r.status === "string" &&
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

/**
 * Yeni concept kaydını audit'li ve atomik olarak oluşturur.
 */
export async function createConcept(
  db: SupabaseClient,
  actorAdminId: string,
  input: CreateConceptInput,
): Promise<CreateConceptResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_create_concept_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_tradition_id: input.traditionId,
    p_school_id: input.schoolId,
    p_slug: input.slug,
    p_concept_type: input.conceptType,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] createConcept RPC failed:", error.message);
    return { ok: false, code: classifyCreateRpcError(error) };
  }

  const row = coerceSingleRow(data, "createConcept");
  if (row === null || !isCanonicalConceptRow(row)) {
    console.error("[yebs] createConcept beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CONCEPT_CREATE_FAILED" };
  }

  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch (yalnız slug / concept_type)
 * ============================================================ */

/**
 * Route tarafından doğrulanmış partial patch: yalnız PRESENT canonical anahtarlar.
 * tradition_id/school_id/status patch-dışıdır (reparent/transition kapsam dışı).
 */
export type UpdateConceptPatch = {
  slug?: string;
  concept_type?: string;
};

export type UpdateConceptErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_CONCEPT_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_CONCEPT_NOT_FOUND"
  | "YEBS_CONCEPT_STATUS_LOCKED"
  | "YEBS_CONCEPT_STALE_UPDATE"
  | "YEBS_CONCEPT_NO_CHANGES"
  | "YEBS_CONCEPT_DUPLICATE"
  | "YEBS_INVALID_CONCEPT_INPUT"
  | "YEBS_CONCEPT_UPDATE_FAILED";

export type UpdateConceptResult =
  | { ok: true; row: YebsConceptRow }
  | { ok: false; code: UpdateConceptErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateConceptErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_CONCEPT_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_CONCEPT_NOT_FOUND",
  "YEBS_CONCEPT_STATUS_LOCKED",
  "YEBS_CONCEPT_STALE_UPDATE",
  "YEBS_CONCEPT_NO_CHANGES",
  "YEBS_CONCEPT_DUPLICATE",
  "YEBS_INVALID_CONCEPT_INPUT",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateConceptErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateConceptErrorCode)) {
    return msg as UpdateConceptErrorCode;
  }
  return "YEBS_CONCEPT_UPDATE_FAILED";
}

/**
 * Mevcut concept kaydını audit'li ve atomik olarak günceller.
 */
export async function updateConcept(
  db: SupabaseClient,
  actorAdminId: string,
  conceptId: string,
  expectedUpdatedAt: string,
  patch: UpdateConceptPatch,
  reason: string,
): Promise<UpdateConceptResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_concept_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_concept_id: conceptId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateConcept RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateConcept");
  if (row === null || !isCanonicalConceptRow(row)) {
    console.error("[yebs] updateConcept beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_CONCEPT_UPDATE_FAILED" };
  }

  return { ok: true, row };
}
