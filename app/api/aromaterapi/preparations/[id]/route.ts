import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  isUuid,
  isValidExpectedUpdatedAt,
  validateMandatoryReason,
  resolveActorLabel,
} from "@/lib/aromaterapi/service/writeValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getPreparation } from "@/lib/aromaterapi/service/catalogReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { updatePreparation } from "@/lib/aromaterapi/service/catalogMethodMutations";
import {
  CATALOG_BODY_LIMITS,
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  emitCatalogWrite,
  isPlainObject,
  keysAllowed,
  optNullableString,
  reqNonEmptyString,
} from "@/lib/aromaterapi/service/catalogWriteHttp";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/preparations/[id] — Preparat detay + bağlı takson + bilgi kaydı sayısı.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  try {
    const preparation = await getPreparation(guard.db, guard.tenantId, id);
    if (!preparation) return readNotFound();
    return NextResponse.json({ ok: true, preparation });
  } catch (e) {
    return readServerError("preparations:detail", e);
  }
}

/**
 * PATCH /api/aromaterapi/preparations/[id] — Preparat UPDATE (full-replacement; C3D-B2A).
 *
 * Preparata en az bir method series bağlıysa doğal kimlik alanları (taxon_id/
 * preparation_type/plant_part/chemotype) değiştirilemez → 409 AROMA_PREPARATION_IDENTITY_LOCKED
 * (RPC otoritesi). reason + expected_updated_at ZORUNLU; status geçişi matrise göre.
 */
const UPDATE_ALLOWED = new Set<string>([
  "taxon_id",
  "preparation_type",
  "plant_part",
  "chemotype",
  "status",
  "expected_updated_at",
  "reason",
]);

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const { id } = await ctx.params;
  if (!isUuid(id)) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.preparation);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, UPDATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const taxonId = obj.taxon_id;
  if (typeof taxonId !== "string" || !isUuid(taxonId)) return catalogBad("AROMA_WRITE_INVALID_UUID");
  const prepType = reqNonEmptyString(obj.preparation_type);
  const plantPart = reqNonEmptyString(obj.plant_part);
  const status = reqNonEmptyString(obj.status);
  if (!prepType.ok || !plantPart.ok || !status.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const chemotype = optNullableString(obj, "chemotype");
  if (!chemotype.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");

  const expectedUpdatedAt = reqNonEmptyString(obj.expected_updated_at);
  if (!expectedUpdatedAt.ok || !isValidExpectedUpdatedAt(expectedUpdatedAt.value)) {
    return catalogBad("AROMA_WRITE_INVALID_TIMESTAMP");
  }
  const reason = validateMandatoryReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await updatePreparation(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    id,
    {
      taxonId,
      preparationType: prepType.value,
      plantPart: plantPart.value,
      chemotype: chemotype.value,
      status: status.value,
      expectedUpdatedAt: expectedUpdatedAt.value,
      reason: reason.value as string,
    },
  );
  return emitCatalogWrite(result, 200);
}
