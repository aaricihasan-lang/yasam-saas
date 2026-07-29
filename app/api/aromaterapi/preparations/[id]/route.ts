import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getPreparation } from "@/lib/aromaterapi/service/catalogReads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/preparations/[id] — Preparat detay + bağlı takson +
 * bilgi kaydı sayısı. "Üretim ve Elde Ediliş" alanları şemada YOK → istemci
 * profesyonel boş-durum gösterir (sahte yöntem üretilmez).
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  try {
    const preparation = await getPreparation(guard.db, guard.tenantId, id);
    if (!preparation) return readNotFound();
    return NextResponse.json({ ok: true, preparation });
  } catch (e) {
    return readServerError("preparations:detail", e);
  }
}
