import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isUuid } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/users/[id]/payment-history */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Geçersiz kullanıcı ID." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const { data, error } = await db
    .from("user_payment_history")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Ödeme geçmişi okunamadı." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });

  return NextResponse.json({ history: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
