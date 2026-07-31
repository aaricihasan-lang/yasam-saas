import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { guardAdminLockoutById, requireMainAdmin } from "@/lib/admin/adminGuards";

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

  // Silme yalnız ANA YÖNETİCİYE açıktır (kalıcı is_super_admin işareti; e-posta/
  // admin_level'a GÜVENİLMEZ — admin_level canlıda her admin için 'owner' üretir).
  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) {
    return NextResponse.json({ error: main.error }, { status: main.status });
  }

  // verify_admin_login için ana-adminin e-postası gerekli.
  const { data: adminRow } = await db
    .from("users")
    .select("email")
    .eq("id", adminId)
    .maybeSingle();
  if (!adminRow) {
    return NextResponse.json({ error: "Admin kaydı bulunamadı." }, { status: 403 });
  }
  const adminEmail = String(adminRow.email ?? "").trim().toLowerCase();

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

  // Kilitlenme koruması: owner veya son aktif admin (soft) silinemez.
  const lock = await guardAdminLockoutById(db, id, { isDelete: true });
  if (!lock.ok) {
    return NextResponse.json({ error: lock.error }, { status: lock.status });
  }

  // Soft delete: active=false
  const { error } = await db.from("users").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
