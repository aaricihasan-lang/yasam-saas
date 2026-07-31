import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireSuperAdminWorkspaceAccess } from "@/lib/admin/adminGuards";
import { recordWorkspaceView } from "@/lib/admin/workspaceAudit";

export const runtime = "nodejs";

/**
 * Admin workspace — client_homeworks güvenli okuma katmanı (Faz 1C).
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id, role=admin + active (service_role).
 *   - tenant_id SUNUCUDA hedef uzmanın users kaydından alınır.
 *   - client_id'nin o tenant'a ait olduğu doğrulanır.
 *   - client_homeworks sorgusu tenant_id + client_id birlikte kullanır.
 *   - Yalnızca GET (admin paneli ödevleri görüntüler, yazmaz).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> },
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const main = await requireSuperAdminWorkspaceAccess(db, adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status });

  const { id: expertUserId, clientId } = await params;
  if (!expertUserId || !clientId) {
    return NextResponse.json(
      { ok: false, error: "expertUserId ve clientId gerekli." },
      { status: 400 },
    );
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

  const { data: cli } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!cli) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu uzmana ait değil." },
      { status: 403 },
    );
  }

  const { data, error } = await db
    .from("client_homeworks")
    .select(
      "id, title, homework_type, description, start_date, end_date, status, expert_note, client_feedback, created_at",
    )
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rec = await recordWorkspaceView(db, adminId, expertUserId, "client_homeworks", { client_id: clientId });
  if (!rec.ok) return NextResponse.json({ ok: false, error: rec.error }, { status: rec.status });

  return NextResponse.json({ ok: true, homeworks: data ?? [] });
}
