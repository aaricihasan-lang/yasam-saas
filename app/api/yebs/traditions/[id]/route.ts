import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getTradition } from "@/lib/yebs/service/traditions";
import { isUuid } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import { toTraditionDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/traditions/[id] — tek gelenek (salt-okunur, stripped DTO).
 * Görünüm politikası uygulanır: published görünümünde yayınlanmamış kayıt 404
 * gibi ele alınır (sızıntı yok); preview'da archived 404.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Geçersiz kimlik.", code: "YEBS_INVALID_ID" }, { status: 400 });
  }
  const view = resolveView(req.nextUrl.searchParams.get("preview"));

  const result = await getTradition(db, id);
  if (!result.ok) {
    const status = result.code === "YEBS_TRADITION_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: "Gelenek bulunamadı.", code: result.code }, { status });
  }
  if (!isEntityStatusVisible(result.row.status, view)) {
    return NextResponse.json({ ok: false, error: "Gelenek bulunamadı.", code: "YEBS_TRADITION_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, row: toTraditionDTO(result.row), view }, { headers: { "Cache-Control": "no-store" } });
}
