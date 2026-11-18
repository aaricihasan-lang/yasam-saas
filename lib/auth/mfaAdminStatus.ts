/**
 * GİRİŞ GÜVENLİĞİ — Owner İki Aşamalı Giriş Yönetimi: üyenin MFA hazırlık durumu (yalnız sunucu).
 *
 * "Kullanılabilir yöntem" kararı GİRİŞ AKIŞIYLA AYNI kaynaktan verilir (resolveUserMfaMethods: ortam bayrakları +
 * kapsam + DB'deki cihaz / e-posta doğrulaması + e-posta sağlayıcısı ve pepper + rol izni). Böylece Owner'ın açtığı
 * zorunluluk, kullanıcının girişte yöntem bulamadığı bir duruma yol açamaz. DB'deki auth_mfa_user_has_method
 * (yalnız veri) tek başına yeterli SAYILMAZ.
 *
 * Gizli değer DÖNMEZ: e-posta adresi, parola, oturum anahtarı, kurtarma kodu, OTP, cihaz anahtarı yok; yalnız
 * var / yok, sayı ve tarih.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMfaTestAccount, resolveOfferedMfaMethods, resolveUserMfaMethods } from "@/lib/auth/mfaChallenge";
import { emailOtpAllowedForUser, emailOtpConfigured } from "@/lib/auth/emailOtp";

type Env = Record<string, string | undefined>;

/** Zorunluluk açılabilmesi için gereken ASIL yöntemler (kurtarma kodu tek başına yeterli değildir). */
export const PRIMARY_MFA_METHODS = ["qr_device", "email_otp"] as const;

export type MfaMethodState = { usable: boolean; reasons: string[] };

export type MfaAdminStatus = {
  userId: string;
  role: string;
  isOwnerAccount: boolean;
  mfaRequired: boolean;
  mfaRequiredAt: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  hasActiveDevice: boolean;
  recoveryCodesLeft: number;
  /** Girişte bugün gerçekten sunulacak yöntemler (giriş akışıyla aynı hesap). */
  loginMethods: string[];
  methods: { email_otp: MfaMethodState; qr_device: MfaMethodState };
  /** Zorunluluk açılabilir mi (en az bir ASIL yöntem gerçekten kullanılabilir). */
  ready: boolean;
  readyReasons: string[];
};

export type MfaAdminStatusResult = { ok: true; status: MfaAdminStatus } | { ok: false; code: "not_found" | "unavailable" };

/** Sade Türkçe neden metinleri (kod → metin). Arayüz ve API aynı metni kullanır. */
export const MFA_REASON_TEXT: Readonly<Record<string, string>> = {
  method_not_offered: "Bu yöntem sistem ayarlarında henüz açılmadı.",
  scope_test_accounts: "İkinci doğrulama şu an yalnız test hesaplarına açık; bu hesap listede değil.",
  email_not_verified: "Üyenin e-posta adresi doğrulanmadı (Ayarlar → Giriş Yöntemlerim).",
  email_provider_missing: "E-posta gönderim servisi (Gmail) yapılandırılmadı.",
  email_role_not_allowed: "Bu hesap türü için e-posta kodu yöntemi açık değil.",
  no_active_device: "Aktif güvenilir Android cihazı yok.",
  db_unavailable: "Güvenlik durumu veritabanından okunamadı; işlem güvenli tarafta durduruldu.",
  no_usable_method: "Hesapta şu anda çalışan bir ikinci doğrulama yöntemi yok; zorunluluk açılırsa üye giriş yapamaz.",
};

