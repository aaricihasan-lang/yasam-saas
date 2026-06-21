import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import {
  buildMembershipUpdatePayload,
  filterMembershipPayloadForRow,
  type PackagePlanUi,
} from "@/lib/auth/membership";
import { rowHasMembershipColumns } from "@/lib/admin/userManagement";
import { buildPremiumModulePermissionsPayload } from "@/lib/auth/modulePermissions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/users/[id]/package — paket / üyelik değiştir */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const body = (await req.json()) as { packagePlan?: string };
  const packagePlan = body.packagePlan as PackagePlanUi | undefined;

  if (!packagePlan) {
    return NextResponse.json({ error: "packagePlan gerekli." }, { status: 400 });
  }

  // Mevcut satırı çek — hangi kolon var, yok denetimi için
  const { data: currentRow, error: fetchErr } = await db
    .from("users")
    .select(USERS_SAFE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !currentRow) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const row = currentRow as unknown as Record<string, unknown>;

  if (!rowHasMembershipColumns(row)) {
    return NextResponse.json(
      { error: "Veritabanında paket kolonları bulunamadı." },
      { status: 422 },
    );
  }

  const rawPayload = buildMembershipUpdatePayload(packagePlan);
  const payload: Record<string, unknown> = { ...filterMembershipPayloadForRow(rawPayload, row) };

  // Premium → tüm modüller otomatik açılır
  if (packagePlan === "premium" && "module_permissions" in row) {
    payload.module_permissions = buildPremiumModulePermissionsPayload();
  }

  const { error } = await db.from("users").update(payload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
