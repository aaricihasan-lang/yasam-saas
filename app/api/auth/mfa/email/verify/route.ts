import { NextRequest, NextResponse } from "next/server";
import { requestTranslator } from "@/lib/i18n/serverMessages";
import { getServerDb } from "@/lib/supabase-server";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { isAndroidAppRequest } from "@/lib/auth/sessionCookie";
import { checkSameOriginRequest } from "@/lib/security/csrf";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { hashMfaBinding, isMfaChallengeId, readMfaBinding, readMfaChallengeState } from "@/lib/auth/mfaChallenge";
import { verifyOtp } from "@/lib/auth/emailOtp";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * POST /api/auth/mfa/email/verify — GİRİŞ GÜVENLİĞİ F2-D: e-posta kodu doğrulaması.
 * Body: { challengeId, code } → 200 { result: "verified" } (oturum HENÜZ YOK; aynı istemci
 * /api/auth/mfa/complete ile oturumu açar) · 401 OTP_WRONG (+attemptsLeft) / OTP_EXPIRED / OTP_LOCKED
 * (5 yanlış → kod kilitli + giriş isteği kalıcı red) / MFA_INVALID.
 * Kod challenge'a ve kullanıcıya bağlı (HMAC kapsamı); başka challenge'da geçersiz. Atomik, tek kullanım.
 */
export async function POST(req: NextRequest) {
  const te = requestTranslator(req, "auth.server");
  const androidApp = isAndroidAppRequest(req.headers);
  try {
    if (!androidApp && !checkSameOriginRequest(req.headers).ok) return json({ code: "FORBIDDEN", error: te("common.forbiddenOrigin") }, 403);
    const body = (await req.json().catch(() => null)) as { challengeId?: unknown; code?: unknown } | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
    const binding = readMfaBinding(req, androidApp);
    if (!isMfaChallengeId(challengeId) || !binding) return json({ code: "MFA_INVALID", error: te("emailVerify.invalid") }, 401);

    const db = getServerDb();
    const hit = await hitDbRateLimit(db, rateLimitBucket("mfa-email-verify-ip", extractClientIp(req.headers)), 30, 15 * 60);
    if (!hit.allowed) return json({ code: "RATE_LIMITED", error: te("common.tooManyAttempts") }, 429);

    const st = await readMfaChallengeState(db, challengeId, hashMfaBinding(binding));
    if (!st || st.state !== "pending" || !st.userId) return json({ code: "MFA_INVALID", error: te("common.invalidOrExpiredRelogin") }, 401);

    const r = await verifyOtp(db, { userId: st.userId, purpose: "login", challengeId, code });
    if (r.ok) return json({ result: "verified" }, 200);
    switch (r.code) {
      case "wrong":
        return json({ code: "OTP_WRONG", error: `${te("common.codeWrong")}${r.attemptsLeft !== undefined ? te("common.attemptsLeft", { count: String(r.attemptsLeft) }) : ""}`, attemptsLeft: r.attemptsLeft ?? null }, 401);
      case "expired":
        return json({ code: "OTP_EXPIRED", error: te("emailVerify.expired") }, 401);
      case "no_code":
        return json({ code: "OTP_NONE", error: te("emailVerify.none") }, 401);
      case "locked":
        return json({ code: "OTP_LOCKED", error: te("emailVerify.locked") }, 401);
      case "not_configured":
        return json({ code: "METHOD_UNAVAILABLE", error: te("common.emailMethodUnavailable") }, 503);
      default:
        return json({ code: "MFA_INVALID", error: te("common.invalidOrExpiredRelogin") }, 401);
    }
  } catch {
    return json({ code: "ERROR", error: te("common.codeVerifyFailed") }, 500);
  }
}
