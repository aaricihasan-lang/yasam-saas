/**
 * GİRİŞ GÜVENLİĞİ F2-J (N1) — yönetici parolası yeniden doğrulamasında DENEME SINIRI.
 *
 * Arşivleme / arşivden çıkarma / kalıcı silme rotaları Owner parolasını `verify_admin_login` ile doğrular; bu fonksiyonun
 * deneme sayacı yoktur. Çalınmış bir Owner oturumu, rastgele hedefle bu rotaları çağırıp yanıt farkından parolayı
 * SINIRSIZ deneyebilirdi. Bu yardımcı, giriş ekranıyla AYNI kısıtlamalı doğrulamayı (auth_login_guarded: e-posta + IP
 * sayacı, kilit) `verify_admin_login`'den ÖNCE çalıştırır → bu rotalar parola tahmini için yan kapı olamaz.
 * Mevcut sözleşme korunur: yanlış parola → 403 "Yönetici parolası doğrulanamadı."; kilit → 429.
 * Kısıtlamalı doğrulama altyapısı yoksa (yalnız eski test veritabanları) mevcut davranışa düşer — `verify_admin_login`
 * yine zorunludur; koruma ZAYIFLAMAZ.
 */
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { hashLoginIp, loginLockedMessage } from "@/lib/auth/loginThrottle";

export type AdminPasswordGuard =
  | { ok: true }
  | { ok: false; status: 403 | 429; error: string; retryAfter?: number };

export async function guardAdminPasswordAttempt(
  db: SupabaseClient,
  req: NextRequest,
  adminEmail: string,
  password: string,
): Promise<AdminPasswordGuard> {
  const r = await verifyLoginCredentialsGuarded(db, adminEmail, password, hashLoginIp(extractClientIp(req.headers)));
  if (r.status === "locked") {
    return { ok: false, status: 429, error: loginLockedMessage(r.retryAfterSeconds), retryAfter: r.retryAfterSeconds };
  }
  if (r.status === "ok") return { ok: true };
  if (r.status === "error") return { ok: true }; // kısıtlamalı doğrulama yok → verify_admin_login yine zorunlu
  return { ok: false, status: 403, error: "Yönetici parolası doğrulanamadı." };
}
