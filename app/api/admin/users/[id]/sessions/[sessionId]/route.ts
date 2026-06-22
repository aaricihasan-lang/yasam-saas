import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

/**
 * PATCH /api/admin/users/[id]/sessions/[sessionId]
 * Admin tarafından belirli bir kullanıcı oturumunu sonlandırır.
 * Kullanıcı eski cihazda max 60 saniye içinde login ekranına düşer (useSessionGuard).
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id, sessionId } = await ctx.params;
  if (!id || !sessionId) {
    return NextResponse.json({ error: "Kullanıcı ve oturum ID gerekli." }, { status: 400 });
  }

  // Oturumun bu kullanıcıya ait olduğunu doğrula
  const { data: session } = await db
    .from("user_sessions")
    .select("id, user_id, is_active")
    .eq("id", sessionId)
    .eq("user_id", id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 404 });
  }

  if (!session.is_active) {
    return NextResponse.json({ error: "Oturum zaten kapalı." }, { status: 409 });
  }

  const { error } = await db
    .from("user_sessions")
    .update({
      is_active:  false,
      ended_at:   new Date().toISOString(),
      end_reason: "admin_terminated",
    })
    .eq("id", sessionId)
    .eq("user_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
