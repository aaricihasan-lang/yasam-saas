import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/health/db-ping — sistem sağlığı DB erişilebilirlik kontrolü (Faz 2B-2).
 *
 * Sistem-sağlığı "durum" sayfası users tablosuna head ping atıyordu (publishable key).
 * Artık bu hafif kontrol service_role'lü bu route üzerinden yapılır.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id, role=admin + active (service_role).
 *   - Veri DÖNMEZ; yalnızca erişilebilirlik (head count).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;
  const { error } = await db.from("users").select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
