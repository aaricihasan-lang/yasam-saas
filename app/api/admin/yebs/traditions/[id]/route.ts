import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getTradition } from "@/lib/yebs/service/traditions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/yebs/traditions/[id]
 *
 * YEBS D1 (yebs_traditions) SALT-OKUNUR admin detay ucu (API-A0R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Yalnız guard.db (service_role). tenant/kullanıcı sahiplik filtresi YOK;
 *     yebs_traditions merkezî admin referans tablosudur.
 *   - Geçersiz UUID → 400; kayıt yok → 404; DB hatası → 500 (ham metin gizli).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Geçersiz gelenek kimliği.",
        code: "YEBS_INVALID_TRADITION_ID",
      },
      { status: 400 },
    );
  }

  const result = await getTradition(db, id);

  if (!result.ok) {
    if (result.code === "YEBS_TRADITION_NOT_FOUND") {
      return NextResponse.json(
        {
          ok: false,
          error: "Gelenek kaydı bulunamadı.",
          code: result.code,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "YEBS gelenek kaydı alınamadı.",
        code: result.code,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, row: result.row });
}
