import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * POST /api/admin/users/[id]/package — KALDIRILDI (FAZ 1 / MEM-009).
 *
 * Owner ürün kararı: Deneme / Pro / Premium ayrımı YOK; her ONAYLI uzman Premium'dur ve
 * admin paket SEÇMEZ. Premium, yalnız "Onayla" akışında (modül seçimiyle birlikte, atomik
 * admin_approve_expert_with_modules RPC) verilir. Bu uç artık hiçbir üyelik alanını
 * değiştirmez → `packagePlan: "foo"` dahil hiçbir girdi 200 dönmez; legacy plan alanı
 * dışarıdan manipüle edilemez (başka admin hesabı dahil).
 *
 * Kimlik doğrulama KORUNUR (önce guard): yetkisiz çağrı 401/403 (admin authz regresyon
 * matrisi değişmez); yetkili çağrı 410 Gone.
 */
export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  return NextResponse.json(
    {
      error:
        "Paket seçimi kaldırıldı: onaylı her uzman Premium'dur. Premium ve modül erişimi yalnız “Onayla” akışında verilir.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
