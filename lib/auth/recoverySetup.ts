/**
 * GİRİŞ GÜVENLİĞİ F4 (Risk A) — MFA ÖNCESİ kurtarma kodu kurulumu: uygunluk kararı (yalnız server-side).
 *
 * Kurulum yalnız şu hesapta açılır (hepsi DB'den / oturumdan; istekten hiçbir şey alınmaz):
 *   - oturum sahibi (verifySelfSessionRequest), etkin, demo değil, admin / uzman;
 *   - MFA zorunluluğu HENÜZ AÇILMAMIŞ (açıksa normal MFA'lı üretim yolu: auth_recovery_codes_generate);
 *   - e-postası doğrulanmış (posta kutusu kanıtı için kod bu adrese gider);
 *   - MFA kapsamında: AUTH_MFA_METHODS en az bir yöntem açıyor VE AUTH_MFA_METHOD_SCOPE bu hesabı içeriyor
 *     (test_accounts → auth_mfa_test_accounts'ta etkin kayıt). Yani kurulum, Owner'ın MFA'ya aday gösterdiği hesaplarla sınırlı;
 *   - e-posta yöntemi bu rolde izinli (AUTH_MFA_EMAIL_ROLES) ve sağlayıcı + pepper yapılandırılmış.
 * Veritabanı tarafı (auth_recovery_codes_setup) aynı koşulları ayrıca denetler ve kodu aynı işlemde tüketir. Fonksiyon henüz
 * yoksa (migration uygulanmamış) kurulum kullanılamaz (fail-closed).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailOtpAllowedForUser, emailOtpConfigured } from "@/lib/auth/emailOtp";
import { isMfaTestAccount, resolveOfferedMfaMethods } from "@/lib/auth/mfaChallenge";

type Env = Record<string, string | undefined>;

export type RecoverySetupIssue =
  | "demo" | "mfa_required" | "email_unverified" | "not_configured" | "not_in_mfa_scope" | "email_role" | "lookup_failed";
export type RecoverySetupEligibility =
  | { ok: true; email: string; name: string | null }
  | { ok: false; issue: RecoverySetupIssue };

export async function recoverySetupEligibility(
  db: SupabaseClient,
  guard: { userId: string; role: string; isDemo: boolean },
  env: Env = process.env,
): Promise<RecoverySetupEligibility> {
  if (guard.isDemo) return { ok: false, issue: "demo" };
  try {
    const { data, error } = await db.from("users").select("email, name, full_name, mfa_required, email_verified_at").eq("id", guard.userId).maybeSingle();
    if (error || !data) return { ok: false, issue: "lookup_failed" };
    const u = data as { email?: unknown; name?: unknown; full_name?: unknown; mfa_required?: unknown; email_verified_at?: unknown };
    if (u.mfa_required === true) return { ok: false, issue: "mfa_required" };
    if (u.email_verified_at == null || typeof u.email !== "string" || !u.email.trim()) return { ok: false, issue: "email_unverified" };
    if (!emailOtpConfigured(env)) return { ok: false, issue: "not_configured" };
    if (resolveOfferedMfaMethods(await isMfaTestAccount(db, guard.userId), env).length === 0) return { ok: false, issue: "not_in_mfa_scope" };
    if (!(await emailOtpAllowedForUser(db, guard.userId, guard.role, env))) return { ok: false, issue: "email_role" };
    const name = (typeof u.full_name === "string" && u.full_name) || (typeof u.name === "string" ? u.name : null);
    return { ok: true, email: u.email.trim(), name };
  } catch {
    return { ok: false, issue: "lookup_failed" };
  }
}
