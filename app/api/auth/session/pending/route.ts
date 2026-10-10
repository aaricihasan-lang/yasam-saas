import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import {
  cookieMaxAgeFromExpiresAt,
  getSessionCookieConfig,
  isAndroidAppRequest,
  isSessionCookieEligible,
  setWebSessionCookie,
} from "@/lib/auth/sessionCookie";
import { checkSameOriginRequest } from "@/lib/security/csrf";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/auth/session/pending — OTURUM MODELİ v2.
 *
 * Onay bekleyen admin web girişinin cihazı YALNIZ KENDİ durumunu sorgular (x-session-token).
 * Döner: { state: "pending" | "approved" | "denied" | "expired" | "invalid", pendingExpiresAt? }
 * Onaylandığında, istemcinin standart giriş akışını tamamlayabilmesi için login yanıtıyla AYNI
 * gating satırı (id,email,name,role,status,tenant_id,active,approval_status) döner. Pending iken
 * hiçbir kullanıcı/modül verisi dönmez; token hiçbir korumalı uçta geçerli değildir.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-session-token")?.trim() ?? "";
  if (!token) return NextResponse.json({ state: "invalid" }, { status: 400, headers: NO_STORE });
  try {
    const db = getServerDb();
    const { data, error } = await db.rpc("session_pending_status", { p_token: token });
    if (error) return NextResponse.json({ state: "error" }, { status: 500, headers: NO_STORE });
    const res = (data ?? {}) as { state?: string; user_id?: string; pending_expires_at?: string };
    const state = ["pending", "approved", "denied", "expired"].includes(String(res.state)) ? String(res.state) : "invalid";
    if (state === "approved" && res.user_id) {
      const { data: u } = await db
        .from("users")
        .select("id, email, name, role, status, tenant_id, active, approval_status")
        .eq("id", res.user_id)
        .eq("active", true)
        .maybeSingle();
      if (!u) return NextResponse.json({ state: "invalid" }, { status: 200, headers: NO_STORE });
      const response = NextResponse.json({ state, user: u }, { status: 200, headers: NO_STORE });
      // HTTPONLY H5: onaylanan WEB oturumunun HttpOnly cookie'si sunucuda yazılır (login yanıtıyla
      // aynı kurallar: mod≠off, uygun kullanıcı, Android ASLA, süreli oturum). Token gövdede DEĞİL;
      // istemci zaten elindeki pending token'ı kullanır (H5'te localStorage yolu aynen sürer).
      const cookieCfg = getSessionCookieConfig();
      if (cookieCfg.mode !== "off" && !isAndroidAppRequest(req.headers) && isSessionCookieEligible(cookieCfg, String(res.user_id))) {
        try {
          const { data: row } = await db
            .from("user_sessions")
            .select("user_id, client_channel, expires_at, is_active")
            .eq("session_token", token)
            .maybeSingle();
          const r = row as { user_id?: unknown; client_channel?: unknown; expires_at?: unknown; is_active?: unknown } | null;
          const maxAge = cookieMaxAgeFromExpiresAt(r?.expires_at);
          if (r && r.is_active === true && String(r.user_id) === String(res.user_id) && r.client_channel !== "android_app" && maxAge !== null) {
            setWebSessionCookie(response, token, maxAge);
          }
        } catch {
          /* cookie best-effort; header yolu (H5) çalışmaya devam eder */
        }
      }
      return response;
    }
    return NextResponse.json(
      state === "pending" ? { state, pendingExpiresAt: res.pending_expires_at ?? null } : { state },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ state: "error" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * DELETE /api/auth/session/pending — "Beklemeyi iptal et".
 * YALNIZ bu token'a ait, hâlâ bekleyen (is_active=false, ended_at NULL) kaydı kapatır → admin web
 * slotu hemen boşalır. Aktif/onaylanmış oturumlara DOKUNMAZ (onaylanmışsa normal çıkış kullanılır).
 * İdempotent; her zaman 200 (token varlığı hakkında bilgi sızdırmaz).
 */
export async function DELETE(req: NextRequest) {
  // HTTPONLY H5: cookie modu açıkken (off DEĞİL) web isteğinde Origin / Sec-Fetch-Site doğrulaması.
  if (
    getSessionCookieConfig().mode !== "off" &&
    !isAndroidAppRequest(req.headers) &&
    !checkSameOriginRequest(req.headers).ok
  ) {
    return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403, headers: NO_STORE });
  }
  const token = req.headers.get("x-session-token")?.trim() ?? "";
  if (token) {
    try {
      await getServerDb()
        .from("user_sessions")
        .update({ ended_at: new Date().toISOString(), end_reason: "pending_cancelled" })
        .eq("session_token", token)
        .eq("session_state", "pending_approval")
        .eq("is_active", false)
        .is("ended_at", null);
    } catch {
      /* iptal istemciyi bloklamaz; bekleyen kayıt 10 dk içinde zaten düşer */
    }
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
