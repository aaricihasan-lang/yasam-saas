import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseListParams } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { listPlantTaxa, PLANT_TAXA_STATUS } from "@/lib/aromaterapi/service/catalogReads";

export const runtime = "nodejs";

/**
 * GET /api/aromaterapi/plant-taxa — Bitki (takson) tenant-scoped listesi.
 *
 * Güvenlik (C3C değişmez read sözleşmesi):
 *   - verifyUserRequest → tenantId YALNIZ oturumdan; query/body'den tenant KABUL EDİLMEZ.
 *   - service_role SELECT yalnız server servisinde; tarayıcı tabloya erişmez.
 *   - Mutation YOK. Ham DB hatası istemciye sızmaz (readServerError → stabil 500).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
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
