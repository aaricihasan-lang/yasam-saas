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
import { IMPLEMENTED_MFA_METHODS, isMfaTestAccount, resolveOfferedMfaMethods, resolveUserMfaMethods } from "@/lib/auth/mfaChallenge";
import { emailOtpAllowedForUser, emailOtpConfigured } from "@/lib/auth/emailOtp";

type Env = Record<string, string | undefined>;

/** Zorunluluk açılabilmesi için gereken ASIL yöntemler (kurtarma kodu tek başına yeterli değildir). */
export const PRIMARY_MFA_METHODS = ["qr_device", "email_otp"] as const;

/**
 * Owner kendi zorunluluğunu açmadan önce en az bu kadar KULLANILMAMIŞ çevrimdışı kit kodu olmalı. Owner'ı kurtaracak başka
 * bir Owner yoktur; kurtarma kodları ancak MFA açıldıktan sonra üretilebildiği için açılış anındaki tek kurtarma yolu kittir.
 */
export const OWNER_SELF_ENABLE_MIN_KIT = 1;

/**
 * Saf: MFA ortam ayarlarının BİÇİM hataları (değer DÖNMEZ, yalnız kod). Bilinmeyen yöntem adı / tanınmayan kapsam
 * sessizce "kapalı / test_accounts" sayıldığından, zorunluluk açılmadan önce hata olarak raporlanır ve açma engellenir.
 */
export function mfaConfigIssues(env: Record<string, string | undefined>): string[] {
  const issues: string[] = [];
  const tokens = String(env.AUTH_MFA_METHODS ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.some((t) => !IMPLEMENTED_MFA_METHODS.includes(t))) issues.push("config_methods_unknown");
  if (!tokens.some((t) => IMPLEMENTED_MFA_METHODS.includes(t))) issues.push("config_methods_empty");
  const scope = String(env.AUTH_MFA_METHOD_SCOPE ?? "").trim().toLowerCase();
  if (scope && scope !== "all" && scope !== "test_accounts") issues.push("config_scope_invalid");
  return issues;
}

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
  /**
   * Normal kurtarma kodu (+ Owner aracılı kurtarma bileti) sayısı. Owner'ın kendi hesabında YALNIZ normal kodlar
   * (çevrimdışı kit ayrı: ownerOfflineKitLeft). Diğer üyelerde kit kodu zaten sayılmaz (DB: yalnız Owner'da).
   */
  recoveryCodesLeft: number;
  /** Owner'ın kendi hesabı: kullanılmamış çevrimdışı kit kodu sayısı; diğer üyeler / okunamadı → null. */
  ownerOfflineKitLeft: number | null;
  /** MFA ortam ayarı biçim hataları (kod). Doluysa zorunluluk AÇILMAZ. */
  configIssues: string[];
  /** Owner'ın kendi zorunluluğunu açması için kurtarma yolu hazır mı (diğer üyeler → null). */
  ownerSelfRecoveryReady: boolean | null;
  /** F4: Owner dışı hesapta kurtarma kodu var mı (zorunluluk şartı). Owner hesabında null (kit kuralı geçerli). */
  memberRecoveryReady: boolean | null;
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
  email_provider_missing: "E-posta gönderim servisi yapılandırılmadı.",
  email_role_not_allowed: "Bu hesap türü için e-posta kodu yöntemi açık değil.",
  no_active_device: "Aktif güvenilir Android cihazı yok.",
  db_unavailable: "Güvenlik durumu veritabanından okunamadı; işlem güvenli tarafta durduruldu.",
  no_usable_method: "Hesapta şu anda çalışan bir ikinci doğrulama yöntemi yok; zorunluluk açılırsa üye giriş yapamaz.",
  recovery_codes_missing: "Üyenin kullanılmamış kurtarma kodu yok. Zorunluluk açılmadan önce üye kurtarma kodlarını oluşturmalı (Ayarlar → Giriş Yöntemlerim); aksi hâlde e-posta / telefon erişimi kaybolursa giriş yapamaz.",
  config_methods_unknown: "İkinci doğrulama ayarında tanınmayan bir yöntem adı var; ayar düzeltilmeden zorunluluk açılamaz.",
  config_methods_empty: "İkinci doğrulama yöntemleri sistem ayarlarında açık değil; zorunluluk açılamaz.",
  config_scope_invalid: "İkinci doğrulama kapsam ayarı tanınmıyor; ayar düzeltilmeden zorunluluk açılamaz.",
  owner_kit_missing: "Kendi zorunluluğunuzu açmadan önce kullanılmamış çevrimdışı kurtarma kiti kodunuz olmalı (telefon ve e-posta birlikte kaybolursa tek yol budur).",
  owner_recovery_unreadable: "Kurtarma kiti durumunuz okunamadı; işlem güvenli tarafta durduruldu.",
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

