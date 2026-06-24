import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * client_homeworks — tenant geneli "süresi geçmiş ödev" uyarı özeti (Faz 1C).
 *
 * danisan-yolculugu/liste sayfası, danışan başına süresi dolmuş aktif ödev
 * sayısını gösterir. Bu sorgu client_id'ye değil tenant'a göredir
 * (uzmanın tüm danışanları), bu yüzden /api/clients/[id]/homeworks yerine
 * ayrı bir özet endpoint kullanılır.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA user kaydından alınır.
 *   - Sorgu yalnızca bu tenant'ın kayıtlarını döndürür.
 *   - "bugün" sunucuda hesaplanır (client'tan tarih alınmaz).
 *
 * Dönüş: { ok, alerts: { [clientId]: adet } }
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("client_homeworks")
    .select("client_id,end_date,status,alert_dismissed_at")
    .eq("tenant_id", tenantId)
    .eq("status", "devam")
    .is("alert_dismissed_at", null)
    .not("end_date", "is", null)
    .lte("end_date", today);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const alerts: Record<string, number> = {};
  for (const row of (data ?? []) as { client_id?: string | null }[]) {
    if (!row.client_id) continue;
    alerts[row.client_id] = (alerts[row.client_id] || 0) + 1;
  }

  return NextResponse.json({ ok: true, alerts });
}
