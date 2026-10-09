import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { newPasswordPolicyMessage } from "@/lib/auth/passwordPolicy";
import {
  hashLoginIp,
  loginLockedMessage,
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

  let body: { oldPassword?: unknown; newPassword?: unknown };
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const oldPassword = String(body.oldPassword ?? "").trim();
  const newPassword = String(body.newPassword ?? "").trim();

  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "Mevcut ve yeni parola gerekli." }, { status: 400 });
  }
  // Parola politikası (tek kaynak lib/auth/passwordPolicy; min 6 = NEW_PASSWORD_MIN_LENGTH,
  // karmaşıklık zorunluluğu yok, bariz parola reddi). Mevcut parolalar etkilenmez.
  const pwPolicy = newPasswordPolicyMessage(newPassword, email ?? "");
  if (pwPolicy) {
    return NextResponse.json({ error: pwPolicy }, { status: 400 });
  }
  if (oldPassword === newPassword) {
    return NextResponse.json({ error: "Yeni parola mevcut parolayla aynı olamaz." }, { status: 400 });
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
    return NextResponse.json({ error: "Parola doğrulanamadı." }, { status: 500 });
  }
  // Doğrulanan satır bu oturumun kullanıcısı olmalı (e-posta çakışmasına karşı bağlama).
  if (verified.status !== "ok" || verified.row.id !== userId) {
    return NextResponse.json({ error: "Mevcut parola hatalı." }, { status: 400 });
  }

  // Yeni şifreyi hashle
  const { data: newHash, error: hashError } = await db.rpc("hash_password", {
    p_plain: newPassword,
  });

  if (hashError || !newHash) {
    return NextResponse.json({ error: "Parola işlenemedi." }, { status: 500 });
  }

  // Şifreyi güncelle
  const { error: updateError } = await db
    .from("users")
    .update({ password_hash: newHash as string })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: "Parola güncellenemedi." }, { status: 500 });
  }

  // Diğer oturumları kapat (mevcut hariç)
  // HTTPONLY H1–H4: guard'ın doğruladığı token (off modda = x-session-token, bugünkü gibi).
  const currentToken = guard.sessionToken ?? req.headers.get("x-session-token")?.trim() ?? "";
  const sessQuery = db
    .from("user_sessions")
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
      end_reason: "password_changed",
    })
    .eq("user_id", userId)
    .eq("is_active", true);

  const { error: revokeError } = currentToken
    ? await sessQuery.neq("session_token", currentToken)
    : await sessQuery;

  // Parola değişti; diğer oturumlar kapatılamadıysa bunu sessizce yutma (UI "diğer cihazlar
  // kapatılır" der) — istemciye bildir ki kullanıcı yeniden denesin / yöneticiye başvursun.
  if (revokeError) {
    console.error("[settings/change-password] revoke other sessions", revokeError);
    return NextResponse.json({ ok: true, sessions_revoked: false });
  }
  return NextResponse.json({ ok: true, sessions_revoked: true });
}
