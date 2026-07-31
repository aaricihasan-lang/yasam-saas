import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  isUuid,
  isValidExpectedUpdatedAt,
  validateMandatoryReason,
  resolveActorLabel,
} from "@/lib/aromaterapi/service/writeValidation";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { transitionMethodRevisionStatus } from "@/lib/aromaterapi/service/catalogMethodMutations";
import {
  CATALOG_BODY_LIMITS,
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  emitCatalogWrite,
  isPlainObject,
  keysAllowed,
  reqNonEmptyString,
} from "@/lib/aromaterapi/service/catalogWriteHttp";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ seriesId: string; revisionId: string }> };

/**
 * PATCH /api/aromaterapi/methods/[seriesId]/revisions/[revisionId] — Revizyon durum geçişi.
 * C3D-B2A.
 *
 * series + revision id YALNIZ URL'den. İzinli geçişler (RPC otoritesi): draft→verified,
 * draft→archived, verified→archived. verify sırasında mevcut verified revizyon aynı
 * transaction'da otomatik archived edilir (tek verified değişmezi). reason + expected_updated_at
 * ZORUNLU. Aynı status → no-op.
 */
const PATCH_ALLOWED = new Set<string>(["target_status", "expected_updated_at", "reason"]);

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const { seriesId, revisionId } = await ctx.params;
  if (!isUuid(seriesId) || !isUuid(revisionId)) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.status);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, PATCH_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const targetStatus = reqNonEmptyString(obj.target_status);
  if (!targetStatus.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const expectedUpdatedAt = reqNonEmptyString(obj.expected_updated_at);
  if (!expectedUpdatedAt.ok || !isValidExpectedUpdatedAt(expectedUpdatedAt.value)) {
    return catalogBad("AROMA_WRITE_INVALID_TIMESTAMP");
  }
  const reason = validateMandatoryReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await transitionMethodRevisionStatus(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    seriesId,
    revisionId,
    {
      targetStatus: targetStatus.value,
      expectedUpdatedAt: expectedUpdatedAt.value,
      reason: reason.value as string,
    },
  );
  return emitCatalogWrite(result, 200);
}
