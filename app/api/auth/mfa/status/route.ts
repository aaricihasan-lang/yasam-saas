import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { isAndroidAppRequest } from "@/lib/auth/sessionCookie";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { hashMfaBinding, isMfaChallengeId, readMfaBinding, readMfaChallengeState } from "@/lib/auth/mfaChallenge";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** Durum sorgusu (polling) IP başına üst sınırı — 2 sn aralıkla 5 dk'lık challenge ≈ 150 istek. */
const STATUS_IP_LIMIT = 300;
const STATUS_IP_WINDOW_SEC = 10 * 60;

/**
 * GET /api/auth/mfa/status?challenge=<id> — GİRİŞ GÜVENLİĞİ F2-B.
 *
 * Bekleyen MFA challenge'ının durumunu YALNIZ onu başlatan istemciye söyler (web: HttpOnly
 * `__Host-yasam_mfa` çerezi; Android: `x-yasam-mfa-binding` başlığı). Kullanıcı/hesap verisi DÖNMEZ;
 * bağlama uyuşmazsa "invalid" (challenge varlığı sızmaz). Oturum oluşturmaz.
 * Döner: { state: "pending" | "verified" | "consumed" | "expired" | "denied" | "invalid", expiresAt? }
 */
export async function GET(req: NextRequest) {
  const challengeId = req.nextUrl.searchParams.get("challenge")?.trim() ?? "";
  const binding = readMfaBinding(req, isAndroidAppRequest(req.headers));
  if (!isMfaChallengeId(challengeId) || !binding) {
    return NextResponse.json({ state: "invalid" }, { status: 200, headers: NO_STORE });
  }
  try {
    const db = getServerDb();
    const hit = await hitDbRateLimit(db, rateLimitBucket("mfa-status-ip", extractClientIp(req.headers)), STATUS_IP_LIMIT, STATUS_IP_WINDOW_SEC);
    if (!hit.allowed) {
      return NextResponse.json(
        { state: "rate_limited", retryAfter: hit.retryAfterSec },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.max(1, hit.retryAfterSec)) } },
      );
    }
    const st = await readMfaChallengeState(db, challengeId, hashMfaBinding(binding));
    if (!st) return NextResponse.json({ state: "error" }, { status: 503, headers: NO_STORE });
    return NextResponse.json(
      st.state === "pending" || st.state === "verified" ? { state: st.state, expiresAt: st.expiresAt } : { state: st.state },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ state: "error" }, { status: 503, headers: NO_STORE });
  }
}
