/**
 * GİRİŞ GÜVENLİĞİ F2-E — kod İÇERMEYEN güvenlik bildirimi gönderimi (yalnız server-side).
 * En iyi çaba: sağlayıcı / pepper yoksa veya gönderim başarısızsa işlem ETKİLENMEZ (güvenlik kararı
 * DB'de zaten verildi ve security_events + auth_recovery_events'e yazıldı). Gönderim kaydı
 * auth_email_deliveries'e yalnız alıcı ÖZETİYLE düşer (adres yok, içerik yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider, type EmailProvider } from "@/lib/email/provider";
import { hashRecipient, otpPepper } from "@/lib/auth/emailOtp";
import { renderSecurityNotice, type SecurityNoticeKind } from "@/lib/email/templates/securityNoticeEmail";

type Env = Record<string, string | undefined>;

export async function sendSecurityNotice(
  db: SupabaseClient,
  args: { userId: string; to: string | null | undefined; name?: string | null; kind: SecurityNoticeKind },
  env: Env = process.env,
  providerOverride?: EmailProvider | null,
): Promise<boolean> {
  try {
    const to = typeof args.to === "string" ? args.to.trim() : "";
    const pepper = otpPepper(env);
    const provider = providerOverride === undefined ? getEmailProvider(env) : providerOverride;
    if (!to || !to.includes("@") || !pepper || !provider) return false;
    const { data, error } = await db.rpc("auth_email_notice_reserve", {
      p_user_id: args.userId,
      p_to_hash: hashRecipient(to, pepper),
      p_provider: provider.name,
    });
    const r = (data ?? {}) as { ok?: unknown; delivery_id?: unknown };
    if (error || r.ok !== true) return false;
    const mail = renderSecurityNotice(args.kind, args.name ?? null);
    const sent = await provider.send({ to, subject: mail.subject, text: mail.text, html: mail.html, category: "security_notice" });
    await db.rpc("auth_email_delivery_result", {
      p_delivery_id: Number(r.delivery_id),
      p_ok: sent.ok,
      p_error_code: sent.ok ? null : sent.code,
      p_provider_message_id: sent.ok ? sent.providerMessageId : null,
    });
    return sent.ok;
  } catch {
    return false;
  }
}
