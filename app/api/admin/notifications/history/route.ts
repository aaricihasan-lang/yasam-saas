import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import {
  istanbulDayEndExclusiveIso,
  istanbulDayStartIso,
  OWNER_HISTORY_PAGE_SIZE,
  ownerNotificationErrorStatus,
  parseOwnerHistoryQuery,
} from "@/lib/admin/ownerNotifications";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/admin/notifications/history?q=&type=&status=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=
 * “Tüm bildirimler”: arama (ad / e-posta), tür, durum (açık / çözülen / okunmamış / okunmuş),
 * Türkiye günü tarih aralığı, 25'li sayfalama. Yalnız owner.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const main = await requireMainAdmin(guard.db, guard.adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status, headers: NO_STORE });
  const q = parseOwnerHistoryQuery(req.nextUrl.searchParams);
  if (!q) return NextResponse.json({ ok: false, error: "Geçersiz filtre." }, { status: 400, headers: NO_STORE });
  const { data, error } = await guard.db.rpc("admin_notification_history", {
    p_actor: guard.adminId,
    p_q: q.q,
    p_type: q.type,
    p_status: q.status,
    p_from: q.from ? istanbulDayStartIso(q.from) : null,
    p_to: q.to ? istanbulDayEndExclusiveIso(q.to) : null,
    p_limit: OWNER_HISTORY_PAGE_SIZE,
    p_offset: (q.page - 1) * OWNER_HISTORY_PAGE_SIZE,
  });
  if (error || !data) {
    const status = ownerNotificationErrorStatus(error);
    return NextResponse.json({ ok: false, error: status === 403 ? "Bu alan yalnız owner'a açıktır." : "Bildirim geçmişi okunamadı." }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, page: q.page, pageSize: OWNER_HISTORY_PAGE_SIZE, ...(data as Record<string, unknown>) }, { headers: NO_STORE });
}
