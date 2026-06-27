import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * /api/admin/users/[id]/archive — admin'in BAŞKA bir uzmanın personal_archives
 * kayıtlarını SALT OKUNUR görüntülemesi için güvenli server kapısı.
 *
 * Güvenlik / tenant izolasyonu:
 *   1. verifyAdminRequest → x-admin-id + x-session-token + binding + role=admin & active.
 *      (verifyUserRequest YETMEZ; o yalnızca çağıranın KENDİ tenant'ını döndürür.)
 *   2. Hedef tenant_id BODY/QUERY'den ALINMAZ → service_role ile users tablosundan
 *      [id] (hedef uzman) üzerinden okunur. Böylece admin yalnızca gerçek hedef
 *      uzmanın tenant'ını görür, istemci sahte tenant gönderemez.
 *   3. Tüm sorgular .eq("tenant_id", targetTenantId) ile bağlanır.
 *
 * Yazma işlemi YOK — admin arşiv ekranları salt okunurdur.
 *
 * Query:
 *   - (yok)            → hedef uzmanın tüm personal_archives kayıtları
 *   - ?archiveId=...   → tek kayıt (detay)
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: targetUserId } = await ctx.params;
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  // Hedef uzmanın tenant'ı SUNUCUDA çözülür (service_role) — istemciden gelmez.
  const { data: targetRow, error: targetErr } = await db
    .from("users")
    .select("id, tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const targetTenantId = targetRow.tenant_id != null ? String(targetRow.tenant_id).trim() : "";
  if (!targetTenantId) {
    return NextResponse.json(
      { ok: false, error: "Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı." },
      { status: 404 },
    );
  }

  const archiveId = req.nextUrl.searchParams.get("archiveId")?.trim() ?? "";

  if (archiveId) {
    const { data, error } = await db
      .from("personal_archives")
      .select("*")
      .eq("tenant_id", targetTenantId)
      .eq("id", archiveId)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ ok: true, row: data });
  }

  const { data, error } = await db
    .from("personal_archives")
    .select("*")
    .eq("tenant_id", targetTenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}
