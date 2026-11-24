/**
 * GİRİŞ GÜVENLİĞİ F2-E — hassas kurtarma işlemleri öncesi parola yeniden doğrulaması (yalnız server-side).
 * Ele geçirilmiş bir oturum çerezi/token'ı tek başına kurtarma kodu üretemez, e-posta değiştiremez,
 * Owner eşleştirme kodu alamaz, kurtarma yürütemez. Giriş ile AYNI kısıtlamalı doğrulama kullanılır
 * (auth_login_guarded: deneme sayacı / kilit ortak) → bu uç parola tahmini için yan kapı olamaz.
 */
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { hashLoginIp, loginLockedMessage } from "@/lib/auth/loginThrottle";

export type StepUpResult =
  | { ok: true; email: string; name: string | null }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function reconfirmPassword(db: SupabaseClient, req: NextRequest, userId: string, password: unknown): Promise<StepUpResult> {
  const pw = typeof password === "string" ? password : "";
  if (!pw.trim()) return { ok: false, status: 400, body: { code: "PASSWORD_REQUIRED", error: "Devam etmek için parolanızı girin." } };
  const { data } = await db.from("users").select("email, name, full_name").eq("id", userId).maybeSingle();
  const u = (data ?? {}) as { email?: unknown; name?: unknown; full_name?: unknown };
  const email = typeof u.email === "string" ? u.email : "";
  if (!email) return { ok: false, status: 400, body: { code: "NO_EMAIL", error: "Hesabınızda kayıtlı e-posta adresi yok." } };
  const verified = await verifyLoginCredentialsGuarded(db, email, pw, hashLoginIp(extractClientIp(req.headers)));
  if (verified.status === "locked") {
    return { ok: false, status: 429, body: { code: "LOCKED", error: loginLockedMessage(verified.retryAfterSeconds), retryAfter: verified.retryAfterSeconds } };
  }
  if (verified.status === "error") return { ok: false, status: 500, body: { code: "ERROR", error: "Parola doğrulanamadı." } };
  if (verified.status !== "ok" || String(verified.row.id) !== userId) {
    return { ok: false, status: 400, body: { code: "PASSWORD_WRONG", error: "Parola hatalı." } };
  }
  const name = (typeof u.full_name === "string" && u.full_name) || (typeof u.name === "string" ? u.name : null);
  return { ok: true, email, name };
}
