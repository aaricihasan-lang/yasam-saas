/**
 * GİRİŞ GÜVENLİĞİ F2-E — kod İÇERMEYEN güvenlik bildirimi gönderimi (yalnız server-side).
 * En iyi çaba: sağlayıcı / pepper yoksa veya gönderim başarısızsa işlem ETKİLENMEZ (güvenlik kararı
 * DB'de zaten verildi ve security_events + auth_recovery_events'e yazıldı). Gönderim kaydı
 * auth_email_deliveries'e yalnız alıcı ÖZETİYLE düşer (adres yok, içerik yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider, type EmailProvider } from "@/lib/email/provider";
import { emailLimits, hashRecipient, otpPepper } from "@/lib/auth/emailOtp";
import { renderSecurityNotice, type SecurityNoticeKind } from "@/lib/email/templates/securityNoticeEmail";
import { emailSelfServiceAllowedForUserId } from "@/lib/auth/emailSelfService";

type Env = Record<string, string | undefined>;

// F2-K (L4): gönderilemeyen bildirim SESSİZ düşmez — security_events'e (adres / içerik olmadan) yazılır.
async function recordUndelivered(db: SupabaseClient, userId: string, kind: SecurityNoticeKind, reason: string): Promise<void> {
  try {
    await db.rpc("auth_email_notice_undelivered", { p_user_id: userId, p_kind: kind, p_reason: reason });
  } catch {
    // kayıt da yapılamazsa işlem yine etkilenmez (güvenlik kararı DB'de zaten verildi)
  }
}

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
    if (!to || !to.includes("@")) {
      await recordUndelivered(db, args.userId, args.kind, "no_address");
      return false;
    }
    if (!pepper || !provider) {
      await recordUndelivered(db, args.userId, args.kind, "not_configured");
      return false;
    }
    // F3: kullanıcı e-postası kapsamı (AUTH_EMAIL_SELF_SERVICE_ROLES; varsayılan yalnız Owner). Kapsam dışı alıcıya ileti
    // GİTMEZ, kota harcanmaz; denetim izi "scope_closed" olarak kalır.
    if (!(await emailSelfServiceAllowedForUserId(db, args.userId, env))) {
      await recordUndelivered(db, args.userId, args.kind, "scope_closed");
      return false;
    }
    // F2-K (L4): bildirimler kotanın en çok %80'ini kullanır; kalan pay giriş / işlem kodlarına ayrılır.
    const { dailyLimit } = emailLimits(env);
    const toHash = hashRecipient(to, pepper);
    let { data, error } = await db.rpc("auth_email_notice_reserve_quota", {
      p_user_id: args.userId,
      p_to_hash: toHash,
      p_provider: provider.name,
      p_daily_limit: dailyLimit,
    });
    // Geçiş: 001100 henüz uygulanmamış veritabanı (fonksiyon yok) → eski ayırma (kota payı olmadan) — bildirim düşmez.
    const missing = String((error as { code?: unknown } | null)?.code ?? "");
    if (error && (missing === "PGRST202" || missing === "42883")) {
      ({ data, error } = await db.rpc("auth_email_notice_reserve", { p_user_id: args.userId, p_to_hash: toHash, p_provider: provider.name }));
    }
    const r = (data ?? {}) as { ok?: unknown; delivery_id?: unknown; code?: unknown };
    if (error || r.ok !== true) {
      const code = typeof r.code === "string" && /^[a-z_]{1,40}$/.test(r.code) ? r.code : "reserve_error";
      await recordUndelivered(db, args.userId, args.kind, code);
      return false;
    }
    const mail = renderSecurityNotice(args.kind, args.name ?? null);
    const sent = await provider.send({ to, subject: mail.subject, text: mail.text, html: mail.html, category: "security_notice" });
    await db.rpc("auth_email_delivery_result", {
      p_delivery_id: Number(r.delivery_id),
      p_ok: sent.ok,
      p_error_code: sent.ok ? null : sent.code,
      p_provider_message_id: sent.ok ? sent.providerMessageId : null,
    });
    if (!sent.ok) await recordUndelivered(db, args.userId, args.kind, /^[a-z_]{1,40}$/.test(sent.code) ? sent.code : "send_failed");
    return sent.ok;
  } catch {
    await recordUndelivered(db, args.userId, args.kind, "error");
    return false;
  }
}
