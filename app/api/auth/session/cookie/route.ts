import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { resolveActiveSession } from "@/lib/auth/sessionSecurity";
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

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * POST /api/auth/session/cookie — HTTPONLY H2+ BOOTSTRAP.
 *
 * Mevcut (zaten giriş yapmış) WEB oturumuna çıkış yaptırmadan `__Host-yasam_sid` kazandırır.
 *   - SESSION_COOKIE_MODE=off → 404 (uç fiilen yok).
 *   - Android isteği / android_app oturumu → 403 (cookie ASLA set edilmez).
 *   - Origin izinli origin olmalı (yoksa Sec-Fetch-Site: same-origin).
 *   - Kimlik YALNIZ `x-session-token` header'ı (cookie burada auth kaynağı DEĞİL) →
 *     touch_active_session (aktif/revoke/süre) ile doğrulanır.
 *   - canary: yalnız allowlist'teki kullanıcı.
 *   - Max-Age = oturumun kalan mutlak süresi (expires_at); expires_at yoksa set EDİLMEZ.
 *   - Token yanıt gövdesinde DÖNMEZ.
 */
export async function POST(req: NextRequest) {
  const cfg = getSessionCookieConfig();
  if (cfg.mode === "off") return json({ error: "Bulunamadı." }, 404);
  if (isAndroidAppRequest(req.headers)) return json({ error: "Bu istemci için desteklenmiyor." }, 403);
  if (!checkSameOriginRequest(req.headers).ok) return json({ error: "İstek kaynağı doğrulanamadı." }, 403);

  const token = req.headers.get("x-session-token")?.trim() ?? "";
  if (!token) return json({ error: "Oturum doğrulaması gerekli." }, 401);

  try {
    const db = getServerDb();
    const state = await resolveActiveSession(db, token);
    if (state.status === "unavailable") return json({ error: "Geçici olarak kullanılamıyor." }, 503);
    if (state.status !== "active") return json({ error: "Oturum geçersiz veya süresi dolmuş." }, 401);
    if (!isSessionCookieEligible(cfg, state.userId)) return json({ error: "Kapsam dışı." }, 403);

    const { data, error } = await db
      .from("user_sessions")
      .select("user_id, client_channel, expires_at, is_active")
      .eq("session_token", token)
      .maybeSingle();
    const row = data as { user_id?: unknown; client_channel?: unknown; expires_at?: unknown; is_active?: unknown } | null;
    if (error || !row || row.is_active !== true || String(row.user_id) !== state.userId) {
      return json({ error: "Oturum geçersiz veya süresi dolmuş." }, 401);
    }
    if (row.client_channel === "android_app") return json({ error: "Bu istemci için desteklenmiyor." }, 403);

    const maxAge = cookieMaxAgeFromExpiresAt(row.expires_at);
    if (maxAge === null) return json({ error: "Bu oturum için desteklenmiyor." }, 403);

    const response = json({ ok: true }, 200);
    setWebSessionCookie(response, token, maxAge);
    return response;
  } catch {
    // Ayrıntı/stack istemciye sızdırılmaz.
    return json({ error: "Oturum cookie'si oluşturulamadı." }, 500);
  }
}
