import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/delete
 *
 * Soft delete: active=false olarak işaretler.
 * Gerçek silme değildir — gerekirse geri alınabilir.
 *
 * Güvenlik:
 *   1. x-admin-id header ile admin DB doğrulaması (adminGuard)
 *   2. verify_admin_login RPC ile admin şifre doğrulaması (server-side, plaintext geçmez)
 *   3. Adminin kendi hesabını silmesi engellenir
 *   4. Yalnızca owner admin seviyesi silebilir (admin_level = 'owner')
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  if (id === adminId) {
    return NextResponse.json(
      { error: "Kendi hesabınızı silemezsiniz." },
      { status: 400 },
    );
  }

  const body = (await req.json()) as { adminPassword?: string };
  const adminPassword = String(body.adminPassword ?? "").trim();

  if (!adminPassword) {
    return NextResponse.json({ error: "Admin şifresi gerekli." }, { status: 400 });
  }

  // Admin'in owner yetkisi var mı?
  const { data: adminRow } = await db
    .from("users")
    .select("email, admin_level")
    .eq("id", adminId)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "Admin kaydı bulunamadı." }, { status: 403 });
  }

  const adminLevel = String(adminRow.admin_level ?? "").trim().toLowerCase();
  const adminEmail = String(adminRow.email ?? "").trim().toLowerCase();
  const OWNER_FALLBACK = "admin@yasamsistemi.com";
  const isOwner =
    adminLevel === "owner" || (!adminLevel && adminEmail === OWNER_FALLBACK);

  if (!isOwner) {
    return NextResponse.json(
      { error: "Silme yetkisi yalnızca ana admine aittir." },
      { status: 403 },
    );
  }

  // Admin şifresini server-side RPC ile doğrula (plaintext browser'a gelmez)
  const { data: verified, error: verifyErr } = await db.rpc("verify_admin_login", {
    p_email: adminEmail,
    p_password: adminPassword,
  });

  if (verifyErr || !verified) {
    return NextResponse.json(
      { error: "Admin şifresi doğrulanamadı." },
      { status: 403 },
    );
  }

  // Soft delete: active=false
  const { error } = await db.from("users").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
