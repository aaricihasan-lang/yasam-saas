import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { parseListParams } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { listPlantTaxa, PLANT_TAXA_STATUS } from "@/lib/aromaterapi/service/catalogReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { validateCreateReason, resolveActorLabel } from "@/lib/aromaterapi/service/writeValidation";
import { createPlantTaxon } from "@/lib/aromaterapi/service/catalogMethodMutations";
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

/**
 * GET /api/aromaterapi/plant-taxa — Bitki (takson) tenant-scoped listesi.
 *
 * Güvenlik (C3C değişmez read sözleşmesi):
 *   - requireModuleAccess → tenantId YALNIZ oturumdan; query/body'den tenant KABUL EDİLMEZ.
 *   - service_role SELECT yalnız server servisinde; tarayıcı tabloya erişmez.
 *   - Mutation YOK. Ham DB hatası istemciye sızmaz (readServerError → stabil 500).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsed = parseListParams(url.searchParams, {
    sorts: {
      canonical: { column: "canonical_name", ascending: true },
      updated: { column: "updated_at", ascending: false },
      family: { column: "family", ascending: true },
    },
    filters: {
      status: { column: "status", allow: PLANT_TAXA_STATUS },
    },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const { rows, total } = await listPlantTaxa(guard.db, guard.tenantId, parsed.value);
    return readListOk(rows, parsed.value.page, parsed.value.limit, total);
  } catch (e) {
    return readServerError("plant-taxa:list", e);
  }
}

/**
 * POST /api/aromaterapi/plant-taxa — Bitki (takson) CREATE (C3D-B2A canonical yol).
 *
 * Güvenlik/sözleşme:
 *   - requireModuleAccess(includeProfile, "aromatherapy"). Demo → 403.
 *   - actor/tenant YALNIZ guard'dan. EXACT allowlist → tenant/actor/id/status/canonical_name
 *     vb. anahtarlar allowlist dışı → 400. canonical_name DB generated; status create'te YOK.
 *   - Değerler coerce/trim EDİLMEZ; canonical create yalnız SECURITY DEFINER RPC üzerinden.
 */
const CREATE_ALLOWED = new Set<string>([
  "genus",
  "species",
  "taxon_rank",
  "infraspecific_epithet",
  "is_hybrid",
  "author_citation",
  "family",
  "primary_common_name_tr",
  "reason",
]);

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return catalogDemoForbidden();

  const bodyRes = await readJsonBounded(req, CATALOG_BODY_LIMITS.taxon);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large" ? catalogPayloadTooLarge() : catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  if (!isPlainObject(bodyRes.value)) return catalogBad("AROMA_WRITE_INVALID_BODY");
  const obj = bodyRes.value;
  if (!keysAllowed(obj, CREATE_ALLOWED)) return catalogBad("AROMA_WRITE_FORBIDDEN_FIELD");

  const genus = reqNonEmptyString(obj.genus);
  const species = reqNonEmptyString(obj.species);
  const taxonRank = reqNonEmptyString(obj.taxon_rank);
  const family = reqNonEmptyString(obj.family);
  if (!genus.ok || !species.ok || !taxonRank.ok || !family.ok) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  const infra = optNullableString(obj, "infraspecific_epithet");
  const author = optNullableString(obj, "author_citation");
  const commonTr = optNullableString(obj, "primary_common_name_tr");
  const isHybrid = optBoolean(obj, "is_hybrid", false);
  if (!infra.ok || !author.ok || !commonTr.ok || !isHybrid.ok) {
    return catalogBad("AROMA_WRITE_INVALID_BODY");
  }
  const reason = validateCreateReason(obj.reason);
  if (!reason.ok) return catalogBad("AROMA_WRITE_REASON_INVALID");

  const label = resolveActorLabel(guard.profile, guard.email);
  const result = await createPlantTaxon(
    guard.db,
    { userId: guard.userId, label, tenantId: guard.tenantId },
    {
      genus: genus.value,
      species: species.value,
      taxonRank: taxonRank.value,
      infraspecificEpithet: infra.value,
      isHybrid: isHybrid.value,
      authorCitation: author.value,
      family: family.value,
      primaryCommonNameTr: commonTr.value,
      reason: reason.value,
    },
  );
  return emitCatalogWrite(result, 201);
}