/** Saf: yöntem başına "kullanılabilir mi + neden değil". resolveUserMfaMethods ile aynı kurallar (test edilebilir). */
export function explainMethods(args: {
  offered: string[];
  scopeBlocked: boolean;
  hasDevice: boolean;
  emailVerified: boolean;
  emailConfigured: boolean;
  emailRoleAllowed: boolean;
}): { email_otp: MfaMethodState; qr_device: MfaMethodState } {
  const email: string[] = [];
  if (args.scopeBlocked) email.push("scope_test_accounts");
  else if (!args.offered.includes("email_otp")) email.push("method_not_offered");
  if (!args.emailVerified) email.push("email_not_verified");
  if (!args.emailConfigured) email.push("email_provider_missing");
  if (!args.emailRoleAllowed) email.push("email_role_not_allowed");
  const qr: string[] = [];
  if (args.scopeBlocked) qr.push("scope_test_accounts");
  else if (!args.offered.includes("qr_device")) qr.push("method_not_offered");
  if (!args.hasDevice) qr.push("no_active_device");
  return { email_otp: { usable: email.length === 0, reasons: email }, qr_device: { usable: qr.length === 0, reasons: qr } };
}

export async function loadMfaAdminStatus(db: SupabaseClient, userId: string, env: Env = process.env): Promise<MfaAdminStatusResult> {
  const u = await db
    .from("users")
    .select("id, role, mfa_required, mfa_required_at, email_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (u.error) return { ok: false, code: "unavailable" };
  if (!u.data) return { ok: false, code: "not_found" };
  const row = u.data as { id: string; role: unknown; mfa_required: unknown; mfa_required_at: unknown; email_verified_at: unknown };
  const role = String(row.role ?? "");

  // Giriş akışının kullandığı kaynak (auth_mfa_user_methods). Okunamazsa → hazır DEĞİL (fail-closed).
  const m = await db.rpc("auth_mfa_user_methods", { p_user_id: userId });
  const owner = await db.rpc("auth_is_owner_admin", { p_user_id: userId });
  // Cihaz tablosu service_role'e doğrudan AÇIK DEĞİL (F2: yalnız SECURITY DEFINER fonksiyonlar) → "aktif cihaz var mı"
  // bilgisi giriş akışının kaynağından (auth_mfa_user_methods.has_device) alınır; yetki genişletilmez.
  const dbOk = !m.error && !!m.data && typeof m.data === "object" && !owner.error;
  const md = (dbOk ? m.data : {}) as { has_device?: unknown; email_verified?: unknown; recovery_codes?: unknown };

  const isTestAccount = await isMfaTestAccount(db, userId);
  const emailConfigured = emailOtpConfigured(env);
  const emailRoleAllowed = await emailOtpAllowedForUser(db, userId, role, env);
  const offered = resolveOfferedMfaMethods(isTestAccount, env);
  const scopeBlocked = offered.length === 0 && resolveOfferedMfaMethods(true, env).length > 0;
  const loginMethods = dbOk
    ? await resolveUserMfaMethods(db, { userId, role, isTestAccount, emailConfigured, emailRoleAllowed }, env)
    : [];

  const methods = explainMethods({
    offered,
    scopeBlocked,
    hasDevice: md.has_device === true,
    emailVerified: md.email_verified === true,
    emailConfigured,
    emailRoleAllowed,
  });
  const primaryUsable = loginMethods.some((x) => (PRIMARY_MFA_METHODS as readonly string[]).includes(x));
  const ready = dbOk && primaryUsable && (methods.email_otp.usable || methods.qr_device.usable);
  const readyReasons = !dbOk ? ["db_unavailable"] : ready ? [] : ["no_usable_method"];

  return {
    ok: true,
    status: {
      userId,
      role,
      isOwnerAccount: owner.data === true,
      mfaRequired: row.mfa_required === true,
      mfaRequiredAt: typeof row.mfa_required_at === "string" ? row.mfa_required_at : null,
      emailVerified: md.email_verified === true,
      emailVerifiedAt: typeof row.email_verified_at === "string" ? row.email_verified_at : null,
      hasActiveDevice: md.has_device === true,
      recoveryCodesLeft: Number(md.recovery_codes) > 0 ? Number(md.recovery_codes) : 0,
      loginMethods,
      methods,
      ready,
      readyReasons,
    },
  };
}
