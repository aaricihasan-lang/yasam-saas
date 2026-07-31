import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getCanonicalDetail, getRow, publishContent } from "@/lib/human-design/admin/centralContentPersistence";
import { HdContentAuditError } from "@/lib/human-design/admin/centralContentAudit";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * /api/admin/hd/content/publish — içeriği published'a taşır.
 * Published validation DB CHECK'leri (published_common + published_typed) uygular;
 * eksik alan → 400. verifyAdminRequest → service_role; audit=published.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  const id = raw && typeof (raw as { id?: unknown }).id === "string" ? String((raw as { id: string }).id).trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });

  const existing = await getRow(guard.db, "hd_canonical_content", id);
  if (!existing.ok) return NextResponse.json({ ok: false, error: existing.error.message }, { status: existing.error.code === "not_found" ? 404 : 500, headers: NO_STORE });
  const ent = await getCanonicalDetail(guard.db, String(existing.data.entity_id));
  if (!ent.ok) return NextResponse.json({ ok: false, error: ent.error.message }, { status: 500, headers: NO_STORE });

  try {
    const r = await publishContent(guard.db, guard.adminId, id, ent.data);
    if (!r.ok) {
      const st = r.error.code === "validation" ? 400 : r.error.code === "not_found" ? 404 : 500;
      return NextResponse.json({ ok: false, error: r.error.message }, { status: st, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof HdContentAuditError) return NextResponse.json({ ok: false, error: `audit: ${e.message}` }, { status: 500, headers: NO_STORE });
    throw e;
  }
}
