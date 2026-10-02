import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { loadTenantCountSummary } from "@/app/api/admin/system-health/_lib/tenantCounts";

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
 *   - AA-4: satır başına ham tenant_id listesi DÖNMEZ; yalnız agrege
 *     { total, tenants: {tenant_id: count}, nullTenantRows }. Analiz içeriği/PII DÖNMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const result = await loadTenantCountSummary(guard.db, "numerology_records");
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "İşlem tamamlanamadı." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      total: result.summary.total,
      tenants: result.summary.tenants,
      nullTenantRows: result.summary.nullTenantRows,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
