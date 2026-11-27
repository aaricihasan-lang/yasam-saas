/**
 * GİRİŞ GÜVENLİĞİ F2-D — e-posta OTP sunucu akışı (yalnız server-side / API route).
 *
 * Kod: crypto.randomInt ile 6 hane. Saklama: HMAC-SHA256(AUTH_OTP_PEPPER, kapsam ‖ kod) — kapsam giriş için
 * challenge, e-posta doğrulaması için kullanıcı (aynı kod başka challenge/kullanıcıda GEÇERSİZ). Düz kod
 * yalnız e-posta gövdesinde; DB'ye / loga yazılmaz. AUTH_OTP_PEPPER yoksa (≥32 karakter) yöntem KAPALI.
 * Gönderim hatası kodu doğrulanamaz bırakır (MFA atlanmaz); kullanıcı başka yönteme geçebilir.
 */
import { createHash, createHmac, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider, type EmailProvider } from "@/lib/email/provider";
import { renderOtpEmail } from "@/lib/email/templates/otpEmail";

type Env = Record<string, string | undefined>;

/** Gmail Workspace kullanıcı başına kayan 24 sa ≈2000 ileti; güvenlik payıyla blok/uyarı eşikleri. */
export const EMAIL_DAILY_LIMIT_DEFAULT = 1800;
export const EMAIL_WARN_AT_DEFAULT = 1500;
/**
 * F2-M: SMTP (Turhost kurumsal posta) varsayılanı — sağlayıcının saatlik sınırı (ilan edilen 250/saat; paket sözleşmesi
 * Owner tarafından yazılı teyit edilecek) kayan 24 saatlik sayaçla HİÇBİR dağılımda aşılamasın diye günlük toplam 200.
 * Kesin sınır öğrenilince EMAIL_DAILY_LIMIT / EMAIL_WARN_AT ile değiştirilir.
 */
export const EMAIL_DAILY_LIMIT_SMTP_DEFAULT = 200;
export const EMAIL_WARN_AT_SMTP_DEFAULT = 150;

/** Günlük gönderim sınırı ve uyarı eşiği (env > sağlayıcıya göre varsayılan). Bütün gönderim yolları bunu kullanır. */
export function emailLimits(env: Env = process.env): { dailyLimit: number; warnAt: number } {
  const smtp = String(env.EMAIL_PROVIDER ?? "").trim().toLowerCase() === "smtp";
  const dDef = smtp ? EMAIL_DAILY_LIMIT_SMTP_DEFAULT : EMAIL_DAILY_LIMIT_DEFAULT;
  const wDef = smtp ? EMAIL_WARN_AT_SMTP_DEFAULT : EMAIL_WARN_AT_DEFAULT;
  return {
    dailyLimit: Number(env.EMAIL_DAILY_LIMIT ?? dDef) || dDef,
    warnAt: Number(env.EMAIL_WARN_AT ?? wDef) || wDef,
  };
}

export function otpPepper(env: Env = process.env): string | null {
  const p = String(env.AUTH_OTP_PEPPER ?? "");
  return p.length >= 32 ? p : null;
}

/** E-posta yöntemi bu ortamda kullanılabilir mi? (sağlayıcı + pepper). Rol kapsamı ayrıca. */
export function emailOtpConfigured(env: Env = process.env): boolean {
  return !!otpPepper(env) && !!getEmailProvider(env);
}

/** Hangi rollerde e-posta yöntemi sunulur (AUTH_MFA_EMAIL_ROLES; varsayılan yalnız uzman). */
export function emailOtpRoleAllowed(role: string, env: Env = process.env): boolean {
  const roles = String(env.AUTH_MFA_EMAIL_ROLES ?? "expert").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return roles.includes(String(role).toLowerCase());
}

