import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/numeroloji/tenant-metrics — numerology_analyses tenant denetimi.
 *
 * Admin yüzeyleri (tenant-kontrol, kullanım-takibi, sistem-sağlığı/numeroloji)
 * tüm tenant'ların numeroloji analiz dağılımını publishable key ile okuyordu.
 * Bu okuma artık YALNIZCA service_role'lü bu route üzerinden, admin doğrulamasıyla
 * yapılır — anon key ile çapraz-tenant okuma kapatılır.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + binding, role=admin & active.
 *   - Admin olmayan kimse cross-tenant veri OKUYAMAZ.
 *   - SADECE agrege sayım + tenant_id listesi döner; analiz içeriği/PII DÖNMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  // Toplam kayıt sayısı (head count).
  const { count, error: countError } = await db
    .from("numerology_analyses")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  }

  // Tüm satırların tenant_id'sini sayfalı çek (tenant bazlı dağılım için).
  const ids: (string | null)[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await db
      .from("numerology_analyses")
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

  return NextResponse.json({ ok: true, total: count ?? 0, ids });
}
