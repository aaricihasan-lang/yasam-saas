import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { guardAdminLockoutById, requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/status
 *
 * Body: { action: "approve" | "reject" | "toggle_active", currentActive?: boolean }
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  // Adminin kendi hesabı üzerinde pasif/aktif işlemi engellenir
  if (id === adminId) {
    return NextResponse.json(
      { error: "Kendi hesabınız üzerinde durum değişikliği yapamazsınız." },
      { status: 400 },
    );
  }

  // Hedef bir admin ise yalnız ana yönetici durum değiştirebilir (normal admin
  // başka admini yönetemez). Expert hedefte normal admin serbest.
  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) {
    return NextResponse.json({ error: adminTarget.error }, { status: adminTarget.status });
  }

  const body = (await req.json()) as {
    action?: string;
    currentActive?: boolean;
  };

  let updatePayload: Record<string, unknown>;

  switch (body.action) {
    case "approve":
      updatePayload = {
        approval_status: "approved",
        active: true,
        approved_at: new Date().toISOString(),
      };
      break;

    case "reject":
      updatePayload = {
        approval_status: "rejected",
        active: false,
      };
      break;

    case "toggle_active":
      updatePayload = { active: !body.currentActive };
      break;

    default:
      return NextResponse.json(
        { error: "Geçersiz action. approve | reject | toggle_active bekleniyor." },
        { status: 400 },
      );
  }

  // Kilitlenme koruması: pasifleştirme (active=false) owner'ı veya son aktif admini düşüremez.
  if (updatePayload.active === false) {
    const lock = await guardAdminLockoutById(db, id, { willBeActive: false });
    if (!lock.ok) {
      return NextResponse.json({ error: lock.error }, { status: lock.status });
    }
  }

  const { error } = await db.from("users").update(updatePayload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
