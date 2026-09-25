import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Beslenme MODÜL erişim probe'u (server-authoritative). Dashboard kartı + /beslenme sayfa
 * guard'ı bunu çağırır. Admin + module_permissions.beslenme=true uzman → 200 {access:true}.
 * İzinsiz uzman/anon → 401/403 (fail-closed). UI gizleme tek katman DEĞİL; asıl kapı server.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { ok: true, access: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
