import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { parseMemberCounts } from "@/lib/admin/memberListQuery";

export const runtime = "nodejs";

/**
 * GET /api/admin/metrics — admin dashboard sayım istatistikleri (Faz 2B-3).
 *
 * Dashboard, users tablosundan toplam/aktif/bekleyen sayımlarını publishable key
 * ile okuyordu; artık service_role'lü bu route üzerinden gelir.
 *
 * AŞAMA 2 · §4.1 (M4): yenileme sayaçları — gecikmiş (`renewalOverdue`) ve 30 gün içinde
 * yenilenecek (`renewalDue30`) onaylı + aktif + muaf olmayan uzman sayısı. Tanım tek kaynaktan
 * (public.admin_list_users counts; İstanbul günü) gelir → liste filtresiyle BİREBİR aynı sayı.
 * Yalnız bilgilendirme; otomatik işlem YOK.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id, role=admin + active (service_role).
 *   - Yalnızca AGREGE sayımlar döner; satır/PII/password DÖNMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  const [totalRes, activeRes, pendingRes, listRes] = await Promise.all([
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
    // Sayaçlar GLOBAL'dir (filtreden bağımsız); satır yükü için en küçük sayfa istenir.
    db.rpc("admin_list_users", {
      p_q: "",
      p_role_match: null,
      p_view: "members",
      p_approval: "all",
      p_active: "all",
      p_role: "expert",
      p_payment: "all",
      p_limit: 1,
      p_offset: 0,
      p_due: "all",
      p_sort: "default",
    }),
  ]);

  const counts = listRes.error
    ? null
    : parseMemberCounts(((listRes.data ?? {}) as { counts?: unknown }).counts);

  return NextResponse.json(
    {
      total: totalRes.error ? null : (totalRes.count ?? 0),
      active: activeRes.error ? null : (activeRes.count ?? 0),
      pending: pendingRes.error ? null : (pendingRes.count ?? 0),
      renewalOverdue: counts ? counts.renewal_overdue : null,
      renewalDue30: counts ? counts.renewal_due30 : null,
      systemOk: !totalRes.error,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
