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
