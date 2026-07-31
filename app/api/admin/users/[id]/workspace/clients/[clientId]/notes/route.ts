import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { recordWorkspaceView } from "@/lib/admin/workspaceAudit";

export const runtime = "nodejs";

/**
 * Admin workspace — client_notes güvenli okuma katmanı (Faz 1A-ek).
 *
 * Admin başka bir uzmanın çalışma alanını görüntüler; danışan o uzmanın
 * tenant'ına aittir (admin'in değil). Bu yüzden /api/clients/[id]/notes
 * (tenant'ı login user'dan alır) burada kullanılamaz — admin'e özel route gerekir.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id, role=admin + active (service_role doğrulaması).
 *   - tenant_id SUNUCUDA hedef uzmanın users kaydından alınır.
 *   - client_id'nin o tenant'a ait olduğu doğrulanır.
 *   - client_notes sorgusu tenant_id + client_id birlikte kullanır.
 *   - Yalnızca GET (admin paneli notları görüntüler, yazmaz).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> },
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status });

  const { id: expertUserId, clientId } = await params;
  if (!expertUserId || !clientId) {
    return NextResponse.json(
      { ok: false, error: "expertUserId ve clientId gerekli." },
      { status: 400 },
    );
  }

  // Hedef uzmanın tenant'ı (sunucuda)
  const { data: expert, error: expertErr } = await db
    .from("users")
    .select("tenant_id")
    .eq("id", expertUserId)
    .maybeSingle();

  if (expertErr || !expert?.tenant_id) {
    return NextResponse.json({ ok: false, error: "Uzman bulunamadı." }, { status: 404 });
  }
  const tenantId = String(expert.tenant_id);

  // Danışan gerçekten bu uzmanın tenant'ına mı ait?
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
    .from("client_notes")
    .select("saglik_notu, adres, oneriler, notlar")
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rec = await recordWorkspaceView(db, adminId, expertUserId, "client_notes", { client_id: clientId });
  if (!rec.ok) return NextResponse.json({ ok: false, error: rec.error }, { status: rec.status });

  return NextResponse.json({ ok: true, note: data ?? null });
}
