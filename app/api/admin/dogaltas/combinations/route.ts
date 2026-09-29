import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { adminTenantMissingResponse, foreignTenantResponse, resolveAdminOwnTenant } from "@/lib/admin/adminOwnTenant";

export const runtime = "nodejs";

/**
 * GET /api/admin/dogaltas/combinations?tenantId=<uuid>
 *
 * Admin için seçili tenant'ın kombinasyon kayıt listesi (veri paylaşımı seçim ekranı).
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + DB doğrulaması
 *     (role=admin AND active=true).
 *   - tenantId yalnızca admin doğrulamasından SONRA kabul edilir.
 *   - tenantId uuid formatı doğrulanır (rastgele filtre enjeksiyonu engellenir).
 *   - Minimal kolon döner: id, issue, variant_index (seçim listesi için yeterli).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  // GİZLİLİK: okuma tenant'ı SUNUCUDA çözülür (adminin kendi kütüphanesi). İstemcinin
  // gönderdiği tenantId yalnız eşleşme kontrolü içindir; başka tenant → 403.
  const tenantId = await resolveAdminOwnTenant(db, guard.adminId);
  if (!tenantId) return adminTenantMissingResponse();
  const requested = req.nextUrl.searchParams.get("tenantId")?.trim() ?? "";
  if (requested && (!UUID_RE.test(requested) || requested !== tenantId)) return foreignTenantResponse();

  const { data, error } = await db
    .from("combinations")
    .select("id, issue, variant_index")
    .eq("tenant_id", tenantId)
    .order("issue", { ascending: true })
    .order("variant_index", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
