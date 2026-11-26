/**
 * GİRİŞ GÜVENLİĞİ F3 — kullanıcıya giden e-posta işlemlerinin KAPSAMI (yalnız server-side).
 *
 * Sorun (F3 denetimi 24.11.2026): EMAIL_PROVIDER + AUTH_OTP_PEPPER girildiği anda "e-postamı doğrula",
 * "e-posta adresimi değiştir" ve hesap kurtarma güvenlik bildirimleri demo dışındaki BÜTÜN kullanıcılara açılıyordu
 * (AUTH_MFA_EMAIL_ROLES yalnız giriş kodunu sınırlar). İlk gerçek SMTP kabulü yalnız Owner hesabıyla yapılacak.
 *
 * Bayrak: AUTH_EMAIL_SELF_SERVICE_ROLES — virgüllü; tanınan değerler:
 *   owner  → yalnız Owner yönetici hesabı (DB işareti auth_is_owner_admin; sorgu hatası → KAPALI)
 *   admin  → bütün yönetici hesapları (Owner dahil)
 *   expert → bütün uzman hesapları
 * Varsayılan (boş / tanımsız) = "owner". Tanınmayan değerler YOK SAYILIR; geriye tanınan değer kalmazsa yine "owner"
 * (yanlış yazım erişimi GENİŞLETMEZ). Demo hesabı her durumda kapalıdır (çağıran uç ayrıca denetler).
 * Geri alma: değişkeni silmek / "owner" yapmak + yeniden yayın → kapsam yalnız Owner'a döner.
 *
 * Kapsam dışı kullanıcıda: doğrulama / değiştirme uçları 403 (METHOD_NOT_IN_SCOPE) döner ve e-posta HİÇ gönderilmez;
 * güvenlik bildirimi gönderilmez, yerine security_events'e "scope_closed" nedeniyle "gönderilmedi" kaydı düşer
 * (denetim izi korunur). Rol ve Owner kararı İSTEKTEN değil, oturumun bağlı olduğu kullanıcının DB kaydından gelir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Env = Record<string, string | undefined>;
type RpcDb = Pick<SupabaseClient, "rpc">;

export const EMAIL_SELF_SERVICE_ROLES = ["owner", "admin", "expert"] as const;
export type EmailSelfServiceRole = (typeof EMAIL_SELF_SERVICE_ROLES)[number];
export const EMAIL_SELF_SERVICE_DEFAULT: readonly EmailSelfServiceRole[] = ["owner"];

/** Etkin kapsam (tanınan değerler; boş → yalnız owner). `ignored` = yok sayılan tanınmayan değer sayısı (değerler DÖNMEZ). */
export function emailSelfServiceScope(env: Env = process.env): { roles: EmailSelfServiceRole[]; ignored: number; isDefault: boolean } {
  const tokens = String(env.AUTH_EMAIL_SELF_SERVICE_ROLES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const known = EMAIL_SELF_SERVICE_ROLES.filter((r) => tokens.includes(r));
  const ignored = tokens.filter((t) => !(EMAIL_SELF_SERVICE_ROLES as readonly string[]).includes(t)).length;
  if (known.length === 0) return { roles: [...EMAIL_SELF_SERVICE_DEFAULT], ignored, isDefault: true };
  return { roles: known, ignored, isDefault: false };
}

/**
 * Bu kullanıcıya (kendi oturumundaki rolü + DB Owner işareti) kullanıcı e-postası işlemleri açık mı?
 * role: oturum doğrulamasının DB'den okuduğu rol (istek gövdesi / başlık DEĞİL).
 */
export async function emailSelfServiceAllowed(db: RpcDb, userId: string, role: string, env: Env = process.env): Promise<boolean> {
  const { roles } = emailSelfServiceScope(env);
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "expert") return roles.includes("expert");
  if (r !== "admin") return false;
  if (roles.includes("admin")) return true;
  if (!roles.includes("owner")) return false;
  try {
    const { data, error } = await db.rpc("auth_is_owner_admin", { p_user_id: userId });
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Rolü istekte bulunmayan kullanıcı için (ör. güvenlik bildirimi alıcısı): rol DB'den okunur. Kapsam genişletildiğinde
 * bildirimler önceki gibi gider (etkinlik / demo burada ayrıca süzülmez); okuma hatası / kullanıcı yok → KAPALI.
 */
export async function emailSelfServiceAllowedForUserId(db: SupabaseClient, userId: string, env: Env = process.env): Promise<boolean> {
  try {
    const { data, error } = await db.from("users").select("role").eq("id", userId).maybeSingle();
    if (error || !data) return false;
    return await emailSelfServiceAllowed(db, userId, String((data as { role?: unknown }).role ?? ""), env);
  } catch {
    return false;
  }
}

export const EMAIL_NOT_IN_SCOPE_TEXT = "E-posta ile doğrulama ve adres değişikliği bu hesap için henüz açılmadı.";

/**
 * F3 PİLOT — e-posta ADRES DOĞRULAMASI için tek hesaplık pilot (rol kapsamını GENİŞLETMEZ).
 *
 * AUTH_EMAIL_VERIFY_PILOT_USER_ID: TAM OLARAK BİR kullanıcı kimliği (UUID). Boş / biçimsiz / birden çok değer → pilot YOK.
 * Pilot YALNIZ /api/me/email-verification (kendi kayıtlı adresini kodla doğrulama) için geçerlidir; adres değiştirme,
 * güvenlik bildirimleri, kurtarma ve MFA bu pilotla AÇILMAZ (onlar emailSelfServiceAllowed'a bağlı kalır).
 * Kimlik oturumun bağlı olduğu kullanıcıdır (istekten gelmez). Hesap DB'de etkin + uzman + demo değil + arşivde değil +
 * "Pasif" değil olmalı; okuma hatası → KAPALI. Geri alma: değişkeni silmek + yeniden yayın.
 */
const PILOT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function emailVerifyPilotUserId(env: Env = process.env): string | null {
  const raw = String(env.AUTH_EMAIL_VERIFY_PILOT_USER_ID ?? "").trim().toLowerCase();
  return PILOT_UUID_RE.test(raw) ? raw : null;
}

export async function emailVerifyPilotAllowed(db: SupabaseClient, userId: string, env: Env = process.env): Promise<boolean> {
  const pilot = emailVerifyPilotUserId(env);
  if (!pilot || String(userId ?? "").trim().toLowerCase() !== pilot) return false;
  try {
    const { data, error } = await db.from("users").select("*").eq("id", pilot).maybeSingle();
    if (error || !data) return false;
    const u = data as Record<string, unknown>;
    return u.active === true && u.is_demo_account !== true && String(u.role ?? "").trim().toLowerCase() === "expert"
      && (u.archived_at ?? null) === null && (u.access_restricted_at ?? null) === null;
  } catch {
    return false;
  }
}

/** Kendi kayıtlı adresini doğrulama: rol kapsamı (emailSelfServiceAllowed) VEYA tek hesaplık pilot. */
export async function emailVerificationAllowed(db: SupabaseClient, userId: string, role: string, env: Env = process.env): Promise<boolean> {
  if (await emailSelfServiceAllowed(db, userId, role, env)) return true;
  return emailVerifyPilotAllowed(db, userId, env);
}
