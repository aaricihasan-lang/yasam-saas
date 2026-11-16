import { NextRequest, NextResponse } from "next/server";
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
  const androidApp = isAndroidAppRequest(req.headers);
  try {
    if (!androidApp && !checkSameOriginRequest(req.headers).ok) return json({ code: "FORBIDDEN", error: "İstek kaynağı doğrulanamadı." }, 403);
    const body = (await req.json().catch(() => null)) as { challengeId?: unknown; code?: unknown } | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
    const binding = readMfaBinding(req, androidApp);
    if (!isMfaChallengeId(challengeId) || !binding) return json({ code: "MFA_INVALID", error: "Giriş isteği geçersiz. Lütfen yeniden giriş yapın." }, 401);

    const db = getServerDb();
    const hit = await hitDbRateLimit(db, rateLimitBucket("mfa-email-verify-ip", extractClientIp(req.headers)), 30, 15 * 60);
    if (!hit.allowed) return json({ code: "RATE_LIMITED", error: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin." }, 429);

    const st = await readMfaChallengeState(db, challengeId, hashMfaBinding(binding));
    if (!st || st.state !== "pending" || !st.userId) return json({ code: "MFA_INVALID", error: "Giriş isteği geçersiz veya süresi dolmuş. Lütfen yeniden giriş yapın." }, 401);

    const r = await verifyOtp(db, { userId: st.userId, purpose: "login", challengeId, code });
    if (r.ok) return json({ result: "verified" }, 200);
    switch (r.code) {
      case "wrong":
        return json({ code: "OTP_WRONG", error: `Kod hatalı.${r.attemptsLeft !== undefined ? ` Kalan deneme: ${r.attemptsLeft}.` : ""}`, attemptsLeft: r.attemptsLeft ?? null }, 401);
      case "expired":
        return json({ code: "OTP_EXPIRED", error: "Kodun süresi doldu. Yeni kod isteyin." }, 401);
      case "no_code":
        return json({ code: "OTP_NONE", error: "Geçerli bir kod yok. Yeni kod isteyin." }, 401);
      case "locked":
        return json({ code: "OTP_LOCKED", error: "Kod 5 kez hatalı girildi. Güvenliğiniz için bu giriş isteği kapatıldı; lütfen yeniden giriş yapın." }, 401);
      case "not_configured":
        return json({ code: "METHOD_UNAVAILABLE", error: "E-posta ile doğrulama şu anda kullanılamıyor." }, 503);
      default:
        return json({ code: "MFA_INVALID", error: "Giriş isteği geçersiz veya süresi dolmuş. Lütfen yeniden giriş yapın." }, 401);
    }
  } catch {
    return json({ code: "ERROR", error: "Kod doğrulanamadı." }, 500);
  }
}
