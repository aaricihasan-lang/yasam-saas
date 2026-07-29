import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getPlantTaxon } from "@/lib/aromaterapi/service/catalogReads";

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
