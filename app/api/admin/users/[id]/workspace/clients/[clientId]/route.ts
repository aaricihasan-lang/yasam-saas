import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[id]/workspace/clients/[clientId] — admin'in incelediği uzmanın
 * tek danışanı + taşları (client_stones) + seansları (client_sessions) (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyAdminRequest → role=admin + active (service_role).
 *   - Hedef tenant SUNUCUDA, [id] uzmanının users.tenant_id'sinden çözülür.
 *   - clientId'nin o tenant'a ait olduğu doğrulanır (IDOR engellenir).
 *   - Tüm alt sorgular tenant_id + client_id ile filtrelenir.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> },
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { id: expertUserId, clientId } = await params;
  if (!expertUserId || !clientId) {
    return NextResponse.json(
      { ok: false, error: "expertUserId ve clientId gerekli." },
      { status: 400 },
    );
  }

  const { db } = guard;

  const { data: expert, error: expertErr } = await db
    .from("users")
    .select("tenant_id")
    .eq("id", expertUserId)
    .maybeSingle();

  if (expertErr || !expert?.tenant_id) {
    return NextResponse.json({ ok: false, error: "Uzman bulunamadı." }, { status: 404 });
  }
  const tenantId = String(expert.tenant_id);

  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (clientErr) {
    return NextResponse.json({ ok: false, error: clientErr.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu uzmana ait değil." },
      { status: 403 },
    );
  }

  const [stonesRes, sessionsRes] = await Promise.all([
    db.from("client_stones").select("*").eq("tenant_id", tenantId).eq("client_id", clientId),
    db.from("client_sessions").select("*").eq("tenant_id", tenantId).eq("client_id", clientId),
  ]);

  if (stonesRes.error) {
    return NextResponse.json({ ok: false, error: stonesRes.error.message }, { status: 500 });
  }
  if (sessionsRes.error) {
    return NextResponse.json({ ok: false, error: sessionsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    client,
    stones: stonesRes.data ?? [],
    sessions: sessionsRes.data ?? [],
  });
}
