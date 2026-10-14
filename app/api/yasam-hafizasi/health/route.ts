import { NextRequest, NextResponse } from "next/server";
import { demoYhFixtureSize } from "@/lib/demo/demoYasamHafizasi";
import { membershipInactiveResponse, verifyUserRequest } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { YH_TABLES, YH_DEFAULT_FLAGS } from "@/lib/yasam-hafizasi/config";
import { isSyntheticTenantId } from "@/lib/tenancy/syntheticTenants";

export const runtime = "nodejs";

/** Kanonik aktarım kuyruğu (supabase/migrations/20260815000000_yasam_hafizasi_outbox.sql). */
const YH_OUTBOX_TABLE = "yasam_hafizasi_outbox";

/**
 * GET /api/yasam-hafizasi/health — indeks erişilebilirliği + BU TENANT'A AİT özet sayaçlar.
 *
 * Güvenlik:
 *   - verifyUserRequest binding (includeProfile); tenant SUNUCUDA oturumdan.
 *   - yasam_hafizasi modül izni server-side (diğer YH route'larıyla tutarlı). İzin yoksa 403.
 *   - HAM İÇERİK DÖNDÜRMEZ — yalnız aggregate sayaçlar (head:true ile satır çekilmez).
 *   - TENANT-ONLY: başka tenant'ların toplamı/kırılımı SIZDIRILMAZ (global toplam sayaç
 *     KALDIRILDI; SEV-3 fix). Yalnız bu tenant'ın satır sayısı döner.
 *   - Demo hesap → sıfır sayaçlar + güvenli varsayılan.
 *   - `syntheticTenant`: oturum tenant'ı sentetik mi (ADMIN_LIBRARY; mesleki indeks DIŞINDA,
 *     bilinçli). UI bunu hata gibi değil "kapsam dışı" bilgisi olarak gösterir. Yalnız boolean.
 *
 * Bu route retrieval/arama YAPMAZ (Sprint 1 / A1).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  // P1-4 ÜYELİK kapısı (requireModuleAccess ile AYNI kural; admin muaf).
  if (!hasMembershipAccessForRow(guard.profile ?? {})) return membershipInactiveResponse();

  const { db, tenantId, is_demo_account, profile } = guard;

  // Modül izni (server-side; admin merkezî bypass). İzin yoksa 403.
  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return NextResponse.json({ ok: false, code: "YH_MODULE_FORBIDDEN" }, { status: 403 });
  }

  // DEMO VİTRİN: demo hesap gerçek index'e BAĞLANMAZ; sentetik fixture "hazır" olarak raporlanır
  // (arama uçları da aynı fixture'dan yanıt verir — lib/demo/demoYasamHafizasi.ts).
  if (is_demo_account) {
    return NextResponse.json({
      ok: true,
      demo: true,
      accessible: true,
      tenantRows: demoYhFixtureSize(),
      syntheticTenant: false,
      flags: { ...YH_DEFAULT_FLAGS, yh_enabled: true, yh_hizli: true },
    });
  }

  const table = YH_TABLES.index;

  // head:true → yalnızca sayım; hiçbir satır içeriği dönmez. YALNIZ session tenant'ı
  // (tenant request'ten ASLA gelmez). Global/başka-tenant sayacı DÖNDÜRÜLMEZ.
  const tenantQ = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const accessible = !tenantQ.error;
  const flags = await getTenantFlags(tenantId, db);
  const tenantRows = tenantQ.count ?? 0;

  // Final-A1: indeks boşken "Hazırlanıyor" yalnız GERÇEKTEN işlenmeyi bekleyen aktarım olayı varsa
  // gösterilir. Yalnız bu tenant'ın pending/processing olay SAYISI (head:true; içerik dönmez).
  // Hata → alan gönderilmez (UI işlem iddia etmez).
  let tenantPending: number | undefined;
  if (accessible && tenantRows === 0) {
    const pendingQ = await db
      .from(YH_OUTBOX_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "processing"]);
    if (!pendingQ.error) tenantPending = pendingQ.count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    accessible,
    tenantRows,
    ...(tenantPending === undefined ? {} : { tenantPending }),
    syntheticTenant: isSyntheticTenantId(tenantId),
    flags,
  });
}
