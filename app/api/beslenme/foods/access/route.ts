import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeFoodContributor } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Manuel besin KATKI erişim probe'u (server-authoritative). Uzman "Besinlerim" sayfası
 * + dashboard/nav girişi bunu çağırır. Geçer: owner (super-admin) VEYA dar bayraklı uzman
 * (module_permissions.beslenme_manual_food===true). Aksi → 401/403 (fail-closed).
 * UI gizleme tek katman DEĞİLDİR; asıl kapı server guard'dır (bkz. requireBeslenmeFoodContributor).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeFoodContributor(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { ok: true, authority: guard.authority },
    { headers: { "Cache-Control": "no-store" } },
  );
}
