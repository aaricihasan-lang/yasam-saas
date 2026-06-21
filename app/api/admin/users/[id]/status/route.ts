import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

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

  const { error } = await db.from("users").update(updatePayload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
