import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseListParams, isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import {
  listPreparations,
  PREPARATION_STATUS,
  PREPARATION_TYPES,
} from "@/lib/aromaterapi/service/catalogReads";

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
