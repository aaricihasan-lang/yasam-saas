import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Owner-only erişim probe'u. Dashboard kartı + /beslenme sayfa guard'ı bunu çağırır.
 * Super-admin/owner → 200 {owner:true}. Normal admin/expert/anon → 401/403 (fail-closed).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { ok: true, owner: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
