/**
 * GİRİŞ GÜVENLİĞİ F2-D — sağlayıcıdan bağımsız e-posta gönderim katmanı (yalnız server-side).
 *
 * EMAIL_PROVIDER = gmail | smtp | synthetic | disabled (varsayılan disabled).
 *   - gmail     : Google Workspace / Gmail API (yalnız gmail.send yetkisi; OAuth yenileme token'ı env'de).
 *   - smtp      : F2-M — kurumsal posta sunucusu (Turhost) SMTP; yalnız 465 TLS / 587 zorunlu STARTTLS (lib/email/smtpProvider.ts).
 *   - synthetic : yalnız yerel/test — production'da (VERCEL_ENV=production) ASLA çalışmaz.
 *   - disabled  : gönderim yok → e-posta yöntemi sunulmaz (MFA atlanmaz).
 * Yeni sağlayıcı (ör. Resend / Amazon SES) yalnız bu arayüzü uygular; OTP / denetim / kota mantığı değişmez.
 * Gizli değerler loglanmaz; hata yalnız kısa KOD olarak döner.
 */
import { createHash } from "node:crypto";
import { createGmailProvider } from "@/lib/email/gmailProvider";
import { createSmtpProvider } from "@/lib/email/smtpProvider";
import { createSmtpHourlyGate } from "@/lib/email/smtpQuota";
import { getServerDb } from "@/lib/supabase-server";
import { createSyntheticProvider, syntheticEmailAllowed } from "@/lib/email/syntheticProvider";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Denetim/kota kategorisi — içerik DEĞİL. */
  category: "login" | "verify_email" | "owner_test" | "change_email" | "security_notice" | "step_up";
};

export type EmailErrorCode =
  | "not_configured"
  | "oauth_invalid_grant"
  | "oauth_error"
  | "quota"
  | "provider_down"
  | "rejected"
  | "network"
  /** F2-M (SMTP): kullanıcı adı / parola reddedildi. */
  | "smtp_auth_failed"
  /** F2-M (SMTP): TLS kurulamadı (sertifika / ad / STARTTLS yok); kimlik bilgisi gönderilmedi. */
  | "smtp_tls_error";

export type EmailSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: EmailErrorCode; retryable: boolean };

export interface EmailProvider {
  readonly name: "gmail" | "smtp" | "synthetic";
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

type Env = Record<string, string | undefined>;

export function isProductionEnv(env: Env = process.env): boolean {
  return String(env.VERCEL_ENV ?? "") === "production";
}

let cached: { key: string; provider: EmailProvider | null } | null = null;

/** Yapılandırılmış sağlayıcı; yoksa/geçersizse null (e-posta yöntemi SUNULMAZ). */
export function getEmailProvider(env: Env = process.env): EmailProvider | null {
  const mode = String(env.EMAIL_PROVIDER ?? "disabled").trim().toLowerCase();
  // F2-M: SMTP alanları önbellek anahtarına yalnız parmak izi olarak girer (parola anahtarda düz metin tutulmaz).
  const smtpFp = mode === "smtp"
    ? createHash("sha256").update([env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_SENDER, env.SMTP_SENDER_NAME].map((v) => String(v ?? "")).join("\u0000")).digest("hex")
    : "";
  const key = `${mode}|${env.VERCEL_ENV ?? ""}|${env.GMAIL_SENDER ?? ""}|${env.EMAIL_SYNTHETIC_ALLOW ?? ""}|${env.NEXT_PUBLIC_SUPABASE_URL ?? ""}|${smtpFp}`;
  if (cached && cached.key === key && env === process.env) return cached.provider;
  let provider: EmailProvider | null = null;
  if (mode === "gmail") provider = createGmailProvider(env);
  // SMTP: saatlik kota kapısı (örnekler arası, veritabanında; fail-closed) HER ZAMAN takılı.
  else if (mode === "smtp") provider = createSmtpProvider(env, {}, createSmtpHourlyGate(() => getServerDb(), env));
  else if (mode === "synthetic" && syntheticEmailAllowed(env)) provider = createSyntheticProvider(env);
  if (env === process.env) cached = { key, provider };
  return provider;
}

/** Test yardımcısı: önbelleği sıfırla (env değiştiğinde). */
export function resetEmailProviderCache(): void {
  cached = null;
}
