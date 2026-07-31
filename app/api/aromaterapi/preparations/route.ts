import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseListParams, isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import {
  listPreparations,
  PREPARATION_STATUS,
  PREPARATION_TYPES,
} from "@/lib/aromaterapi/service/catalogReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { validateCreateReason, resolveActorLabel } from "@/lib/aromaterapi/service/writeValidation";
import { createPreparation } from "@/lib/aromaterapi/service/catalogMethodMutations";
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

/**
 * GET /api/aromaterapi/preparations — Preparat tenant-scoped listesi.
 * Opsiyonel plant_taxon_id filtresi (UUID doğrulanır; geçersizse 400).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const taxonRaw = url.searchParams.get("plant_taxon_id");
  let taxonId: string | undefined;
  if (taxonRaw !== null && taxonRaw !== "") {
    if (!isUuid(taxonRaw)) return readFail("AROMA_INVALID_UUID");
    taxonId = taxonRaw;
  }

  const parsed = parseListParams(url.searchParams, {
    sorts: {
      updated: { column: "updated_at", ascending: false },
      type: { column: "preparation_type", ascending: true },
    },
    filters: {
      preparation_type: { column: "preparation_type", allow: PREPARATION_TYPES },
      status: { column: "status", allow: PREPARATION_STATUS },
    },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const { rows, total } = await listPreparations(guard.db, guard.tenantId, parsed.value, taxonId);
    return readListOk(rows, parsed.value.page, parsed.value.limit, total);
  } catch (e) {
    return readServerError("preparations:list", e);
  }
}

/**
 * POST /api/aromaterapi/preparations — Preparat CREATE (C3D-B2A canonical yol).
 * Parent taxon aynı tenantta olmalı (out-of-tenant → 404). status create'te YOK (DB default).
 * Doğal kimlik duplicate → 409.
 */
const CREATE_ALLOWED = new Set<string>([
  "taxon_id",
  "preparation_type",
  "plant_part",
  "chemotype",
  "reason",
]);

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.preparation);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, CREATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const taxonId = obj.taxon_id;
  if (typeof taxonId !== "string" || !isUuid(taxonId)) return catalogBad("AROMA_WRITE_INVALID_UUID");
  const prepType = reqNonEmptyString(obj.preparation_type);
  const plantPart = reqNonEmptyString(obj.plant_part);
  if (!prepType.ok || !plantPart.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const chemotype = optNullableString(obj, "chemotype");
  if (!chemotype.ok) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const reason = validateCreateReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await createPreparation(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    {
      taxonId,
      preparationType: prepType.value,
      plantPart: plantPart.value,
      chemotype: chemotype.value,
      reason: reason.value,
    },
  );
  return emitCatalogWrite(result, 201);
}
