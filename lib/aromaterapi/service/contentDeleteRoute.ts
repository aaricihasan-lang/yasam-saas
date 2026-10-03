import "server-only";

import type { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  isUuid,
  isValidExpectedUpdatedAt,
  resolveActorLabel,
  validateMandatoryReason,
} from "@/lib/aromaterapi/service/writeValidation";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import {
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  isPlainObject,
  keysAllowed,
} from "@/lib/aromaterapi/service/catalogWriteHttp";
import {
  CONTENT_DELETE_ERROR_HTTP,
  deleteContentRecord,
  emitContentDelete,
  type ContentDeleteKind,
} from "@/lib/aromaterapi/service/contentDeleteMutations";

const DELETE_BODY_LIMIT = 8 * 1024;
const DELETE_ALLOWED = new Set<string>(["expected_updated_at", "reason"]);

/**
 * DELETE /api/aromaterapi/{plant-taxa|preparations|claims}/[id] ortak gövdesi (AROMA-4).
 * sources/[id] DELETE ile aynı sözleşme:
 *   - Gövde: { expected_updated_at, reason } (ikisi de ZORUNLU; başka alan → 400).
 *   - Demo hesap → 403. Geçersiz UUID → 400. Başka tenant / eksik → 404 (varlık sızmaz).
 *   - Referanslı → 409 *_REFERENCED + `references` sayıları; eski sürüm → 409 AROMA_STALE.
 *   - RPC yok → 503 AROMA_DELETE_UNAVAILABLE. Ham DB hatası istemciye sızmaz.
 * actor/tenant YALNIZ guard'dan; kayıt id YALNIZ URL'den.
 */
export async function handleContentDelete(
  req: NextRequest,
  rawId: string,
  kind: ContentDeleteKind,
): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  if (!isUuid(rawId)) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, DELETE_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, DELETE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const expectedRaw = obj.expected_updated_at;
  if (typeof expectedRaw !== "string" || !isValidExpectedUpdatedAt(expectedRaw)) {
    return catalogBad("AROMA_WRITE_INVALID_TIMESTAMP");
  }
  const reason = validateMandatoryReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await deleteContentRecord(
    guard.db,
    kind,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    rawId,
    { expectedUpdatedAt: expectedRaw, reason: (reason.value as string).trim() },
  );
  if (!result.ok) {
    const failStatus = CONTENT_DELETE_ERROR_HTTP[result.code];
    if (failStatus >= 500 || failStatus === 409) {
      await trackUsage(guard, req, { module: "aromatherapy", action: "action_failed", failedAction: "record_deleted", subEntity: kind, errorClass: failStatus === 409 ? "conflict" : "server" });
    }
  } else {
    await trackUsage(guard, req, { module: "aromatherapy", action: "record_deleted", subEntity: kind, resourceId: rawId });
  }
  return emitContentDelete(result);
}
