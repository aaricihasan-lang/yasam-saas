import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { YH_TABLES, YH_DEFAULT_FLAGS } from "@/lib/yasam-hafizasi/config";

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
 *
 * Bu route retrieval/arama YAPMAZ (Sprint 1 / A1).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account, profile } = guard;

  // Modül izni (server-side; admin merkezî bypass). İzin yoksa 403.
  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return NextResponse.json({ ok: false, code: "YH_MODULE_FORBIDDEN" }, { status: 403 });
  }

  if (is_demo_account) {
    return NextResponse.json({
      ok: true,
      demo: true,
      accessible: true,
      tenantRows: 0,
      flags: { ...YH_DEFAULT_FLAGS },
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
    flags,
  });
}
