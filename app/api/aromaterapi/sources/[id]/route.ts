import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getSource, SOURCE_STATUS, SOURCE_TYPES } from "@/lib/aromaterapi/service/sourceReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import {
  validateMandatoryReason,
  resolveActorLabel,
  isValidExpectedUpdatedAt,
} from "@/lib/aromaterapi/service/writeValidation";
import { updateSource, emitSourceWrite } from "@/lib/aromaterapi/service/sourceMutations";
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

type RouteContext = { params: Promise<{ id: string }> };

const SOURCE_BODY_LIMIT = 16 * 1024;

const SOURCE_UPDATE_ALLOWED = new Set<string>([
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
  "status",
  "expected_updated_at",
  "reason",
]);

/**
 * GET /api/aromaterapi/sources/[id] — Kaynak künye + pasaj/bilgi kaydı sayıları.
 * Out-of-tenant/eksik → 404.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  try {
    const source = await getSource(guard.db, guard.tenantId, id);
    if (!source) return readNotFound();
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return readServerError("sources:detail", e);
  }
}

/**
 * PATCH /api/aromaterapi/sources/[id] — Kaynak künye güncelleme (RPC + audit).
 *
 * Full-replacement + status matrisi (draft→verified/archived, verified→archived). Kaynak
 * "silme" = status='archived' ile bu uçtan yapılır (hard delete YOK). reason ZORUNLU;
 * expected_updated_at ile iyimser eşzamanlılık. actor/tenant YALNIZ guard'dan.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, SOURCE_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, SOURCE_UPDATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const sourceType = reqNonEmptyString(obj.source_type);
  const title = reqNonEmptyString(obj.title);
  const status = reqNonEmptyString(obj.status);
  if (!sourceType.ok || !title.ok || !status.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  if (!(SOURCE_TYPES as readonly string[]).includes(sourceType.value)) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!(SOURCE_STATUS as readonly string[]).includes(status.value)) {
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

  const expectedRaw = obj.expected_updated_at;
  if (typeof expectedRaw !== "string" || !isValidExpectedUpdatedAt(expectedRaw)) {
    return catalogBad("AROMA_WRITE_INVALID_TIMESTAMP");
  }
  const reason = validateMandatoryReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await updateSource(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    id,
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
      status: status.value,
      expectedUpdatedAt: expectedRaw,
      reason: reason.value as string,
    },
  );
  return emitSourceWrite(result, 200);
}