/**
 * F2-K: rol + Owner kapsamı. AUTH_MFA_EMAIL_ROLES içinde "owner" → e-posta yöntemi YALNIZ Owner yönetici hesabına açılır
 * (diğer yöneticilere açılmaz; "admin" yazmak bütün yöneticilere açar). Owner kararı yalnız DB işaretinden
 * (auth_is_owner_admin); sorgu hatası → kapalı (fail-closed).
 */
export async function emailOtpAllowedForUser(
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  userId: string,
  role: string,
  env: Env = process.env,
): Promise<boolean> {
  if (emailOtpRoleAllowed(role, env)) return true;
  const roles = String(env.AUTH_MFA_EMAIL_ROLES ?? "expert").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!roles.includes("owner") || String(role).toLowerCase() !== "admin") return false;
  try {
    const { data, error } = await db.rpc("auth_is_owner_admin", { p_user_id: userId });
    return !error && data === true;
  } catch {
    return false;
  }
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(scope: string, code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`yasam-otp:${scope}:${code}`).digest("hex");
}

export function hashRecipient(email: string, pepper: string): string {
  return createHash("sha256").update(`yasam-mail:${pepper.slice(0, 16)}:${email.trim().toLowerCase()}`).digest("hex");
}

/** "f***@a***.com" — tam adres ekrana yazılmaz. */
export function maskEmail(email: string): string {
  const [local, domain] = String(email).split("@");
  if (!local || !domain) return "***";
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0]}${"*".repeat(Math.min(3, Math.max(1, local.length - 1)))}@${host[0]}${"*".repeat(Math.min(3, Math.max(1, host.length - 1)))}${tld}`;
}

export type OtpSendOutcome =
  | { ok: true; expiresAt: string }
  | { ok: false; code: "not_configured" | "invalid" | "email_unverified" | "cooldown" | "too_many" | "rate_limited" | "quota_exhausted" | "send_failed" | "error"; retryAfter?: number };

/**
 * F2-J (L1): adres doğrulama kodu, kodun GÖNDERİLDİĞİ adrese bağlıdır (kapsam: verify:<kullanıcı>:<adres>). Adres, kod
 * üretimi ile onay arasında değişirse (yönetici düzenlemesi ile yarış) eski adrese giden kod yeni adresi doğrulayamaz.
 */
/**
 * F4: "recovery_setup" — MFA öncesi kurtarma kodu kurulumu için posta kutusu kanıtı. Veritabanında purpose='verify_email'
 * olarak saklanır (CHECK değişmez) ama HMAC kapsamı AYRIDIR (recovery-setup:<kullanıcı>:<adres>): bu kod adres doğrulamasında,
 * adres doğrulama kodu da kurtarma kurulumunda GEÇMEZ. Tüketim auth_recovery_codes_setup içinde (aynı işlem).
 */
type OtpFlow = "login" | "verify_email" | "recovery_setup";

function otpScope(purpose: OtpFlow, userId: string, challengeId: string | null, email?: string | null): string | null {
  if (purpose === "login") return `login:${challengeId}`;
  if (purpose === "recovery_setup") {
    const e = String(email ?? "").trim().toLowerCase();
    return e ? `recovery-setup:${userId}:${e}` : null;
  }
  const e = String(email ?? "").trim().toLowerCase();
  return e ? `verify:${userId}:${e}` : null;
}

export async function issueAndSendOtp(
  db: SupabaseClient,
  args: { userId: string; email: string; name?: string | null; purpose: OtpFlow; challengeId: string | null },
  env: Env = process.env,
  providerOverride?: EmailProvider | null,
): Promise<OtpSendOutcome> {
  const pepper = otpPepper(env);
  const provider = providerOverride === undefined ? getEmailProvider(env) : providerOverride;
  if (!pepper || !provider) return { ok: false, code: "not_configured" };
  const code = generateOtpCode();
  const scope = otpScope(args.purpose, args.userId, args.challengeId, args.email);
  if (!scope) return { ok: false, code: "invalid" };
  const { dailyLimit, warnAt } = emailLimits(env);
  const { data, error } = await db.rpc("auth_email_otp_issue", {
    p_user_id: args.userId,
    p_purpose: args.purpose === "recovery_setup" ? "verify_email" : args.purpose,
    p_challenge_id: args.challengeId,
    p_code_hash: hashOtp(scope, code, pepper),
    p_to_hash: hashRecipient(args.email, pepper),
    p_provider: provider.name,
    p_daily_limit: dailyLimit,
    p_warn_at: warnAt,
  });
  if (error) return { ok: false, code: "error" };
  const r = (data ?? {}) as { ok?: unknown; reason?: unknown; retry_after?: unknown; delivery_id?: unknown; expires_at?: unknown };
  if (r.ok !== true) {
    const reason = String(r.reason ?? "error");
    const known = ["invalid", "email_unverified", "cooldown", "too_many", "rate_limited", "quota_exhausted"] as const;
    return {
      ok: false,
      code: (known as readonly string[]).includes(reason) ? (reason as (typeof known)[number]) : "error",
      ...(Number.isFinite(Number(r.retry_after)) ? { retryAfter: Number(r.retry_after) } : {}),
    };
  }
  const mail = renderOtpEmail({ purpose: args.purpose, code, name: args.name ?? null, minutes: 3 });
  const sent = await provider.send({ to: args.email, subject: mail.subject, text: mail.text, html: mail.html, category: args.purpose === "recovery_setup" ? "verify_email" : args.purpose });
  await db.rpc("auth_email_delivery_result", {
    p_delivery_id: Number(r.delivery_id),
    p_ok: sent.ok,
    p_error_code: sent.ok ? null : sent.code,
    p_provider_message_id: sent.ok ? sent.providerMessageId : null,
  });
  return sent.ok ? { ok: true, expiresAt: String(r.expires_at) } : { ok: false, code: "send_failed" };
}

export type OtpVerifyOutcome = { ok: true } | { ok: false; code: "invalid" | "no_code" | "expired" | "wrong" | "locked" | "not_configured" | "error"; attemptsLeft?: number };

export async function verifyOtp(
  db: SupabaseClient,
  args: { userId: string; purpose: "login" | "verify_email"; challengeId: string | null; code: string; email?: string | null },
  env: Env = process.env,
): Promise<OtpVerifyOutcome> {
  const pepper = otpPepper(env);
  if (!pepper) return { ok: false, code: "not_configured" };
  if (!/^[0-9]{6}$/.test(args.code)) return { ok: false, code: "wrong" };
  const scope = otpScope(args.purpose, args.userId, args.challengeId, args.email);
  if (!scope) return { ok: false, code: "invalid" };
  const { data, error } = await db.rpc("auth_email_otp_verify", {
    p_user_id: args.userId,
    p_purpose: args.purpose,
    p_challenge_id: args.challengeId,
    p_code_hash: hashOtp(scope, args.code, pepper),
  });
  if (error) return { ok: false, code: "error" };
  const r = (data ?? {}) as { ok?: unknown; reason?: unknown; attempts_left?: unknown };
  if (r.ok === true) return { ok: true };
  const reason = String(r.reason ?? "error");
  const known = ["invalid", "no_code", "expired", "wrong", "locked"] as const;
  return {
    ok: false,
    code: (known as readonly string[]).includes(reason) ? (reason as (typeof known)[number]) : "error",
    ...(Number.isFinite(Number(r.attempts_left)) ? { attemptsLeft: Number(r.attempts_left) } : {}),
  };
}

/** F4: kurtarma kurulumu kodunun özeti (auth_recovery_codes_setup'a gider; düz kod DB'ye / loga yazılmaz). */
export function recoverySetupOtpHash(userId: string, email: string, code: string, env: Env = process.env): string | null {
  const pepper = otpPepper(env);
  const scope = otpScope("recovery_setup", userId, null, email);
  if (!pepper || !scope || !/^[0-9]{6}$/.test(code)) return null;
  return hashOtp(scope, code, pepper);
}
