import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getSource } from "@/lib/aromaterapi/service/sourceReads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/sources/[id] — Kaynak künye + pasaj/bilgi kaydı sayıları.
 * Out-of-tenant/eksik → 404.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  try {
    const source = await getSource(guard.db, guard.tenantId, id);
    if (!source) return readNotFound();
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return readServerError("sources:detail", e);
  }
}
