import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { activateMessage, isDeviceNonce } from "@/lib/auth/deviceSignature";
import { deviceRateLimited, isFreshTimestamp, loadDeviceRecordWithKey } from "@/lib/auth/deviceServer";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * POST /api/devices/activate — GİRİŞ GÜVENLİĞİ F2-C: Owner onayından (veya Owner bootstrap'ından)
 * SONRA cihazın kendi Keystore imzasıyla (`YS-ACTIVATE-V1`) aktifleşmesi. Owner onayı tek başına
 * cihazı güvenilir yapmaz; bu uç da OTURUM AÇMAZ.
 * Body: { deviceId, nonce, ts, signature } → 200 { state: "active" } · 400 · 404 DEVICE_INVALID · 409 · 429
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const nonce = body?.nonce;
    if (!isDeviceNonce(nonce)) return json({ code: "BAD_REQUEST" }, 400);
    if (!isFreshTimestamp(body?.ts)) return json({ code: "BAD_TIMESTAMP" }, 400);
    const db = getServerDb();
    const limited = await deviceRateLimited(db, req, "device-activate-ip", 20, 15 * 60);
    if (limited) return NextResponse.json({ code: "RATE_LIMITED", retryAfter: limited }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited) } });
    const dev = await loadDeviceRecordWithKey(db, deviceId);
    if (!dev || dev.record.state !== "owner_approved") return json({ code: "DEVICE_INVALID" }, 404);
    if (!dev.verify(activateMessage(deviceId, nonce, body?.ts as number), body?.signature)) return json({ code: "BAD_SIGNATURE" }, 400);
    const { data, error } = await db.rpc("auth_device_activate", { p_device_id: deviceId, p_nonce: nonce });
    if (error) return json({ code: "ERROR" }, 500);
    const r = (data ?? {}) as { ok?: unknown; reason?: unknown };
    if (r.ok === true) return json({ state: "active" }, 200);
    if (r.reason === "device_limit") return json({ code: "DEVICE_LIMIT" }, 409);
    if (r.reason === "expired") return json({ code: "EXPIRED" }, 409);
    return json({ code: "DEVICE_INVALID" }, 404);
  } catch {
    return json({ code: "ERROR" }, 500);
  }
}
