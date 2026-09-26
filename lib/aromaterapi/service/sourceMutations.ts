import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { CatalogActor } from "@/lib/aromaterapi/service/catalogMethodMutations";

/**
 * Aromaterapi Kaynaklar (sources) mutation server adapter (server-only).
 *
 * Kaynak create/update YALNIZ SECURITY DEFINER RPC ile (write-gate: service_role
 * bu tabloda yalnız SELECT). Actor/tenant kullanıcı input'undan YAPISAL olarak ayrıdır;
 * yalnız route guard'ından gelir. Kaynak "silme" = status→archived (update); hard delete YOK
 * (atıflı kaynak FK RESTRICT ile korunur). Ham DB hata metni route'a/istemciye TAŞINMAZ.
 *
 * catalogMethodMutations deseniyle birebir; CatalogActor tipi yeniden kullanılır. Kaynak'a
 * özel hata kodları (AROMA_SOURCE_NOT_FOUND) için ayrı sözleşme.
 */

export type SourceWriteErrorCode =
  | "AROMA_ACTOR_ID_REQUIRED"
  | "AROMA_ACTOR_LABEL_INVALID"
  | "AROMA_REASON_INVALID"
  | "AROMA_SOURCE_NOT_FOUND"
  | "AROMA_STALE"
  | "AROMA_FORBIDDEN_STATUS_TRANSITION"
  | "AROMA_CHECK_VIOLATION"
  | "AROMA_UNIQUE_VIOLATION"
  | "AROMA_FK_VIOLATION"
  | "AROMA_WRITE_FAILED";

export const SOURCE_ERROR_HTTP: Readonly<Record<SourceWriteErrorCode, number>> = {
  AROMA_ACTOR_ID_REQUIRED: 500,
  AROMA_ACTOR_LABEL_INVALID: 500,
  AROMA_REASON_INVALID: 400,
  AROMA_SOURCE_NOT_FOUND: 404,
  AROMA_STALE: 409,
  AROMA_FORBIDDEN_STATUS_TRANSITION: 422,
  AROMA_CHECK_VIOLATION: 422,
  AROMA_UNIQUE_VIOLATION: 409,
  AROMA_FK_VIOLATION: 422,
  AROMA_WRITE_FAILED: 500,
};

const RPC_P0001_CODES: ReadonlySet<SourceWriteErrorCode> = new Set<SourceWriteErrorCode>([
  "AROMA_ACTOR_ID_REQUIRED",
  "AROMA_ACTOR_LABEL_INVALID",
  "AROMA_REASON_INVALID",
  "AROMA_SOURCE_NOT_FOUND",
  "AROMA_STALE",
  "AROMA_FORBIDDEN_STATUS_TRANSITION",
]);

export function classifySourceRpcError(error: unknown): SourceWriteErrorCode {
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
  if (typeof message === "string" && RPC_P0001_CODES.has(message as SourceWriteErrorCode)) {
    return message as SourceWriteErrorCode;
  }
  return "AROMA_WRITE_FAILED";
}

export type SourceWriteResult =
  | { ok: true; entityId: string; noop: boolean; updatedAt: string | null }
  | { ok: false; code: SourceWriteErrorCode };

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function normalizeResult(data: unknown): SourceWriteResult {
  let obj: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) return { ok: false, code: "AROMA_WRITE_FAILED" };
    obj = data[0];
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, code: "AROMA_WRITE_FAILED" };
  }
  const row = obj as Record<string, unknown>;
  const entityId = asString(row.entity_id);
  if (!entityId) return { ok: false, code: "AROMA_WRITE_FAILED" };
  return {
    ok: true,
    entityId,
    noop: row.noop === true,
    updatedAt: asString(row.updated_at) ?? null,
  };
}

function fail(context: string, error: unknown): SourceWriteResult {
  console.error(`[aromaterapi:${context}] RPC failed:`, (error as { message?: unknown })?.message);
  return { ok: false, code: classifySourceRpcError(error) };
}

/** CatalogWriteResult → NextResponse (kaynak sözleşmesi). Başarı: no-op → 200, aksi → createdStatus. */
export function emitSourceWrite(result: SourceWriteResult, createdStatus: number): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: SOURCE_ERROR_HTTP[result.code] });
  }
  return NextResponse.json(
    { ok: true, noop: result.noop, entity_id: result.entityId, updated_at: result.updatedAt },
    { status: result.noop ? 200 : createdStatus },
  );
}

// ─── Input tipleri (route tarafından şekli doğrulanmış, kullanıcı-editable alanlar) ───

export type CreateSourceInput = {
  sourceType: string;
  title: string;
  authors: string | null;
  organization: string | null;
  publicationYear: number | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  documentNo: string | null;
  notes: string | null;
  reason: string | null;
};

export type UpdateSourceInput = Omit<CreateSourceInput, "reason"> & {
  status: string;
  expectedUpdatedAt: string | null;
  reason: string;
};

export async function createSource(
  db: SupabaseClient,
  actor: CatalogActor,
  input: CreateSourceInput,
): Promise<SourceWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_create_source_with_audit", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_source_type: input.sourceType,
    p_title: input.title,
    p_authors: input.authors,
    p_organization: input.organization,
    p_publication_year: input.publicationYear,
    p_doi: input.doi,
    p_pmid: input.pmid,
    p_isbn: input.isbn,
    p_url: input.url,
    p_document_no: input.documentNo,
    p_notes: input.notes,
    p_reason: input.reason,
  });
  if (error) return fail("createSource", error);
  return normalizeResult(data);
}

export async function updateSource(
  db: SupabaseClient,
  actor: CatalogActor,
  sourceId: string,
  input: UpdateSourceInput,
): Promise<SourceWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_update_source_with_audit", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_source_id: sourceId,
    p_source_type: input.sourceType,
    p_title: input.title,
    p_authors: input.authors,
    p_organization: input.organization,
    p_publication_year: input.publicationYear,
    p_doi: input.doi,
    p_pmid: input.pmid,
    p_isbn: input.isbn,
    p_url: input.url,
    p_document_no: input.documentNo,
    p_notes: input.notes,
    p_status: input.status,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason,
  });
  if (error) return fail("updateSource", error);
  return normalizeResult(data);
}
