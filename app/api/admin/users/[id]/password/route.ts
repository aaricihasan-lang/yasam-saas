import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/users/[id]/password — kullanıcı şifresini değiştir */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const body = (await req.json()) as { newPassword?: string };
  const newPassword = String(body.newPassword ?? "").trim();

  if (!newPassword) {
    return NextResponse.json({ error: "Yeni şifre giriniz." }, { status: 400 });
  }

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC)
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", {
    p_plain: newPassword,
  });

  if (hashError || !hashResult) {
    return NextResponse.json(
      { error: "Şifre hashlenemedi: " + (hashError?.message ?? "bilinmeyen hata") },
      { status: 500 },
    );
  }

  const { error } = await db
    .from("users")
    .update({ password_hash: hashResult as string })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
