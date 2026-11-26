/**
 * GİRİŞ GÜVENLİĞİ F3 — E-POSTA DOĞRULAMA PİLOTU (yalnız server-side; Owner kararı 26.11.2026).
 *
 * Amaç: gerçek SMTP kabulünden sonra uzman e-posta doğrulamasını BÜTÜN uzmanlara açmadan (AUTH_EMAIL_SELF_SERVICE_ROLES
 * varsayılan yalnız Owner kalır), Owner'ın seçtiği TEK test hesabında gerçek "e-posta adresimi doğrula" akışını denemek.
 *
 * Kapsam YALNIZ kayıtlı adres doğrulamasıdır (purpose='verify_email'):
 *   - e-posta adresi DEĞİŞTİRME, hesap kurtarma, güvenlik bildirimleri, giriş (MFA) kodu bu pilotla AÇILMAZ (mevcut kapsam kuralları);
 *   - adresin doğrulanması MFA zorunluluğunu (mfa_required) DEĞİŞTİRMEZ.
 *
 * Sunucu ayarları (ikisi de ZORUNLU; biri eksik / geçersiz → pilot KAPALI):
 *   AUTH_EMAIL_VERIFY_PILOT_USER_ID       — tek kullanıcı kimliği (UUID). Virgül / birden fazla değer → KAPALI (genişletilemez).
 *   AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256  — o hesabın kayıtlı adresinin özeti: sha256(küçük harf + kırpılmış adres), 64 hex.
 *                                           Adres sonradan değişirse (ör. yönetici düzenlemesi) özet tutmaz → pilot KAPALI;
 *                                           kod hiçbir zaman Owner'ın onaylamadığı bir adrese gitmez.
 * Karar her istekte VERİTABANINDAN verilir; kullanıcı OTURUMDAN gelir (istek gövdesi / başlığı kimlik veya alıcı belirlemez):
 *   kimlik = ayardaki UUID · rol = expert · active = true · approval_status = approved · arşivde değil · "Pasif" değil
 *   (access_restricted_at boş) · demo değil · kayıtlı adres özeti = ayardaki özet. Okuma hatası / eksik kolon → KAPALI.
 * Geri alma: iki değişkeni silmek + yeniden yayın → pilot kapanır (doğrulanmış durum korunur; başka hiçbir kayıt değişmez).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Env = Record<string, string | undefined>;
type Db = Pick<SupabaseClient, "from">;

export const EMAIL_VERIFY_PILOT_USER_ENV = "AUTH_EMAIL_VERIFY_PILOT_USER_ID";
export const EMAIL_VERIFY_PILOT_HASH_ENV = "AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

/** Adres özeti: sha256(küçük harf + kırpılmış). Owner ayarı aynı biçimde üretir. */
export function pilotEmailHash(email: string): string {
  return createHash("sha256").update(String(email ?? "").trim().toLowerCase()).digest("hex");
}

/** Ayar çözümleme (saf). Geçerli değilse null — pilot kapalı. Değerler hiçbir yanıtta / logda dönmez. */
export function emailVerifyPilotConfig(env: Env = process.env): { userId: string; emailHash: string } | null {
  const id = String(env[EMAIL_VERIFY_PILOT_USER_ENV] ?? "").trim().toLowerCase();
  const hash = String(env[EMAIL_VERIFY_PILOT_HASH_ENV] ?? "").trim().toLowerCase();
  if (!UUID_RE.test(id) || !SHA256_RE.test(hash)) return null;
  return { userId: id, emailHash: hash };
}

export type PilotDecision = { allowed: boolean; reason: "not_configured" | "other_user" | "lookup_failed" | "not_eligible" | "email_mismatch" | "ok" };

/** Bu oturum kullanıcısı pilot kapsamında mı? (userId: oturum doğrulamasının bağladığı kullanıcı) */
export async function emailVerifyPilotDecision(db: Db, userId: string, env: Env = process.env): Promise<PilotDecision> {
  const cfg = emailVerifyPilotConfig(env);
  if (!cfg) return { allowed: false, reason: "not_configured" };
  if (String(userId ?? "").trim().toLowerCase() !== cfg.userId) return { allowed: false, reason: "other_user" };
  try {
    const { data, error } = await db
      .from("users")
      .select("id, email, role, active, approval_status, archived_at, access_restricted_at, is_demo_account")
      .eq("id", cfg.userId)
      .maybeSingle();
    if (error || !data) return { allowed: false, reason: "lookup_failed" };
    const u = data as Record<string, unknown>;
    const eligible = String(u.id ?? "").toLowerCase() === cfg.userId
      && String(u.role ?? "").trim().toLowerCase() === "expert"
      && u.active === true
      && String(u.approval_status ?? "").trim().toLowerCase() === "approved"
      && u.archived_at == null
      && u.access_restricted_at == null
      && u.is_demo_account !== true;
    if (!eligible) return { allowed: false, reason: "not_eligible" };
    if (typeof u.email !== "string" || !u.email.trim() || pilotEmailHash(u.email) !== cfg.emailHash) return { allowed: false, reason: "email_mismatch" };
    return { allowed: true, reason: "ok" };
  } catch {
    return { allowed: false, reason: "lookup_failed" };
  }
}

export async function emailVerifyPilotAllowed(db: Db, userId: string, env: Env = process.env): Promise<boolean> {
  return (await emailVerifyPilotDecision(db, userId, env)).allowed;
}
