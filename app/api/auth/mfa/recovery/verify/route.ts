import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { isAndroidAppRequest } from "@/lib/auth/sessionCookie";
import { checkSameOriginRequest } from "@/lib/security/csrf";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { hashMfaBinding, isMfaChallengeId, readMfaBinding, readMfaChallengeState } from "@/lib/auth/mfaChallenge";
import { hashRecoveryCode, normalizeRecoveryCode } from "@/lib/auth/recoveryCodes";
import { sendSecurityNotice } from "@/lib/auth/securityNotice";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const INVALID = "Giriş isteği geçersiz veya süresi dolmuş. Lütfen yeniden giriş yapın.";

/**
 * POST /api/auth/mfa/recovery/verify — GİRİŞ GÜVENLİĞİ F2-E: kurtarma kodu (veya Owner çevrimdışı kodu /
 * Owner'ın verdiği kurtarma bileti) ile ikinci doğrulama.
 * Body: { challengeId, code } → 200 { result: "verified", remaining } (oturum HENÜZ YOK; aynı istemci
 * /api/auth/mfa/complete ile oturumu mevcut auth_finalize_login yolundan açar).
 * 401 RECOVERY_WRONG (+attemptsLeft) / RECOVERY_LOCKED (5 yanlış → giriş isteği kalıcı red) / MFA_INVALID ·
 * 429 RATE_LIMITED (IP veya kullanıcı başına 24 saatte 10 yanlış).
 * Challenge yalnız parola doğrulandıktan sonra ve yalnız bu tarayıcıya bağlı olarak var olur → kod tek
 * başına (parolasız) hiçbir şey açamaz. Kod yanıtta / logda yer almaz.
 */
export async function POST(req: NextRequest) {
  const androidApp = isAndroidAppRequest(req.headers);
  try {
    if (!androidApp && !checkSameOriginRequest(req.headers).ok) return json({ code: "FORBIDDEN", error: "İstek kaynağı doğrulanamadı." }, 403);
    const body = (await req.json().catch(() => null)) as { challengeId?: unknown; code?: unknown } | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const binding = readMfaBinding(req, androidApp);
    if (!isMfaChallengeId(challengeId) || !binding) return json({ code: "MFA_INVALID", error: INVALID }, 401);

    const db = getServerDb();
    const hit = await hitDbRateLimit(db, rateLimitBucket("mfa-recovery-verify-ip", extractClientIp(req.headers)), 20, 15 * 60);
    if (!hit.allowed) return json({ code: "RATE_LIMITED", error: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.", retryAfter: hit.retryAfterSec }, 429);

    const bindingHash = hashMfaBinding(binding);
    const st = await readMfaChallengeState(db, challengeId, bindingHash);
    if (!st || st.state !== "pending" || !st.userId) return json({ code: "MFA_INVALID", error: INVALID }, 401);

    const code = normalizeRecoveryCode(body?.code);
    // Biçim dışı giriş de bir YANLIŞ denemedir (sayaç DB'de); geçersiz biçimli bir özet DB'ye gider ve
    // hiçbir kodla eşleşmez — böylece biçim hatası deneme sınırını atlatmanın yolu olamaz.
    const codeHash = hashRecoveryCode(st.userId, code ?? `INVALID:${String(body?.code ?? "").slice(0, 64)}`);
    const { data, error } = await db.rpc("auth_recovery_code_verify", {
      p_challenge_id: challengeId,
      p_browser_secret_hash: bindingHash,
      p_code_hash: codeHash,
    });
    if (error) return json({ code: "ERROR", error: "Kod doğrulanamadı." }, 500);
    const r = (data ?? {}) as { ok?: unknown; reason?: unknown; attempts_left?: unknown; kind?: unknown; remaining?: unknown; retry_after?: unknown };
    if (r.ok === true) {
      const { data: u } = await db.from("users").select("email, name, full_name").eq("id", st.userId).maybeSingle();
      const user = (u ?? {}) as { email?: unknown; name?: unknown; full_name?: unknown };
      await sendSecurityNotice(db, {
        userId: st.userId,
        to: typeof user.email === "string" ? user.email : null,
        name: (typeof user.full_name === "string" && user.full_name) || (typeof user.name === "string" ? user.name : null),
        kind: r.kind === "owner_offline" ? "owner_offline_login" : "recovery_login",
      });
      return json({ result: "verified", remaining: Number(r.remaining) || 0, kind: r.kind === "case_ticket" ? "ticket" : r.kind === "owner_offline" ? "owner_offline" : "code" }, 200);
    }
    switch (r.reason) {
      case "wrong": {
        const left = Number(r.attempts_left);
        return json({ code: "RECOVERY_WRONG", error: `Kurtarma kodu geçersiz veya daha önce kullanılmış.${Number.isFinite(left) ? ` Kalan deneme: ${left}.` : ""}`, attemptsLeft: Number.isFinite(left) ? left : null }, 401);
      }
      case "locked":
        return json({ code: "RECOVERY_LOCKED", error: "Kurtarma kodu 5 kez hatalı girildi. Güvenliğiniz için bu giriş isteği kapatıldı; lütfen yeniden giriş yapın." }, 401);
      case "rate_limited":
        return json({ code: "RATE_LIMITED", error: "Son 24 saatte çok fazla hatalı kurtarma kodu girildi. Lütfen daha sonra tekrar deneyin veya sistem yöneticinize başvurun.", retryAfter: Number(r.retry_after) || 3600 }, 429);
      default:
        return json({ code: "MFA_INVALID", error: INVALID }, 401);
    }
  } catch {
    return json({ code: "ERROR", error: "Kod doğrulanamadı." }, 500);
  }
}
