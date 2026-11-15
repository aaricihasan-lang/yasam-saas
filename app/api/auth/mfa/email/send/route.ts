import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { isAndroidAppRequest } from "@/lib/auth/sessionCookie";
import { checkSameOriginRequest } from "@/lib/security/csrf";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { hashMfaBinding, isMfaChallengeId, isMfaTestAccount, readMfaBinding, readMfaChallengeState, resolveUserMfaMethods } from "@/lib/auth/mfaChallenge";
import { emailOtpConfigured, emailOtpRoleAllowed, issueAndSendOtp } from "@/lib/auth/emailOtp";
import { normalizeRole } from "@/lib/auth/approvalGate";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number, extra?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...(extra ?? {}) } });

const MESSAGES: Record<string, [number, string]> = {
  cooldown: [429, "Yeni kod istemeden önce biraz bekleyin."],
  too_many: [429, "Bu giriş için en fazla 3 kod gönderilebilir. Lütfen yeniden giriş yapın veya QR ile onaylayın."],
  rate_limited: [429, "Çok fazla kod istendi. Lütfen daha sonra tekrar deneyin veya QR ile onaylayın."],
  quota_exhausted: [503, "E-posta ile doğrulama şu anda kullanılamıyor. Lütfen QR ile onaylayın veya daha sonra tekrar deneyin."],
  send_failed: [503, "Kod e-postayla gönderilemedi. Lütfen QR ile onaylayın veya biraz sonra tekrar deneyin."],
  not_configured: [503, "E-posta ile doğrulama şu anda kullanılamıyor."],
  email_unverified: [403, "E-posta adresiniz henüz doğrulanmadı; bu yöntem kullanılamaz."],
  invalid: [401, "Giriş isteği geçersiz veya süresi dolmuş. Lütfen yeniden giriş yapın."],
};

/**
 * POST /api/auth/mfa/email/send — GİRİŞ GÜVENLİĞİ F2-D: bekleyen giriş challenge'ı için e-posta kodu.
 * Yalnız challenge'ı başlatan istemci (bağlama çerezi / Android başlığı) isteyebilir; kod yalnız
 * kullanıcının DOĞRULANMIŞ adresine gider. Gönderilemezse MFA atlanmaz (503; kullanıcı QR'ye geçebilir).
 * Body: { challengeId } → 200 { sent: true, expiresAt } · 401/403/429/503
 */
export async function POST(req: NextRequest) {
  const androidApp = isAndroidAppRequest(req.headers);
  try {
    if (!androidApp && !checkSameOriginRequest(req.headers).ok) return json({ code: "FORBIDDEN", error: "İstek kaynağı doğrulanamadı." }, 403);
    const body = (await req.json().catch(() => null)) as { challengeId?: unknown } | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const binding = readMfaBinding(req, androidApp);
    if (!isMfaChallengeId(challengeId) || !binding) return json({ code: "MFA_INVALID", error: MESSAGES.invalid[1] }, 401);

    const db = getServerDb();
    const hit = await hitDbRateLimit(db, rateLimitBucket("mfa-email-send-ip", extractClientIp(req.headers)), 20, 60 * 60);
    if (!hit.allowed) return json({ code: "RATE_LIMITED", error: MESSAGES.rate_limited[1] }, 429, { "Retry-After": String(Math.max(1, hit.retryAfterSec)) });

    const st = await readMfaChallengeState(db, challengeId, hashMfaBinding(binding));
    if (!st || st.state !== "pending" || !st.userId) return json({ code: "MFA_INVALID", error: MESSAGES.invalid[1] }, 401);

    const { data: u } = await db.from("users").select("id, email, name, full_name, role, active").eq("id", st.userId).maybeSingle();
    const row = u as { id?: unknown; email?: unknown; name?: unknown; full_name?: unknown; role?: unknown; active?: unknown } | null;
    if (!row || row.active !== true || typeof row.email !== "string") return json({ code: "MFA_INVALID", error: MESSAGES.invalid[1] }, 401);
    const role = normalizeRole(row.role);
    const methods = await resolveUserMfaMethods(db, {
      userId: st.userId, role, isTestAccount: await isMfaTestAccount(db, st.userId),
      emailConfigured: emailOtpConfigured(), emailRoleAllowed: emailOtpRoleAllowed(role),
    });
    if (!methods.includes("email_otp")) return json({ code: "METHOD_UNAVAILABLE", error: MESSAGES.not_configured[1] }, 403);

    const out = await issueAndSendOtp(db, {
      userId: st.userId, email: row.email, name: (typeof row.full_name === "string" && row.full_name) || (typeof row.name === "string" ? row.name : null),
      purpose: "login", challengeId,
    });
    if (out.ok) return json({ sent: true, expiresAt: out.expiresAt }, 200);
    const m = MESSAGES[out.code] ?? [500, "Kod gönderilemedi."];
    return json({ code: out.code.toUpperCase(), error: m[1], ...(out.retryAfter ? { retryAfter: out.retryAfter } : {}) }, m[0],
      out.retryAfter ? { "Retry-After": String(out.retryAfter) } : undefined);
  } catch {
    return json({ code: "ERROR", error: "Kod gönderilemedi." }, 500);
  }
}
