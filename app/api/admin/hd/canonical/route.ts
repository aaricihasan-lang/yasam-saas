import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getCanonicalDetail, listCanonical } from "@/lib/human-design/admin/centralContentPersistence";
import { isHdEntityKind } from "@/lib/human-design/admin/centralContentValidation";

export const runtime = "nodejs";

/**
 * /api/admin/hd/canonical — merkezî canonical KİMLİK salt-okuma (write YOK).
 * verifyAdminRequest → service_role. tenant_id/user_id/role kabul edilmez.
 * GET ?entityId=  → detay | GET ?kind=tip → liste | GET → tüm 112 kimlik.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const entityId = req.nextUrl.searchParams.get("entityId")?.trim();
  if (entityId) {
    const r = await getCanonicalDetail(db, entityId);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: r.error.code === "not_found" ? 404 : 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, row: r.data }, { headers: NO_STORE });
  }

  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim();
  const kind = kindRaw && isHdEntityKind(kindRaw) ? kindRaw : undefined;
  const r = await listCanonical(db, kind);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows: r.data }, { headers: NO_STORE });
}
