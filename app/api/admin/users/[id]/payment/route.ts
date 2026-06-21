import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  buildPaymentUpdatePayload,
  buildPaymentHistoryInsertPayload,
  rowHasPaymentColumns,
  type PaymentEditDraft,
} from "@/lib/admin/userManagement";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/users/[id]/payment — ödeme bilgilerini kaydet */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const body = (await req.json()) as { draft?: PaymentEditDraft };
  if (!body.draft) {
    return NextResponse.json({ error: "draft gerekli." }, { status: 400 });
  }

  // Ödeme kolonlarının var olduğunu doğrula
  const { data: currentRow } = await db
    .from("users")
    .select(USERS_SAFE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!currentRow) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  if (!rowHasPaymentColumns(currentRow as unknown as Record<string, unknown>)) {
    return NextResponse.json(
      { error: "Veritabanında ödeme kolonları bulunamadı." },
      { status: 422 },
    );
  }

  const payload = buildPaymentUpdatePayload(body.draft);

  const { error: userErr } = await db.from("users").update(payload).eq("id", id);
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const historyPayload = buildPaymentHistoryInsertPayload(id, payload);
  const { error: histErr } = await db.from("user_payment_history").insert(historyPayload);

  if (histErr) {
    return NextResponse.json({
      ok: true,
      warning: "Ödeme güncellendi; geçmiş kaydı eklenemedi: " + histErr.message,
    });
  }

  return NextResponse.json({ ok: true });
}
