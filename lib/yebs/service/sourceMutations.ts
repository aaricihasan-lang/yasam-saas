import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A3 (yebs_sources) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: createSource + updateSource. Salt-okunur A3R (sources.ts) ayrı.
 *   - Canonical create/update YALNIZ SECURITY DEFINER RPC üzerinden
 *     (yebs_create_source_with_audit / yebs_update_source_with_audit). Doğrudan
 *     tablo insert/update/delete YAPILMAZ (write-gate: service_role SELECT-only).
 *   - Actor (actorAdminId) kullanıcı input'undan yapısal ayrı; request/operation ID
 *     server-side üretilir.
 *   - Değerler coerce EDİLMEZ (route allowlist + tip kontrolü yapar; kanonik
 *     normalizasyon DB/RPC'de yapılır). Ham DB hata metni route'a/istemciye TAŞINMAZ.
 *
 * Güvenlik: `import "server-only"`.
 */

export type YebsSourceRow = {
  id: string;
  source_type: string;
  title: string;
  language_tag: string;
  script_code: string | null;
  authors: string | null;
  organization: string | null;
  publisher: string | null;
  publication_year: number | null;
  dating_note: string | null;
  edition: string | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  document_no: string | null;
  tradition_context_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  accessed_on: string | null;
};

/** Canonical satırın en az beklenen alanları + geçerli string id taşıdığını doğrular. */
function isCanonicalSourceRow(value: unknown): value is YebsSourceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.source_type === "string" &&
    typeof r.title === "string" &&
    typeof r.language_tag === "string" &&
    typeof r.status === "string" &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string" &&
    (r.accessed_on === null || typeof r.accessed_on === "string")
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
 * CREATE
 * ============================================================ */

/** Route tarafından doğrulanmış, kullanıcı-editable create alanları (18 + reason). */
export type CreateSourceInput = {
  sourceType: string;
  title: string;
  languageTag: string;
  scriptCode: string | null;
  authors: string | null;
  organization: string | null;
  publisher: string | null;
  publicationYear: number | null;
  datingNote: string | null;
  edition: string | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  documentNo: string | null;
  traditionContextId: string | null;
  accessedOn: string | null;
  notes: string | null;
  reason: string | null;
};

export type CreateSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_SOURCE_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_SOURCE_TRADITION_NOT_FOUND"
  | "YEBS_SOURCE_DOI_DUPLICATE"
  | "YEBS_SOURCE_PMID_DUPLICATE"
  | "YEBS_SOURCE_CREATE_FAILED";

export type CreateSourceResult =
  | { ok: true; row: YebsSourceRow }
  | { ok: false; code: CreateSourceErrorCode };

const CREATE_RPC_ERROR_CODES: ReadonlySet<CreateSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_SOURCE_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_SOURCE_TRADITION_NOT_FOUND",
  "YEBS_SOURCE_DOI_DUPLICATE",
  "YEBS_SOURCE_PMID_DUPLICATE",
]);

function classifyCreateRpcError(error: { message?: unknown }): CreateSourceErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && CREATE_RPC_ERROR_CODES.has(msg as CreateSourceErrorCode)) {
    return msg as CreateSourceErrorCode;
  }
  return "YEBS_SOURCE_CREATE_FAILED";
}

/** Yeni kaynak kaydını audit'li ve atomik olarak oluşturur. */
export async function createSource(
  db: SupabaseClient,
  actorAdminId: string,
  input: CreateSourceInput,
): Promise<CreateSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_create_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_source_type: input.sourceType,
    p_title: input.title,
    p_language_tag: input.languageTag,
    p_script_code: input.scriptCode,
    p_authors: input.authors,
    p_organization: input.organization,
    p_publisher: input.publisher,
    p_publication_year: input.publicationYear,
    p_dating_note: input.datingNote,
    p_edition: input.edition,
    p_doi: input.doi,
    p_pmid: input.pmid,
    p_isbn: input.isbn,
    p_url: input.url,
    p_document_no: input.documentNo,
    p_tradition_context_id: input.traditionContextId,
    p_accessed_on: input.accessedOn,
    p_notes: input.notes,
    p_reason: input.reason,
  });

  if (error) {
    console.error("[yebs] createSource RPC failed:", error.message);
    return { ok: false, code: classifyCreateRpcError(error) };
  }

  const row = coerceSingleRow(data, "createSource");
  if (row === null || !isCanonicalSourceRow(row)) {
    console.error("[yebs] createSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_SOURCE_CREATE_FAILED" };
  }
  return { ok: true, row };
}

/* ============================================================
 * UPDATE — partial JSONB patch (18 mutable alan)
 * ============================================================ */

/** Yalnız PRESENT mutable anahtarları taşıyan partial patch (route doğrular). */
export type UpdateSourcePatch = {
  source_type?: string;
  title?: string;
  language_tag?: string;
  script_code?: string | null;
  authors?: string | null;
  organization?: string | null;
  publisher?: string | null;
  publication_year?: number | null;
  dating_note?: string | null;
  edition?: string | null;
  doi?: string | null;
  pmid?: string | null;
  isbn?: string | null;
  url?: string | null;
  document_no?: string | null;
  tradition_context_id?: string | null;
  accessed_on?: string | null;
  notes?: string | null;
};

export type UpdateSourceErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_SOURCE_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_INVALID_SOURCE_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_SOURCE_NOT_FOUND"
  | "YEBS_SOURCE_TRADITION_NOT_FOUND"
  | "YEBS_SOURCE_STATUS_LOCKED"
  | "YEBS_SOURCE_STALE_UPDATE"
  | "YEBS_SOURCE_NO_CHANGES"
  | "YEBS_SOURCE_DOI_DUPLICATE"
  | "YEBS_SOURCE_PMID_DUPLICATE"
  | "YEBS_SOURCE_UPDATE_FAILED";

export type UpdateSourceResult =
  | { ok: true; row: YebsSourceRow }
  | { ok: false; code: UpdateSourceErrorCode };

const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateSourceErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_SOURCE_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_INVALID_SOURCE_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_SOURCE_NOT_FOUND",
  "YEBS_SOURCE_TRADITION_NOT_FOUND",
  "YEBS_SOURCE_STATUS_LOCKED",
  "YEBS_SOURCE_STALE_UPDATE",
  "YEBS_SOURCE_NO_CHANGES",
  "YEBS_SOURCE_DOI_DUPLICATE",
  "YEBS_SOURCE_PMID_DUPLICATE",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateSourceErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateSourceErrorCode)) {
    return msg as UpdateSourceErrorCode;
  }
  return "YEBS_SOURCE_UPDATE_FAILED";
}

/** Mevcut kaynak kaydını audit'li ve atomik olarak günceller. */
export async function updateSource(
  db: SupabaseClient,
  actorAdminId: string,
  sourceId: string,
  expectedUpdatedAt: string,
  patch: UpdateSourcePatch,
  reason: string,
): Promise<UpdateSourceResult> {
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_source_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_source_id: sourceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    console.error("[yebs] updateSource RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  const row = coerceSingleRow(data, "updateSource");
  if (row === null || !isCanonicalSourceRow(row)) {
    console.error("[yebs] updateSource beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_SOURCE_UPDATE_FAILED" };
  }
  return { ok: true, row };
}
