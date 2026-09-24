import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/numeroloji/tenant-metrics — numeroloji analiz tenant denetimi.
 *
 * NUM-008: KANONİK kaynak numerology_records'tur (analizler bu tabloya yazılır).
 * Legacy numerology_analyses tablosu app tarafından ASLA yazılmaz; admin metrikleri
 * eskiden onu okuyordu → gerçek analizler eksik/yanlış sayılıyordu. Artık sayım ve
 * tenant dağılımı numerology_records'tan alınır (home dashboard zaten doğruydu).
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

  // Toplam kayıt sayısı (head count). Kanonik tablo: numerology_records.
  const { count, error: countError } = await db
    .from("numerology_records")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
  }

  // Tüm satırların tenant_id'sini sayfalı çek (tenant bazlı dağılım için).
  const ids: (string | null)[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await db
      .from("numerology_records")
      .select("tenant_id")
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
    }
    if (!data?.length) break;

    ids.push(...data.map((row) => (row as { tenant_id: string | null }).tenant_id));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return NextResponse.json({ ok: true, total: count ?? 0, ids });
}
