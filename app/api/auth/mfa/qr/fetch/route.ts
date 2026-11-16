import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { isDeviceNonce, qrFetchMessage } from "@/lib/auth/deviceSignature";
import { deviceRateLimited, isFreshTimestamp, loadDeviceRecordWithKey } from "@/lib/auth/deviceServer";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { summarizeUserAgent } from "@/lib/auth/userAgentSummary";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const INVALID = () => json({ code: "QR_INVALID", error: "Bu giriş isteği geçersiz veya süresi dolmuş." }, 404);

/**
 * POST /api/auth/mfa/qr/fetch — GİRİŞ GÜVENLİĞİ F2-C: telefon (güvenilir cihaz) QR'deki giriş
 * isteğini okur. İmza `YS-QR-FETCH-V1`. Yalnız AKTİF cihaz + challenge ile AYNI kullanıcı + doğru QR
 * nonce'u → 3 eşleştirme seçeneği + istek özeti. Diğer her durum aynı 404 (yanlış kullanıcının
 * telefonu, iptal edilmiş cihaz, kullanılmış/süresi dolmuş QR ayırt EDİLMEZ). Oturum AÇMAZ.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const qrNonce = body?.qrNonce;
    if (!isMfaChallengeId(challengeId) || !isDeviceNonce(qrNonce)) return INVALID();
    if (!isFreshTimestamp(body?.ts)) return json({ code: "BAD_TIMESTAMP" }, 400);
    const db = getServerDb();
    const limited = await deviceRateLimited(db, req, "mfa-qr-ip", 60, 10 * 60);
    if (limited) return NextResponse.json({ code: "RATE_LIMITED", retryAfter: limited }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited) } });
    const dev = await loadDeviceRecordWithKey(db, deviceId);
    if (!dev || dev.record.state !== "active") return INVALID();
    // v1.1: okuma yalnız varlık anahtarıyla (biyometri istemi yok); onay ayrıca kullanıcı doğrulamalı anahtar ister.
    if (!dev.verifyPresence(qrFetchMessage(challengeId, qrNonce, deviceId, body?.ts as number), body?.signature)) return json({ code: "BAD_SIGNATURE" }, 400);
    const { data, error } = await db.rpc("auth_qr_fetch", { p_challenge_id: challengeId, p_qr_nonce: qrNonce, p_device_id: deviceId });
    if (error) return json({ code: "ERROR" }, 500);
    const r = (data ?? {}) as { ok?: unknown; options?: unknown; user_agent?: unknown; created_at?: unknown; expires_at?: unknown };
    if (r.ok !== true || !Array.isArray(r.options)) return INVALID();
    return json({
      options: (r.options as unknown[]).map(String),
      browser: summarizeUserAgent(typeof r.user_agent === "string" ? r.user_agent : ""),
      city: null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }, 200);
  } catch {
    return json({ code: "ERROR" }, 500);
  }
}
