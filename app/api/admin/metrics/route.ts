import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/metrics — admin dashboard sayım istatistikleri (Faz 2B-3).
 *
 * Dashboard, users tablosundan toplam/aktif/bekleyen sayımlarını publishable key
 * ile okuyordu; artık service_role'lü bu route üzerinden gelir.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id, role=admin + active (service_role).
 *   - Yalnızca AGREGE sayımlar döner; satır/PII/password DÖNMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  const [totalRes, activeRes, pendingRes] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }),
    db
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
      .eq("approval_status", "approved"),
    db
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("approval_status", "pending"),
  ]);

  return NextResponse.json({
    total: totalRes.error ? null : (totalRes.count ?? 0),
    active: activeRes.error ? null : (activeRes.count ?? 0),
    pending: pendingRes.error ? null : (pendingRes.count ?? 0),
    systemOk: !totalRes.error,
  });
}
