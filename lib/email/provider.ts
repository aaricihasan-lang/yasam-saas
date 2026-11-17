/**
 * GİRİŞ GÜVENLİĞİ F2-D — sağlayıcıdan bağımsız e-posta gönderim katmanı (yalnız server-side).
 *
 * EMAIL_PROVIDER = gmail | synthetic | disabled (varsayılan disabled).
 *   - gmail     : Google Workspace / Gmail API (yalnız gmail.send yetkisi; OAuth yenileme token'ı env'de).
 *   - synthetic : yalnız yerel/test — production'da (VERCEL_ENV=production) ASLA çalışmaz.
 *   - disabled  : gönderim yok → e-posta yöntemi sunulmaz (MFA atlanmaz).
 * Yeni sağlayıcı (ör. Resend / Amazon SES) yalnız bu arayüzü uygular; OTP / denetim / kota mantığı değişmez.
 * Gizli değerler loglanmaz; hata yalnız kısa KOD olarak döner.
 */
import { createGmailProvider } from "@/lib/email/gmailProvider";
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
  | "network";

export type EmailSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: EmailErrorCode; retryable: boolean };

export interface EmailProvider {
  readonly name: "gmail" | "synthetic";
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
  const key = `${mode}|${env.VERCEL_ENV ?? ""}|${env.GMAIL_SENDER ?? ""}|${env.EMAIL_SYNTHETIC_ALLOW ?? ""}|${env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`;
  if (cached && cached.key === key && env === process.env) return cached.provider;
  let provider: EmailProvider | null = null;
  if (mode === "gmail") provider = createGmailProvider(env);
  else if (mode === "synthetic" && syntheticEmailAllowed(env)) provider = createSyntheticProvider(env);
  if (env === process.env) cached = { key, provider };
  return provider;
}

/** Test yardımcısı: önbelleği sıfırla (env değiştiğinde). */
export function resetEmailProviderCache(): void {
  cached = null;
}
