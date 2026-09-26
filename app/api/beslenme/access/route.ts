import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";

export const runtime = "nodejs";

/**
 * Beslenme MODÜL erişim probe'u (server-authoritative). Dashboard kartı + /beslenme sayfa
 * guard'ı bunu çağırır. Admin + module_permissions.beslenme=true uzman → 200 {access:true}.
 * İzinsiz uzman/anon → 401/403 (fail-closed). UI gizleme tek katman DEĞİL; asıl kapı server.
 *
 * `clients` yeteneği de döner (server-authoritative; tek users lookup) → /beslenme hub
 * "Danışan Planları" kartı yalnız Danışan Yolculuğu (clients) izni olanlara gösterilir
 * (dead-control önle). Kart gizleme yalnız UI kolaylığıdır; danışan API'leri zaten clients-gate'li.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // requireModuleAccess includeProfile'ı zorlar → beslenme gate + clients yeteneği aynı lookup'ta.
  const guard = await requireModuleAccess(req, "beslenme");
  if (!guard.ok) return guard.response;
  const clients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  return NextResponse.json(
    { ok: true, access: true, clients: clients === true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
