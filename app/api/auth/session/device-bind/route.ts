import { NextRequest, NextResponse } from "next/server";
import { requestTranslator, type ServerTranslator } from "@/lib/i18n/serverMessages";
import { getServerDb } from "@/lib/supabase-server";
import { isSessionBindNonce, sessionBindMessage } from "@/lib/auth/deviceSignature";
import { deviceRateLimited, isFreshTimestamp, loadDeviceRecordWithKey } from "@/lib/auth/deviceServer";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { resolveSessionExpiryPolicy } from "@/lib/auth/sessionSecurity";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const INVALID = (te: ServerTranslator) => json({ code: "BIND_INVALID", error: te("deviceBind.invalid") }, 401);

/**
 * POST /api/auth/session/device-bind — GİRİŞ GÜVENLİĞİ F2-J: telefon (yerel uygulama, oturum anahtarı OLMADAN) cihaz
 * kanıtını gönderir: { deviceId, sessionId, nonce, ts, signature }. İmza cihazın ASIL anahtarıyla
 * `YS-SESSION-BIND-V1` (her kullanımda biyometri / cihaz kilidi); varlık anahtarı kabul edilmez. Nonce tek kullanımlık,
 * 120 sn ve oturuma bağlıdır; cihaz etkin ve oturum sahibine ait olmalıdır (DB satır kilitleri).
 */
export async function POST(req: NextRequest) {
  const te = requestTranslator(req, "auth.server");
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const nonce = body?.nonce;
    if (!isMfaChallengeId(deviceId) || !isMfaChallengeId(sessionId) || !isSessionBindNonce(nonce)) return INVALID(te);
    if (!isFreshTimestamp(body?.ts)) return json({ code: "BAD_TIMESTAMP" }, 400);
    const db = getServerDb();
    const limited = await deviceRateLimited(db, req, "session-bind-ip", 30, 10 * 60);
    if (limited) return NextResponse.json({ code: "RATE_LIMITED", retryAfter: limited }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited) } });
    const dev = await loadDeviceRecordWithKey(db, deviceId);
    if (!dev || dev.record.state !== "active") return INVALID(te);
    if (!dev.verify(sessionBindMessage(deviceId, nonce, sessionId, body?.ts as number), body?.signature)) {
      return json({ code: "BAD_SIGNATURE" }, 400);
    }
    const policy = resolveSessionExpiryPolicy();
    const { data, error } = await db.rpc("auth_session_device_bind", {
      p_session_id: sessionId, p_nonce: nonce, p_device_id: deviceId,
      p_idle_seconds: policy.expertIdleSeconds, p_admin_idle_seconds: policy.adminIdleSeconds,
      p_admin_absolute_seconds: policy.adminAbsoluteSeconds,
    });
    if (error) return json({ code: "ERROR" }, 500);
    const r = (data ?? {}) as { ok?: unknown; proof_valid_until?: unknown };
    if (r.ok !== true) return INVALID(te);
    return json({ ok: true, proofValidUntil: r.proof_valid_until }, 200);
  } catch {
    return json({ code: "ERROR" }, 500);
  }
}
