import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/users-tenant-ids — users.tenant_id listesi (admin tenant denetimi için).
 *
 * tenant-kontrol paneli, kullanıcı-tenant dağılımı + legacy tenant denetimi için
 * users.tenant_id okuyordu (tarayıcıdan publishable). Artık bu okuma yalnızca
 * service_role'lü bu route üzerinden yapılır.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + binding (service_role).
 *   - SADECE `tenant_id` döner; password_hash/email/ad-soyad gibi PII DÖNMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;
  const ids: (string | null)[] = [];
  const pageSize = 1000;
  let from = 0;

  // Tüm kullanıcıların tenant_id'sini sayfalı çek (orijinal client mantığıyla aynı).
  while (true) {
    const { data, error } = await db
      .from("users")
      .select("tenant_id")
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data?.length) break;

    ids.push(...data.map((row) => (row as { tenant_id: string | null }).tenant_id));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return NextResponse.json({ ok: true, ids });
}
