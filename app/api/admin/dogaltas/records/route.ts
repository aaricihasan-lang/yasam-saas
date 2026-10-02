import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { adminTenantMissingResponse, foreignTenantResponse, resolveAdminOwnTenant } from "@/lib/admin/adminOwnTenant";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * GET /api/admin/dogaltas/records?type=stones|minerals&tenantId=<uuid>
 *
 * Veri Paylaşımı "seçerek aktar" kayıt seçicisi için adminin KENDİ kütüphane tenant'ındaki
 * taş / mineral listesi (P2-08). Eskiden sayfa bu listeyi tarayıcıdan publishable anahtarla
 * doğrudan kilitli tablolardan okumaya çalışıyordu → prod'da "permission denied" (42501).
 *
 * Güvenlik (/api/admin/dogaltas/combinations ile aynı desen):
 *   - verifyAdminRequest → x-admin-id + x-session-token + DB doğrulaması (role=admin AND active).
 *     Normal uzman / demo / kimliksiz istek → 401/403.
 *   - Okuma tenant'ı SUNUCUDA çözülür (resolveAdminOwnTenant); istemcinin tenantId'si yalnız
 *     eşleşme kontrolüdür — farklı/uygunsuz tenant → 403.
 *   - service_role yalnız burada (guard.db). Ham DB hatası dönmez (serverErrorResponse).
 *   - Minimal kolon: id + ad (seçim listesi). P2-07: 1000-satır tavanı yok (sayfalı okuma).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES = {
  stones: { table: "stones", label: "stone_name" },
  minerals: { table: "minerals", label: "name" },
} as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (type !== "stones" && type !== "minerals") {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt tipi." }, { status: 400 });
  }
  const cfg = TYPES[type];

  const tenantId = await resolveAdminOwnTenant(db, guard.adminId);
  if (!tenantId) return adminTenantMissingResponse();
  const requested = req.nextUrl.searchParams.get("tenantId")?.trim() ?? "";
  if (requested && (!UUID_RE.test(requested) || requested !== tenantId)) return foreignTenantResponse();

  const res = await fetchAllRows<Record<string, unknown>>((from, to) =>
    db
      .from(cfg.table)
      .select(`id, ${cfg.label}`)
      .eq("tenant_id", tenantId)
      .order(cfg.label, { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (!res.ok) {
    return serverErrorResponse({ route: "admin/dogaltas/records", action: `GET:${type}`, tenantId, cause: res.error });
  }

  const rows = res.rows.map((r) => ({ id: String(r.id), label: String(r[cfg.label] ?? r.id) }));
  return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store" } });
}
