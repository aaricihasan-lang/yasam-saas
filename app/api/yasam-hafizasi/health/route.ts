import { NextRequest, NextResponse } from "next/server";
import { demoYhFixtureSize } from "@/lib/demo/demoYasamHafizasi";
import { membershipInactiveResponse, verifyUserRequest } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { YH_TABLES, YH_DEFAULT_FLAGS } from "@/lib/yasam-hafizasi/config";
import { isSyntheticTenantId } from "@/lib/tenancy/syntheticTenants";

export const runtime = "nodejs";

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

  return NextResponse.json({
    ok: true,
    accessible,
    tenantRows: tenantQ.count ?? 0,
    syntheticTenant: isSyntheticTenantId(tenantId),
    flags,
  });
}
