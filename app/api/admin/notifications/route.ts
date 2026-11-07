import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { ownerNotificationErrorStatus } from "@/lib/admin/ownerNotifications";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/admin/notifications — Owner bildirim zili (yalnız platform owner'ı).
 * Karar bekleyenlerin tamamı + son 30 bilgi + sayaçlar. Güvenlik üç katman: admin oturumu
 * (verifyAdminRequest) → ana yönetici (requireMainAdmin) → RPC aktörü DB'de yeniden doğrular (AN401).
 * Normal uzman bu uca erişemez (401/403); normal admin 403 alır ve zil hiç gösterilmez.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const main = await requireMainAdmin(guard.db, guard.adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status, headers: NO_STORE });
  const { data, error } = await guard.db.rpc("admin_notification_feed", { p_actor: guard.adminId, p_info_limit: 30 });
  if (error || !data) {
    const status = ownerNotificationErrorStatus(error);
    return NextResponse.json(
      { ok: false, error: status === 403 ? "Bu alan yalnız owner'a açıktır." : "Bildirimler şu an okunamadı." },
      { status, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) }, { headers: NO_STORE });
}
