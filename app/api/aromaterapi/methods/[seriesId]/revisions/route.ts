import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid, validateMandatoryReason, resolveActorLabel } from "@/lib/aromaterapi/service/writeValidation";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { appendMethodRevision } from "@/lib/aromaterapi/service/catalogMethodMutations";
import {
  CATALOG_BODY_LIMITS,
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  emitCatalogWrite,
  extractMethodContent,
  isPlainObject,
  keysAllowed,
} from "@/lib/aromaterapi/service/catalogWriteHttp";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ seriesId: string }> };

/**
 * POST /api/aromaterapi/methods/[seriesId]/revisions — Mevcut seriye YENİ immutable revizyon
 * ekler (append-only). C3D-B2A.
 *
 * series identity/method_kind/source/passage/method_lang body'de KABUL EDİLMEZ (immutable seri).
 * note_hash server üretir. expected_latest_revision + reason ZORUNLU. Aynı içerik hash'i son
 * revizyonla birebir aynıysa kontrollü no-op (yeni revizyon/audit yok). Stale → 409.
 */
const APPEND_ALLOWED = new Set<string>([
  "plant_part_used",
  "material_state",
  "method_text",
  "equipment",
  "amount_ratio",
  "solvent_carrier",
  "duration_text",
  "temperature_text",
  "steps",
  "filtration",
  "resting",
  "storage",
  "quality_notes",
  "safety_notes",
  "expected_latest_revision",
  "reason",
]);

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const { seriesId } = await ctx.params;
  if (!isUuid(seriesId)) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.method);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, APPEND_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const expected = obj.expected_latest_revision;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  const content = extractMethodContent(obj);
  if (!content.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const reason = validateMandatoryReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await appendMethodRevision(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    seriesId,
    { ...content.value, reason: reason.value as string },
    expected,
  );
  return emitCatalogWrite(result, 201);
}
