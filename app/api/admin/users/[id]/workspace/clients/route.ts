import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { recordWorkspaceView } from "@/lib/admin/workspaceAudit";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[id]/workspace/clients — admin'in incelediği uzmanın danışan listesi
 * (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token, role=admin + active (service_role).
 *   - Hedef tenant SUNUCUDA, URL'deki [id] uzmanının users.tenant_id'sinden çözülür.
 *   - Sorgu tenant_id ile .eq filtrelenir.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status });

  const { id: expertUserId } = await params;
  if (!expertUserId) {
    return NextResponse.json({ ok: false, error: "expertUserId gerekli." }, { status: 400 });
  }

  const { data: expert, error: expertErr } = await db
    .from("users")
    .select("tenant_id")
    .eq("id", expertUserId)
    .maybeSingle();

  if (expertErr || !expert?.tenant_id) {
    return NextResponse.json({ ok: false, error: "Uzman bulunamadı." }, { status: 404 });
  }
  const tenantId = String(expert.tenant_id);

  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rec = await recordWorkspaceView(db, adminId, expertUserId, "clients");
  if (!rec.ok) return NextResponse.json({ ok: false, error: rec.error }, { status: rec.status });

  return NextResponse.json({ ok: true, clients: data ?? [] });
}