/**
 * Owner'ın KENDİ kurtarma durumu: normal kod ve çevrimdışı kit AYRI sayılır (auth_recovery_status; yalnız oturum
 * sahibinin kaydı — başka kullanıcının bilgisi bu yoldan okunamaz). Kod / özet DÖNMEZ. Okunamazsa null (fail-closed).
 */
export async function loadOwnerSelfRecovery(db: SupabaseClient, actorToken: string): Promise<{ codesActive: number; kitActive: number } | null> {
  const { data, error } = await db.rpc("auth_recovery_status", { p_actor_token: actorToken });
  const r = (data ?? {}) as { ok?: unknown; is_owner?: unknown; codes_active?: unknown; owner_offline_active?: unknown };
  if (error || r.ok !== true || r.is_owner !== true) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  return { codesActive: n(r.codes_active), kitActive: n(r.owner_offline_active) };
}

export async function loadMfaAdminStatus(
  db: SupabaseClient,
  userId: string,
  env: Env = process.env,
  opts: { actorToken?: string; isSelf?: boolean } = {},
): Promise<MfaAdminStatusResult> {
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
  const configIssues = mfaConfigIssues(env);

  // Owner hesabı: kit ve normal kod ayrı. Yalnız Owner kendi hesabına bakarken (kendi oturum anahtarıyla) okunabilir;
  // Owner hesabına başka bir bağlamda bakılırsa kit durumu bilinmez → kendi zorunluluğu için hazır SAYILMAZ.
  const isOwnerAccount = owner.data === true;
  let recoveryCodesLeft = Number(md.recovery_codes) > 0 ? Number(md.recovery_codes) : 0;
  let ownerOfflineKitLeft: number | null = null;
  let ownerSelfRecoveryReady: boolean | null = null;
  if (isOwnerAccount) {
    const own = opts.isSelf && opts.actorToken ? await loadOwnerSelfRecovery(db, opts.actorToken) : null;
    if (own) {
      recoveryCodesLeft = own.codesActive;
      ownerOfflineKitLeft = own.kitActive;
      ownerSelfRecoveryReady = own.kitActive >= OWNER_SELF_ENABLE_MIN_KIT;
    } else {
      recoveryCodesLeft = 0;
      ownerSelfRecoveryReady = false;
    }
  }

  return {
    ok: true,
    status: {
      userId,
      role,
      isOwnerAccount,
      mfaRequired: row.mfa_required === true,
      mfaRequiredAt: typeof row.mfa_required_at === "string" ? row.mfa_required_at : null,
      emailVerified: md.email_verified === true,
      emailVerifiedAt: typeof row.email_verified_at === "string" ? row.email_verified_at : null,
      hasActiveDevice: md.has_device === true,
      recoveryCodesLeft,
      ownerOfflineKitLeft,
      configIssues,
      ownerSelfRecoveryReady,
      // F4 (Risk A): Owner DIŞI hesapta zorunluluk için en az bir kullanılmamış kurtarma kodu şartı (Owner: kit kuralı).
      memberRecoveryReady: isOwnerAccount ? null : recoveryCodesLeft > 0,
      loginMethods,
      methods,
      ready,
      readyReasons,
    },
  };
}
