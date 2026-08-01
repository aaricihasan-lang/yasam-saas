import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/writeValidation";
import { readFail, readNotFound, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { getMethodSeries } from "@/lib/aromaterapi/service/methodReads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ seriesId: string }> };

/**
 * GET /api/aromaterapi/methods/[seriesId] — Üretim yöntemi serisi detayı + revizyon
 * geçmişi (yeni → eski). Salt-okunur, tenant-scoped. Out-of-tenant/eksik seri → 404.
 *
 * Seri kimliği (method_kind/source/passage/method_lang) immutable'dır; içerik
 * revizyonlarda taşınır. Bu uç yalnız SELECT yapar; mutation YOKTUR.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { seriesId } = await ctx.params;
  if (!isUuid(seriesId)) return readFail("AROMA_INVALID_UUID");

  try {
    const series = await getMethodSeries(guard.db, guard.tenantId, seriesId);
    if (!series) return readNotFound();
    return NextResponse.json({ ok: true, series });
  } catch (e) {
    return readServerError("methods:series:detail", e);
  }
}
