import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getSchoolById } from "@/lib/yebs/service/schools";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/yebs/schools/[id]
 *
 * YEBS D2 (yebs_schools) SALT-OKUNUR admin detay ucu (API-A1R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Yalnız guard.db (service_role). tenant/kullanıcı sahiplik filtresi YOK;
 *     yebs_schools merkezî admin referans tablosudur.
 *   - Geçersiz UUID → 400; kayıt yok → 404; DB hatası → 500 (ham metin gizli).
 *   - SALT-OKUNUR: yalnız GET; POST/PATCH/PUT/DELETE YOK. Mutation/RPC YOK.
 *     Audit response'a dahil edilmez; tradition JOIN edilmez.
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
        error: "Geçersiz ekol kimliği.",
        code: "YEBS_INVALID_SCHOOL_ID",
      },
      { status: 400 },
    );
  }

  const result = await getSchoolById(db, id);

  if (!result.ok) {
    if (result.code === "YEBS_SCHOOL_NOT_FOUND") {
      return NextResponse.json(
        {
          ok: false,
          error: "Ekol kaydı bulunamadı.",
          code: result.code,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "YEBS ekol kaydı alınamadı.",
        code: result.code,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, row: result.row });
}
