import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import { isUserPremiumPackage, adminPermissionsToPayload, mapDbUser } from "@/lib/admin/userManagement";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/users/[id] — kullanıcı detayı + ödeme geçmişi */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const { data, error } = await db
    .from("users")
    .select(USERS_SAFE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const { data: history } = await db
    .from("user_payment_history")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ user: data, paymentHistory: history ?? [] });
}

/** PATCH /api/admin/users/[id] — kullanıcı bilgileri veya modül izinleri */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const body = (await req.json()) as {
    action?: "edit" | "modules";
    fullName?: string;
    email?: string;
    role?: string;
    active?: boolean;
    modulePermissions?: Record<string, boolean>;
  };

  if (body.action === "modules") {
    if (!body.modulePermissions || typeof body.modulePermissions !== "object") {
      return NextResponse.json({ error: "modulePermissions gerekli." }, { status: 400 });
    }

    // Premium pakette modül izinleri değiştirilemez — sunucu koruması
    const { data: currentRow } = await db
      .from("users")
      .select(USERS_SAFE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (!currentRow) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    const mapped = mapDbUser(currentRow as unknown as Record<string, unknown>);
    if (isUserPremiumPackage(mapped)) {
      return NextResponse.json(
        { error: "Premium pakette modül izinleri değiştirilemez." },
        { status: 400 },
      );
    }

    const { error } = await db
      .from("users")
      .update({ module_permissions: adminPermissionsToPayload(body.modulePermissions as never) })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Varsayılan: edit (fullName, email, role, active)
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!fullName || !email) {
    return NextResponse.json({ error: "Ad ve e-posta zorunludur." }, { status: 400 });
  }

  // Rol yükseltme koruması: sadece 'admin' veya 'expert' kabul edilir
  const role = body.role === "admin" ? "admin" : "expert";

  const updatePayload: Record<string, unknown> = {
    full_name: fullName,
    email,
    role,
    active: body.active !== false,
  };

  const { error } = await db.from("users").update(updatePayload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
