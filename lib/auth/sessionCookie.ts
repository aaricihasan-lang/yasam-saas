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
 * GİRİŞ GÜVENLİĞİ F2-K (A3): resmî Android uygulamasının oturum TAŞIMASI.
 *   "header" (varsayılan): bugünkü 1.9.x / 2.0.0 davranışı — oturum anahtarı yanıt gövdesiyle verilir, WebView
 *             localStorage'da tutulur ve x-session-token başlığıyla gönderilir (JavaScript'e açıktır).
 *   "cookie" (opt-in): resmî uygulama da web gibi HttpOnly + Secure + SameSite=Strict __Host- çerezi kullanır; oturum
 *             anahtarı JavaScript'e HİÇ verilmez. Gerçek cihaz kabulünden sonra Owner kararıyla açılır.
 */
export function androidAppSessionTransport(env: Record<string, string | undefined> = process.env): "header" | "cookie" {
  return String(env.ANDROID_APP_SESSION_TRANSPORT ?? "").trim().toLowerCase() === "cookie" ? "cookie" : "header";
}

/**
 * Oturum anahtarı bu isteğe TOKEN yolu (gövde / x-session-token) ile mi verilir?
 * F2-K (A3): YALNIZ resmî uygulamanın iki sinyalli kanalı (WebView UA + uygulama paket başlığı; veya yerel UA soneki +
 * istemci ipucu) VE taşıma "header" ise. Tek başına `; wv)` (Instagram / Facebook vb. uygulama içi tarayıcılar) veya
 * tek başına istemci ipucu ARTIK token yolu açmaz → bu istemciler HttpOnly çerez alır. Normal tarayıcı JavaScript'i
 * User-Agent'ı değiştiremez; resmî kanalı taklit edemez. (Kanal bir güvenlik kanıtı değildir; uzun yönetici oturumu
 * F2-J cihaz kanıtına bağlıdır.)
 */
export function isAndroidAppRequest(headers: Headers, env: Record<string, string | undefined> = process.env): boolean {
  const ua = headers.get("user-agent") ?? "";
  const hint = headers.get(CLIENT_CHANNEL_HEADER);
  if (resolveClientChannel(ua, hint, headers.get(REQUESTED_WITH_HEADER)) !== "android_app") return false;
  return androidAppSessionTransport(env) === "header";
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
