import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { parseListParams } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { listSources, SOURCE_STATUS, SOURCE_TYPES } from "@/lib/aromaterapi/service/sourceReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { validateCreateReason, resolveActorLabel } from "@/lib/aromaterapi/service/writeValidation";
import { createSource, emitSourceWrite } from "@/lib/aromaterapi/service/sourceMutations";
import {
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  isPlainObject,
  keysAllowed,
  optNullableString,
  reqNonEmptyString,
} from "@/lib/aromaterapi/service/catalogWriteHttp";
import { parseSourceYear } from "@/lib/aromaterapi/sourceWriteFields";

export const runtime = "nodejs";

const SOURCE_BODY_LIMIT = 16 * 1024;

const SOURCE_CREATE_ALLOWED = new Set<string>([
  "source_type",
  "title",
  "authors",
  "organization",
  "publication_year",
  "doi",
  "pmid",
  "isbn",
  "url",
  "document_no",
  "notes",
  "reason",
]);

/**
 * GET /api/aromaterapi/sources — Kaynak tenant-scoped listesi (+ pasaj sayısı).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsed = parseListParams(url.searchParams, {
    sorts: {
      title: { column: "title", ascending: true },
      year: { column: "publication_year", ascending: false },
      updated: { column: "updated_at", ascending: false },
    },
    filters: {
      source_type: { column: "source_type", allow: SOURCE_TYPES },
      status: { column: "status", allow: SOURCE_STATUS },
    },
    yearFilter: { column: "publication_year" },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const { rows, total } = await listSources(guard.db, guard.tenantId, parsed.value);
    return readListOk(rows, parsed.value.page, parsed.value.limit, total);
  } catch (e) {
    return readServerError("sources:list", e);
  }
}

/**
 * POST /api/aromaterapi/sources — Kaynak künye CREATE (RPC + audit yolu).
 *
 * Güvenlik/sözleşme:
 *   - requireModuleAccess(includeProfile). Demo → 403.
 *   - actor/tenant YALNIZ guard'dan. EXACT allowlist → tenant/actor/id/status vb. → 400.
 *     status create'te YOK → DB default 'draft'. Yazım yalnız SECURITY DEFINER RPC üzerinden.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const bodyRes = await readJsonBounded(req, SOURCE_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, SOURCE_CREATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const sourceType = reqNonEmptyString(obj.source_type);
  const title = reqNonEmptyString(obj.title);
  if (!sourceType.ok || !title.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  if (!(SOURCE_TYPES as readonly string[]).includes(sourceType.value)) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }

  const authors = optNullableString(obj, "authors");
  const organization = optNullableString(obj, "organization");
  const doi = optNullableString(obj, "doi");
  const pmid = optNullableString(obj, "pmid");
  const isbn = optNullableString(obj, "isbn");
  const url = optNullableString(obj, "url");
  const documentNo = optNullableString(obj, "document_no");
  const notes = optNullableString(obj, "notes");
  const year = parseSourceYear(obj);
  if (
    !authors.ok || !organization.ok || !doi.ok || !pmid.ok || !isbn.ok ||
    !url.ok || !documentNo.ok || !notes.ok || !year.ok
  ) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  const reason = validateCreateReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await createSource(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    {
      sourceType: sourceType.value,
      title: title.value,
      authors: authors.value,
      organization: organization.value,
      publicationYear: year.value,
      doi: doi.value,
      pmid: pmid.value,
      isbn: isbn.value,
      url: url.value,
      documentNo: documentNo.value,
      notes: notes.value,
      reason: reason.value,
    },
  );
  return emitSourceWrite(result, 201);
}
