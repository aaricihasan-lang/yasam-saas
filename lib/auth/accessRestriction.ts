/**
 * ÜYE PASİFLEŞTİRME F3 — "Pasif" (bağımsız erişim kısıtı) SAF çekirdeği (IO/env/DB YOK; istemci + sunucu ortak).
 *
 * Owner kararı (2026-11-24): Pasif uzman giriş yapar, ana sayfayı ve modülleri görür; hiçbir ürün modülünü kullanamaz
 * (danışan, eski/yeni analiz, rapor/Word/PDF, yedek/geri yükleme/dışa aktarma, Storage/imzalı bağlantı, kayıt yazma).
 * DB eşi: supabase/migrations/20280125000000_member_access_restriction.sql (users.access_restricted_at; active=true kalır).
 *
 * KAPALI-BAŞLANGIÇ: kısıt verifyUserRequest'te (tüm kullanıcı uçlarının ortak kapısı) uygulanır; yalnız aşağıdaki
 * AÇIK LİSTE geçer. Listede olmayan her mevcut ve YENİ eklenen uç kısıtlıdır. Liste yol + yöntem bazında BİREBİR
 * eşleşir (önek / joker YOK). Giriş, çıkış ve oturum kontrolü (auth/session*, auth/mfa*, me/sessions) bu kapıyı
 * kullanmaz; giriş güvenliği zinciri değişmez.
 */

export const ACCESS_RESTRICTED_CODE = "ACCOUNT_RESTRICTED" as const;
export const ACCESS_RESTRICTED_MESSAGE =
  "Hesabınız pasif durumdadır; modüller şu an kullanılamaz. Bilgi için sistem yöneticinizle iletişime geçiniz." as const;

/**
 * Pasif uzmana AÇIK uçlar (Owner: ana sayfa için minimum üyelik bilgisi, güvenli parola değişikliği, destek talebi).
 * Her biri yalnız oturum sahibinin KENDİ satırlarını okur/yazar; danışan / analiz / dosya verisi döndürmez.
 */
export const ACCESS_RESTRICTION_EXEMPT: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "/api/auth/profile": ["GET"], // kendi profil satırı (whitelist kolonlar) — ana sayfa üyelik durumu
  "/api/trial/status": ["GET"], // kendi deneme durumu — ana sayfa deneme bildirimi
  "/api/settings/change-password": ["POST"], // kendi parolası
  "/api/settings/support": ["GET", "POST"], // kendi destek mesajları (user_id = oturum)
});

/** Satır (DB profili / istemci kaydı) bağımsız erişim kısıtı altında mı? */
export function isAccessRestrictedRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const v = row.access_restricted_at;
  return v !== null && v !== undefined && String(v).trim() !== "";
}

/** Kısıtlı hesabın bu isteği yapmasına izin var mı? (yalnız açık liste; birebir yol + yöntem) */
export function isAccessRestrictionExemptRequest(method: string | null | undefined, pathname: string | null | undefined): boolean {
  const p = String(pathname ?? "");
  if (!Object.prototype.hasOwnProperty.call(ACCESS_RESTRICTION_EXEMPT, p)) return false;
  return ACCESS_RESTRICTION_EXEMPT[p].includes(String(method ?? "").toUpperCase());
}
