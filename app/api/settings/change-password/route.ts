import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import {
  hashLoginIp,
  loginLockedMessage,
  NEW_PASSWORD_MIN_LENGTH,
} from "@/lib/auth/loginThrottle";

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
  if (guard.is_demo_account) {
    return NextResponse.json(
      { error: "Demo hesabında bu işlem kullanılamaz." },
      { status: 403 },
    );
  }
  const { userId, email, db } = guard;

  const body = (await req.json()) as { oldPassword?: unknown; newPassword?: unknown };
  const oldPassword = String(body.oldPassword ?? "").trim();
  const newPassword = String(body.newPassword ?? "").trim();

  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "Eski ve yeni şifre gerekli." }, { status: 400 });
  }
  // FAZ1 FINAL HARDENING: yeni parolalar en az 10 karakter (mevcut parolalar etkilenmez).
  if (newPassword.length < NEW_PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Yeni şifre en az ${NEW_PASSWORD_MIN_LENGTH} karakter olmalı.` },
      { status: 400 },
    );
  }
  if (oldPassword === newPassword) {
    return NextResponse.json({ error: "Yeni şifre eski şifreyle aynı olamaz." }, { status: 400 });
  }

  // Eski şifreyi doğrula — login ile AYNI kısıtlamalı yol (auth_login_guarded: throttle +
  // hash-only). Mevcut parola denemeleri de sayaca girer (oturum ele geçirilse bile kaba kuvvet yok).
  const verified = await verifyLoginCredentialsGuarded(
    db,
    email,
    oldPassword,
    hashLoginIp(extractClientIp(req.headers)),
  );

  if (verified.status === "locked") {
    return NextResponse.json(
      { error: loginLockedMessage(verified.retryAfterSeconds), code: "LOCKED" },
      { status: 429, headers: { "Retry-After": String(verified.retryAfterSeconds) } },
    );
  }
  if (verified.status === "error") {
    return NextResponse.json({ error: "Şifre doğrulanamadı." }, { status: 500 });
  }
  // Doğrulanan satır bu oturumun kullanıcısı olmalı (e-posta çakışmasına karşı bağlama).
  if (verified.status !== "ok" || verified.row.id !== userId) {
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
    return NextResponse.json({ error: "Şifre güncellenemedi." }, { status: 500 });
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
