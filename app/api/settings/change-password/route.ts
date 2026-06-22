import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * POST /api/settings/change-password
 * Giriş yapmış kullanıcının kendi şifresini değiştirmesi.
 * Body: { oldPassword, newPassword }
 * Header: x-user-id
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { userId, email, db } = guard;

  const body = (await req.json()) as { oldPassword?: unknown; newPassword?: unknown };
  const oldPassword = String(body.oldPassword ?? "").trim();
  const newPassword = String(body.newPassword ?? "").trim();

  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "Eski ve yeni şifre gerekli." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Yeni şifre en az 6 karakter olmalı." }, { status: 400 });
  }
  if (oldPassword === newPassword) {
    return NextResponse.json({ error: "Yeni şifre eski şifreyle aynı olamaz." }, { status: 400 });
  }

  // Eski şifreyi doğrula — login_user RPC ile (guard'ın service_role db'si yeterli)
  const { data: loginData, error: loginError } = await db.rpc("login_user", {
    p_email: email.toLowerCase().trim(),
    p_password: oldPassword,
  });

  if (loginError) {
    return NextResponse.json({ error: "Şifre doğrulanamadı." }, { status: 500 });
  }

  const rows = Array.isArray(loginData)
    ? loginData
    : loginData != null
    ? [loginData]
    : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Mevcut şifre hatalı." }, { status: 400 });
  }

  // Yeni şifreyi hashle
  const { data: newHash, error: hashError } = await db.rpc("hash_password", {
    p_plain: newPassword,
  });

  if (hashError || !newHash) {
    return NextResponse.json({ error: "Şifre hashlenemedi." }, { status: 500 });
  }

  // Şifreyi güncelle
  const { error: updateError } = await db
    .from("users")
    .update({ password_hash: newHash as string })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Diğer oturumları kapat (mevcut hariç)
  const currentToken = req.headers.get("x-session-token")?.trim() ?? "";
  const sessQuery = db
    .from("user_sessions")
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
      end_reason: "password_changed",
    })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (currentToken) {
    await sessQuery.neq("session_token", currentToken);
  } else {
    await sessQuery;
  }

  return NextResponse.json({ ok: true });
}
