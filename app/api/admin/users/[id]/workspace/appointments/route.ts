import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { recordWorkspaceView } from "@/lib/admin/workspaceAudit";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[id]/workspace/appointments — admin'in incelediği uzmanın
 * randevu listesi (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyAdminRequest → role=admin + active (service_role).
 *   - Hedef tenant SUNUCUDA, [id] uzmanının users.tenant_id'sinden çözülür.
 *   - Sorgu tenant_id ile .eq filtrelenir.
 *
 * Query (opsiyonel): client_id (tenant içi), from / to (appointment_date aralığı).
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

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id")?.trim() || null;
  const from = url.searchParams.get("from")?.trim() || null;
  const to = url.searchParams.get("to")?.trim() || null;

  let query = db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("appointment_date", { ascending: true });

  if (clientId) query = query.eq("client_id", clientId);
  if (from) query = query.gte("appointment_date", from);
  if (to) query = query.lte("appointment_date", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rec = await recordWorkspaceView(db, adminId, expertUserId, "appointments", clientId ? { client_id: clientId } : undefined);
  if (!rec.ok) return NextResponse.json({ ok: false, error: rec.error }, { status: rec.status });

  return NextResponse.json({ ok: true, appointments: data ?? [] });
}
