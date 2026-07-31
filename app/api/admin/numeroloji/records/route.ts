import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { recordWorkspaceView } from "@/lib/admin/workspaceAudit";

export const runtime = "nodejs";

/**
 * /api/admin/numeroloji/records — admin'in bir uzmanın numeroloji kayıtlarını
 * çapraz-tenant görüntülemesi için güvenli kapı.
 *
 * Güvenlik: verifyAdminRequest (role=admin + active + token binding), service-role db.
 * tenantId QUERY'den gelir ama YALNIZCA admin doğrulandıktan sonra kullanılır.
 *
 * GET ?tenantId=&id= → { ok, row }   (tekil)
 * GET ?tenantId=     → { ok, rows }  (liste)
 */

const TABLE = "numerology_records";

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  // Uzman numeroloji kayıtlarını çapraz-tenant görüntüleme yalnız ANA YÖNETİCİYE açık.
  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return NextResponse.json({ ok: false, error: main.error }, { status: main.status });

  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim();
  if (!tenantId) return NextResponse.json({ ok: false, error: "tenantId zorunludur." }, { status: 400 });

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) {
    const { data, error } = await db
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    const recOne = await recordWorkspaceView(db, adminId, null, "numerology_record", { tenant_id: tenantId, record_id: id });
    if (!recOne.ok) return NextResponse.json({ ok: false, error: recOne.error }, { status: recOne.status });
    return NextResponse.json({ ok: true, row: data });
  }

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const recList = await recordWorkspaceView(db, adminId, null, "numerology_records", { tenant_id: tenantId });
  if (!recList.ok) return NextResponse.json({ ok: false, error: recList.error }, { status: recList.status });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}
