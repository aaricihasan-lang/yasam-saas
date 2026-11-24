import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { pickSessionCredential } from "@/lib/auth/sessionTransport";
import { resolveSessionExpiryPolicy } from "@/lib/auth/sessionSecurity";
import { deviceRateLimited } from "@/lib/auth/deviceServer";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * POST /api/auth/session/device-bind/begin — GİRİŞ GÜVENLİĞİ F2-J: Android uygulamasındaki YÖNETİCİ oturumu için cihaz
 * kanıtı nonce'u. Uzun (Android) yönetici oturum sınırları yalnız güvenilir cihazın asıl anahtarıyla imzalanmış
 * `YS-SESSION-BIND-V1` kanıtından sonra uygulanır (Owner kararı 17.11, B seçeneği); HTTP başlıkları kanıt değildir.
 * Kanıtsız Android yönetici oturumu web sınırlarındadır (24 sa / 2 sa). Kanıt 24 saatte bir yenilenir; bayat kanıtlı
 * oturum yalnız bu uçla yeniden kanıtlanabilir. Uzman / web oturumu → { required: false }.
 */
export async function POST(req: NextRequest) {
  try {
    const pick = pickSessionCredential(req);
    if (pick.kind !== "credential") return json({ code: "UNAUTHORIZED" }, 401);
    const db = getServerDb();
    const limited = await deviceRateLimited(db, req, "session-bind-begin-ip", 30, 10 * 60);
    if (limited) return NextResponse.json({ code: "RATE_LIMITED", retryAfter: limited }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited) } });
    const policy = resolveSessionExpiryPolicy();
    const { data, error } = await db.rpc("auth_session_device_bind_begin", {
      p_token: pick.token,
      p_idle_seconds: policy.expertIdleSeconds,
      p_admin_idle_seconds: policy.adminIdleSeconds,
      p_admin_absolute_seconds: policy.adminAbsoluteSeconds,
    });
    if (error) return json({ code: "ERROR" }, 500);
    const r = (data ?? {}) as { ok?: unknown; reason?: unknown; session_id?: unknown; nonce?: unknown; expires_in?: unknown; retry_after?: unknown };
    if (r.ok === true) return json({ required: true, sessionId: r.session_id, nonce: r.nonce, expiresIn: r.expires_in }, 200);
    if (r.reason === "not_required") return json({ required: false }, 200);
    if (r.reason === "rate_limited") {
      const ra = Number(r.retry_after) || 600;
      return NextResponse.json({ code: "RATE_LIMITED", retryAfter: ra }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(ra) } });
    }
    return json({ code: "UNAUTHORIZED" }, 401);
  } catch {
    return json({ code: "ERROR" }, 500);
  }
}
