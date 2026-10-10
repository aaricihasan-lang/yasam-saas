/**
 * HTTPONLY WEB SESSION (H1–H4) — web oturum cookie'si + özellik bayrağı (yalnız server).
 *
 * Cookie: `__Host-yasam_sid` = MEVCUT opak oturum token'ı (user_sessions.session_token).
 *   - HttpOnly · Secure · SameSite=Strict · Path=/ · Domain YOK (`__Host-` öneki bunu zorunlu
 *     kılar; alt alan adından cookie enjeksiyonu engellenir).
 *   - Max-Age = oturumun kalan MUTLAK süresi (expires_at). expires_at yoksa (Android kalıcı
 *     oturum) cookie ASLA set edilmez.
 *   - Cookie tek başına geçerlilik SAĞLAMAZ: her istek touch_active_session RPC'sinden geçer
 *     (revoke/süre/aktiflik DB'de, tek doğru kaynak).
 *   - Admin kabuk cookie'si (`yasam_admin_session`) AYRIDIR ve değişmez.
 *
 * Bayrak: SESSION_COOKIE_MODE = off | canary | shadow | primary
 *   - eksik/geçersiz → off (güvenli varsayılan). off = bugünkü sistem birebir.
 *   - canary  : cookie yalnız SESSION_COOKIE_CANARY_USER_IDS listesindeki web kullanıcılarına;
 *               auth kaynağı DEĞİL (yalnız header ile tutarlılık doğrulaması).
 *   - shadow  : cookie tüm web kullanıcılarına; auth kaynağı DEĞİL.
 *   - primary : cookie birincil auth kaynağı, header geri dönüş (bkz. sessionTransport).
 *   - cookie_only (H5/H6) bu sürümde YOK → off sayılır.
 * Allowlist yalnız server env'i (NEXT_PUBLIC_ DEĞİL); istemci paketine girmez.
 *
 * Cookie değeri ASLA loglanmaz, URL'ye/yanıt gövdesine konmaz.
 */
import type { WebSessionTransport } from "@/lib/auth/sessionTransportFlag";
import type { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_CHANNEL_HEADER,
  REQUESTED_WITH_HEADER,
  isAndroidChannelHint,
  resolveClientChannel,
} from "@/lib/auth/clientChannel";

export const WEB_SESSION_COOKIE = "__Host-yasam_sid";

export const SESSION_COOKIE_MODES = ["off", "canary", "shadow", "primary"] as const;
export type SessionCookieMode = (typeof SESSION_COOKIE_MODES)[number];

/** Cookie Max-Age üst sınırı: uzman mutlak oturum süresi (30 gün). */
export const WEB_SESSION_COOKIE_MAX_AGE_CAP = 30 * 24 * 60 * 60;

const TOKEN_RE = /^[A-Za-z0-9._-]{16,200}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = Record<string, string | undefined>;

export function readSessionCookieMode(env: Env = process.env): SessionCookieMode {
  const raw = String(env.SESSION_COOKIE_MODE ?? "").trim().toLowerCase();
  return (SESSION_COOKIE_MODES as readonly string[]).includes(raw) ? (raw as SessionCookieMode) : "off";
}

/** Canary allowlist: virgüllü kullanıcı UUID'leri; geçersiz öğeler yok sayılır. */
export function readSessionCookieCanaryUserIds(env: Env = process.env): ReadonlySet<string> {
  return new Set(
    String(env.SESSION_COOKIE_CANARY_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => UUID_RE.test(s)),
  );
}

export type SessionCookieConfig = {
  mode: SessionCookieMode;
  canaryUserIds: ReadonlySet<string>;
};

export function getSessionCookieConfig(env: Env = process.env): SessionCookieConfig {
  return { mode: readSessionCookieMode(env), canaryUserIds: readSessionCookieCanaryUserIds(env) };
}

/**
 * HTTPONLY H6a — web isteklerinin oturum taşıması (bkz. lib/auth/sessionTransportFlag.ts).
 * "cookie" YALNIZ mod=primary VE kill-switch (SESSION_COOKIE_WEB_HEADER=on) kapalıyken; aksi "header".
 */
export function readWebSessionTransport(env: Env = process.env): WebSessionTransport {
  if (readSessionCookieMode(env) !== "primary") return "header";
  return String(env.SESSION_COOKIE_WEB_HEADER ?? "").trim().toLowerCase() === "on" ? "header" : "cookie";
}

/** Bu kullanıcıya web session cookie'si verilebilir mi? (kanal kontrolü ayrıca yapılır) */
export function isSessionCookieEligible(cfg: SessionCookieConfig, userId: string | null | undefined): boolean {
  if (cfg.mode === "off") return false;
  if (cfg.mode === "canary") return !!userId && cfg.canaryUserIds.has(String(userId).toLowerCase());
  return true;
}

/**
 * Android uygulama isteği mi? Cookie mekanizmasından GENİŞ dışlama (güvenli yön): resmi
 * kanal sınıflandırması VEYA herhangi bir Android WebView UA'sı VEYA Android istemci ipucu.
 * Dışlanan istek bugünkü header yolunda kalır; yanlış pozitif yalnız cookie'yi devre dışı bırakır.
 */
export function isAndroidAppRequest(headers: Headers): boolean {
  const ua = headers.get("user-agent") ?? "";
  const hint = headers.get(CLIENT_CHANNEL_HEADER);
  if (resolveClientChannel(ua, hint, headers.get(REQUESTED_WITH_HEADER)) === "android_app") return true;
  if (/;\s*wv\)/.test(ua)) return true;
  return isAndroidChannelHint(hint);
}

/** İstekteki web session cookie değeri (biçim dışı → ""). */
export function readWebSessionCookie(req: NextRequest): string {
  const v = req.cookies.get(WEB_SESSION_COOKIE)?.value?.trim() ?? "";
  return TOKEN_RE.test(v) ? v : "";
}

export function hasWebSessionCookie(req: NextRequest): boolean {
  return req.cookies.has(WEB_SESSION_COOKIE);
}

/** expires_at → Max-Age (sn). Yok/geçmiş → null (cookie set EDİLMEZ). Üst sınır 30 gün. */
export function cookieMaxAgeFromExpiresAt(expiresAt: unknown, nowMs: number = Date.now()): number | null {
  if (typeof expiresAt !== "string" || !expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  const sec = Math.floor((t - nowMs) / 1000);
  if (sec <= 0) return null;
  return Math.min(sec, WEB_SESSION_COOKIE_MAX_AGE_CAP);
}

export function webSessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function setWebSessionCookie(res: NextResponse, token: string, maxAgeSec: number): void {
  res.cookies.set(WEB_SESSION_COOKIE, token, webSessionCookieOptions(maxAgeSec));
}

export function clearWebSessionCookie(res: NextResponse): void {
  res.cookies.set(WEB_SESSION_COOKIE, "", webSessionCookieOptions(0));
}
