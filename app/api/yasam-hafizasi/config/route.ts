import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { YH_DEFAULT_FLAGS } from "@/lib/yasam-hafizasi/config";

export const runtime = "nodejs";

/**
 * GET /api/yasam-hafizasi/config — oturumun tenant'ına ait feature flag durumu.
 *
 * Güvenlik:
 *   - verifyUserRequest binding (x-user-id + x-session-token, includeProfile).
 *   - yasam_hafizasi modül izni server-side (diğer YH route'larıyla tutarlı; SEV-3 fix).
 *     İzin yoksa 403 → izinsiz uzman başka bir tenant flag'i bile okuyamaz (yalnız kendi).
 *   - tenant SUNUCUDA oturumdan çözülür; body/query'den tenant KABUL EDİLMEZ.
 *   - Unauthenticated → 401 (guard döndürür).
 *   - Demo hesap → güvenli varsayılan (tüm flag'ler false).
 *
 * Bu route retrieval/arama YAPMAZ; yalnız flag durumunu döndürür (Sprint 1 / A1).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account, profile } = guard;

  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return NextResponse.json({ ok: false, code: "YH_MODULE_FORBIDDEN" }, { status: 403 });
  }

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, flags: { ...YH_DEFAULT_FLAGS } });
  }

  const flags = await getTenantFlags(tenantId, db);
  return NextResponse.json({ ok: true, flags });
}
