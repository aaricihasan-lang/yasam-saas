import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { isDeviceNonce, qrDecideMessage } from "@/lib/auth/deviceSignature";
import { deviceRateLimited, isFreshTimestamp, loadDeviceRecordWithKey } from "@/lib/auth/deviceServer";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const INVALID = () => json({ code: "QR_INVALID", error: "Bu giriş isteği geçersiz veya süresi dolmuş." }, 404);

/**
 * POST /api/auth/mfa/qr/decide — GİRİŞ GÜVENLİĞİ F2-C: telefonda Onayla / Reddet (biyometrik +
 * Keystore imzası `YS-QR-DECIDE-V1`). Onay yalnız doğru eşleştirme kodu ile challenge'ı "verified"
 * yapar; oturumu YALNIZ başlatan tarayıcı (bağlama çerezi) /api/auth/mfa/complete ile açar.
 * Ret veya yanlış kod → challenge kalıcı reddedilir. Tek kullanımlık (DB satır kilidi).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const qrNonce = body?.qrNonce;
    const decision = body?.decision === "approve" || body?.decision === "deny" ? body.decision : null;
    const matchCode = typeof body?.matchCode === "string" ? body.matchCode : "";
    if (!isMfaChallengeId(challengeId) || !isDeviceNonce(qrNonce) || !decision) return INVALID();
    if (decision === "approve" ? !/^[0-9]{2}$/.test(matchCode) : matchCode !== "") return json({ code: "BAD_REQUEST" }, 400);
    if (!isFreshTimestamp(body?.ts)) return json({ code: "BAD_TIMESTAMP" }, 400);
    const db = getServerDb();
    const limited = await deviceRateLimited(db, req, "mfa-qr-ip", 60, 10 * 60);
    if (limited) return NextResponse.json({ code: "RATE_LIMITED", retryAfter: limited }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited) } });
    const dev = await loadDeviceRecordWithKey(db, deviceId);
    if (!dev || dev.record.state !== "active") return INVALID();
    if (!dev.verify(qrDecideMessage(challengeId, qrNonce, deviceId, decision, matchCode, body?.ts as number), body?.signature)) {
      return json({ code: "BAD_SIGNATURE" }, 400);
    }
    const { data, error } = await db.rpc("auth_qr_decide", {
      p_challenge_id: challengeId, p_qr_nonce: qrNonce, p_device_id: deviceId, p_decision: decision,
      p_match_code: decision === "approve" ? matchCode : null,
    });
    if (error) return json({ code: "ERROR" }, 500);
    const r = (data ?? {}) as { ok?: unknown; result?: unknown };
    if (r.ok !== true) return INVALID();
    return json({ result: r.result === "approved" ? "approved" : "denied" }, 200);
  } catch {
    return json({ code: "ERROR" }, 500);
  }
}
