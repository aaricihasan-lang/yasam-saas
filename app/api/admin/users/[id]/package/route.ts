import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import {
  buildMembershipUpdatePayload,
  filterMembershipPayloadForRow,
  type PackagePlanUi,
} from "@/lib/auth/membership";
import { rowHasMembershipColumns } from "@/lib/admin/userManagement";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/users/[id]/package — paket / üyelik değiştir */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

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
  const membershipPayload = filterMembershipPayloadForRow(rawPayload, row);

  // PREMIUM: AŞAMA 1 atomik onay/premium sözleşmesiyle TUTARLI olması için premium ATAMA da
  // admin_approve_expert_premium RPC'sinden geçer. Böylece premium/YH geçişi + ZORUNLU audit
  // (user_approved) + approved_at koru + module_permissions koru (NULL) + hedef satır FOR UPDATE
  // TEK transaction'da olur. Bu, eski "audit'siz yh_grade doğrudan çağrısı" boşluğunu kapatır
  // (status→approve ile birebir aynı yol). FAIL-CLOSED: RPC hatası → 500 (retry idempotent).
  if (packagePlan === "premium") {
    const { error } = await db.rpc("admin_approve_expert_premium", {
      p_user_id: id,
      p_membership: membershipPayload,
      p_actor_admin_id: adminId,
    });
    if (error) {
      return NextResponse.json(
        { error: "Premium/Yaşam Hafızası erişimi verilemedi (tekrar deneyin)." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // TRIAL / PRO: YH kapsam dışı; mevcut app-layer üyelik güncellemesi (active/approved zorlanmaz).
  const { error } = await db.from("users").update({ ...membershipPayload }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
