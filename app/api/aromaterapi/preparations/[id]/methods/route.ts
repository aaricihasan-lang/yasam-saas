import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid, validateCreateReason, resolveActorLabel } from "@/lib/aromaterapi/service/writeValidation";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { createMethodSeriesWithFirstRevision } from "@/lib/aromaterapi/service/catalogMethodMutations";
import {
  CATALOG_BODY_LIMITS,
  catalogBad,
  catalogDemoForbidden,
  catalogPayloadTooLarge,
  emitCatalogWrite,
  extractMethodContent,
  isPlainObject,
  keysAllowed,
  reqNonEmptyString,
} from "@/lib/aromaterapi/service/catalogWriteHttp";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/aromaterapi/preparations/[id]/methods — Üretim yöntemi serisi + ilk revizyon
 * (atomik; ilk revizyon draft). C3D-B2A canonical yol.
 *
 * preparation id YALNIZ URL'den. note_hash İSTEMCİDEN ALINMAZ (server üretir). status/revision
 * kabul edilmez. faithful_source → source_id zorunlu; passage_id verilirse source_id zorunlu
 * ve pasaj tam olarak seçilen source'a ait olmalı (RPC/DB otoritesi).
 */
const CREATE_ALLOWED = new Set<string>([
  "method_kind",
  "source_id",
  "passage_id",
  "method_lang",
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
  "reason",
]);

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const { id } = await ctx.params;
  if (!isUuid(id)) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.method);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, CREATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const methodKind = reqNonEmptyString(obj.method_kind);
  const methodLang = reqNonEmptyString(obj.method_lang);
  if (!methodKind.ok || !methodLang.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");

  const optUuid = (key: string): { ok: true; value: string | null } | { ok: false } => {
    if (!(key in obj) || obj[key] === null) return { ok: true, value: null };
    const v = obj[key];
    if (typeof v === "string" && isUuid(v)) return { ok: true, value: v };
    return { ok: false };
  };
  const sourceId = optUuid("source_id");
  const passageId = optUuid("passage_id");
  if (!sourceId.ok || !passageId.ok) return catalogBad("AROMA_WRITE_INVALID_UUID");

  const content = extractMethodContent(obj);
  if (!content.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const reason = validateCreateReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await createMethodSeriesWithFirstRevision(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    {
      preparationId: id,
      methodKind: methodKind.value,
      sourceId: sourceId.value,
      passageId: passageId.value,
      methodLang: methodLang.value,
    },
    { ...content.value, reason: reason.value },
  );
  return emitCatalogWrite(result, 201);
}
