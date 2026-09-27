/**
 * FAZ1 FINAL HARDENING — PAKET AUTH: giriş kısıtlama (throttle) yardımcıları.
 *
 * Sayaçlar KALICI ve instance'lar arası ortaktır (DB: public.auth_login_throttle, yalnız
 * `auth_login_guarded` RPC yazar — migration 20270129000000). Bu modül yalnız:
 *   - istemci IP'sinin pepper'lı SHA-256 özetini üretir (ham IP DB'ye gitmez),
 *   - RPC yanıtını tipli sonuca çevirir,
 *   - kilit için Türkçe/genel mesaj üretir (hesap varlığı sızdırmaz).
 *
 * Yalnız server-side (route handler) kullanımı içindir.
 */
import { createHash } from "crypto";

/**
 * IP pepper — YALNIZ sunucu env'inden (NEXT_PUBLIC DEĞİL). Öncelik: LOGIN_IP_PEPPER →
 * DEMO_IP_SALT (numeroloji demo kotasıyla aynı sır) → mevcut sunucu sırrından
 * (SUPABASE_SERVICE_ROLE_KEY) alan-ayrımlı SHA-256 türetme. Böylece ayrı sır
 * tanımlanmamış prod'da da IP özeti tahmin edilemez; sırrın kendisi hiçbir yere yazılmaz.
 * Hiçbiri yoksa (yalnız yerel geliştirme) sabit değer: throttle yine ÇALIŞIR.
 */
export function resolveLoginIpPepper(
  env: Record<string, string | undefined> = process.env,
): string {
  const v = env.LOGIN_IP_PEPPER?.trim() || env.DEMO_IP_SALT?.trim();
  if (v) return v;
  const serverSecret = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serverSecret) {
    return createHash("sha256").update(`yasam:login-ip-pepper:v1:${serverSecret}`).digest("hex");
  }
  return "dev-only-yasam-login-ip-pepper";
}

export function hashLoginIp(ip: string, pepper: string = resolveLoginIpPepper()): string {
  return createHash("sha256").update(`login:${pepper}:${ip || "unknown"}`).digest("hex");
}

export type GuardedLoginRow = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  tenant_id?: string | null;
  active?: boolean | null;
  approval_status?: string | null;
};

export type GuardedLoginOutcome =
  | { status: "ok"; row: GuardedLoginRow }
  | { status: "invalid" }
  | { status: "locked"; retryAfterSeconds: number }
  | { status: "error" };

/** auth_login_guarded jsonb yanıtını tipli sonuca çevirir (bilinmeyen biçim → error). */
export function parseGuardedLoginResponse(data: unknown): GuardedLoginOutcome {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { status: "error" };
  const d = data as Record<string, unknown>;
  if (d.status === "invalid") return { status: "invalid" };
  if (d.status === "locked") {
    const n = Number(d.retry_after);
    return { status: "locked", retryAfterSeconds: Number.isFinite(n) && n > 0 ? Math.ceil(n) : 60 };
  }
  if (d.status === "ok" && d.user && typeof d.user === "object") {
    const u = d.user as Record<string, unknown>;
    if (u.id == null || String(u.id).length === 0) return { status: "error" };
    return {
      status: "ok",
      row: {
        id: String(u.id),
        email: u.email != null ? String(u.email) : null,
        name: u.name != null ? String(u.name) : null,
        role: u.role != null ? String(u.role) : null,
        status: u.status != null ? String(u.status) : null,
        tenant_id: u.tenant_id != null ? String(u.tenant_id) : null,
        active: u.active === true ? true : u.active === false ? false : null,
        approval_status: u.approval_status != null ? String(u.approval_status) : null,
      },
    };
  }
  return { status: "error" };
}

/** Kilit mesajı — var olan/olmayan hesap için AYNI metin. */
export function loginLockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Çok sayıda başarısız giriş denemesi. Lütfen ${minutes} dakika sonra tekrar deneyin.`;
}

export const LOGIN_INVALID_MESSAGE = "E-posta veya şifre hatalı.";

/** Yeni parolalar için minimum uzunluk (register, şifre değiştirme, admin sıfırlama). */
export const NEW_PASSWORD_MIN_LENGTH = 10;
