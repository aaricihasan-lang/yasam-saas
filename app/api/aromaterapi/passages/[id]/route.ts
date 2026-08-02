import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getPassage } from "@/lib/aromaterapi/service/sourceReads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/passages/[id] — Pasaj detay; katmanlar AYRI anahtarlarda:
 *   original_text (özgün) / translations (sadık çeviri) / editorial_explanations
 *   (açıklama) / editorial_interpretations (yorum + uzman notu). Fallback YAPMAZ.
 * Out-of-tenant/eksik → 404.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  try {
    const passage = await getPassage(guard.db, guard.tenantId, id);
    if (!passage) return readNotFound();
    return NextResponse.json({ ok: true, passage });
  } catch (e) {
    return readServerError("passages:detail", e);
  }
}
