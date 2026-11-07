import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { ownerNotificationErrorStatus, parseMarkReadBody } from "@/lib/admin/ownerNotifications";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * POST /api/admin/notifications/read — { ids: number[] } veya { allInfo: true }.
 * Yalnız BİLGİ bildirimleri okunmuş işaretlenir; karar bekleyenler bu uçla ASLA kapanmaz
 * (DB fonksiyonu kind='info' dışını yok sayar). Yalnız owner.
 */
export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const main = await requireMainAdmin(guard.db, guard.adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status, headers: NO_STORE });
  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status, headers: NO_STORE });
  const body = parseMarkReadBody(parsed.value);
  if (!body) return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400, headers: NO_STORE });
  const { data, error } = await guard.db.rpc("admin_notification_mark_read", {
    p_actor: guard.adminId,
    p_ids: body.ids,
    p_all_info: body.all,
  });
  if (error) {
    const status = ownerNotificationErrorStatus(error);
    return NextResponse.json({ ok: false, error: status === 403 ? "Bu alan yalnız owner'a açıktır." : "İşaretlenemedi." }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, marked: Number(data ?? 0) }, { headers: NO_STORE });
}
