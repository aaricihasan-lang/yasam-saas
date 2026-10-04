import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/admin/users/overview — Üye Yönetimi "Yönetim Özeti / Dikkat Gerektirenler".
 *
 * Tek salt-okur RPC (admin_member_overview, 20271006000000): aktif oran paydası (demo olmayan +
 * onaylı + aktif uzman), Usage360 gerçek etkileşim sayaçları (7/30 gün aktif, 30/60/90+ gün
 * hareketsiz — ölçüm penceresi dolmadıysa NULL), yaklaşan/gecikmiş ödeme, onay bekleyen, güvenlik
 * uyarısı. Yalnız hesap + ticari meta + telemetri sayıları; uzman özel içeriği OKUNMAZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { data, error } = await db.rpc("admin_member_overview", {});
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Yönetim özeti okunamadı." }, { status: 500, headers: NO_STORE });
  }
  // Sözleşme: ham RPC biçimi (snake_case); istemci parseMemberOverview ile TEK kez ayrıştırır.
  return NextResponse.json({ ok: true, overview: data }, { headers: NO_STORE });
}
