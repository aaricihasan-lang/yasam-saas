import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/devices/status?deviceId=<uuid> — GİRİŞ GÜVENLİĞİ F2-C: eşleştirme durumu (telefon yoklar).
 * owner_approved iken aktivasyon nonce'u döner; nonce tek başına işe yaramaz (cihaz imzası gerekir,
 * /api/devices/activate). Kullanıcı/hesap bilgisi DÖNMEZ.
 */
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim() ?? "";
  if (!isMfaChallengeId(deviceId)) return NextResponse.json({ state: "invalid" }, { status: 200, headers: NO_STORE });
  try {
    const db = getServerDb();
    const hit = await hitDbRateLimit(db, rateLimitBucket("device-status-ip", extractClientIp(req.headers)), 240, 10 * 60);
    if (!hit.allowed) return NextResponse.json({ state: "rate_limited" }, { status: 429, headers: NO_STORE });
    const { data, error } = await db.rpc("auth_device_status", { p_device_id: deviceId });
    if (error) return NextResponse.json({ state: "error" }, { status: 503, headers: NO_STORE });
    const r = (data ?? {}) as { state?: unknown; activation_nonce?: unknown; activation_expires_at?: unknown };
    const state = typeof r.state === "string" ? r.state : "invalid";
    return NextResponse.json(
      state === "owner_approved"
        ? { state, activationNonce: r.activation_nonce, activationExpiresAt: r.activation_expires_at }
        : { state },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ state: "error" }, { status: 503, headers: NO_STORE });
  }
}
