import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  isUuid,
  isValidExpectedUpdatedAt,
  validateMandatoryReason,
  resolveActorLabel,
} from "@/lib/aromaterapi/service/writeValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getPlantTaxon } from "@/lib/aromaterapi/service/catalogReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { updatePlantTaxon } from "@/lib/aromaterapi/service/catalogMethodMutations";
import {
  CATALOG_BODY_LIMITS,
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  emitCatalogWrite,
  isPlainObject,
  keysAllowed,
  optBoolean,
  optNullableString,
  reqNonEmptyString,
} from "@/lib/aromaterapi/service/catalogWriteHttp";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/plant-taxa/[id] — Takson detay + bağlı preparat özeti.
 * Out-of-tenant/eksik kayıt → 404 (varlık sızdırmaz).
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  try {
    const result = await getPlantTaxon(guard.db, guard.tenantId, id);
    if (!result) return readNotFound();
    return NextResponse.json({ ok: true, taxon: result.taxon, preparations: result.preparations });
  } catch (e) {
    return readServerError("plant-taxa:detail", e);
  }
}

/**
 * PATCH /api/aromaterapi/plant-taxa/[id] — Takson UPDATE (full-replacement; C3D-B2A).
 *
 * taxon id YALNIZ URL'den. reason + expected_updated_at ZORUNLU. status geçişi RPC'de
 * matrise göre doğrulanır (draft→verified→approved). canonical_name DB generated (yazılamaz).
 * Out-of-tenant → 404; stale → 409; kanonik duplicate → 409.
 */
const UPDATE_ALLOWED = new Set<string>([
  "genus",
  "species",
  "taxon_rank",
  "infraspecific_epithet",
  "is_hybrid",
  "author_citation",
  "family",
  "primary_common_name_tr",
  "status",
  "expected_updated_at",
  "reason",
]);

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const { id } = await ctx.params;
  if (!isUuid(id)) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.taxon);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, UPDATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const genus = reqNonEmptyString(obj.genus);
  const species = reqNonEmptyString(obj.species);
  const taxonRank = reqNonEmptyString(obj.taxon_rank);
  const family = reqNonEmptyString(obj.family);
  const status = reqNonEmptyString(obj.status);
  if (!genus.ok || !species.ok || !taxonRank.ok || !family.ok || !status.ok) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  const infra = optNullableString(obj, "infraspecific_epithet");
  const author = optNullableString(obj, "author_citation");
  const commonTr = optNullableString(obj, "primary_common_name_tr");
  const isHybrid = optBoolean(obj, "is_hybrid", false);
  if (!infra.ok || !author.ok || !commonTr.ok || !isHybrid.ok) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }

  const expectedUpdatedAt = reqNonEmptyString(obj.expected_updated_at);
  if (!expectedUpdatedAt.ok || !isValidExpectedUpdatedAt(expectedUpdatedAt.value)) {
    return catalogBad("AROMA_WRITE_INVALID_TIMESTAMP");
  }
  const reason = validateMandatoryReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await updatePlantTaxon(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    id,
    {
      genus: genus.value,
      species: species.value,
      taxonRank: taxonRank.value,
      infraspecificEpithet: infra.value,
      isHybrid: isHybrid.value,
      authorCitation: author.value,
      family: family.value,
      primaryCommonNameTr: commonTr.value,
      status: status.value,
      expectedUpdatedAt: expectedUpdatedAt.value,
      reason: reason.value as string,
    },
  );
  return emitCatalogWrite(result, 200);
}
