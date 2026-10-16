/**
 * MEM-015 — Admin sayfa kabuğu (app/admin/**) oturum doğrulaması.
 *
 * Önce: `yasam_admin_id` cookie'si imzasız admin UUID'si taşıyordu; layout yalnız "bu UUID bir
 * aktif admin mi?" diye bakıyordu → bilinen bir admin UUID'sini cookie'ye yazan herkes kabuğu
 * (veri değil) render ettirebiliyordu. API'ler zaten token-bağlı (verifyAdminRequest) olduğundan
 * veri sızmıyordu.
 *
 * Şimdi: cookie, credential-gated login'in ürettiği OPAK oturum token'ını taşır (httpOnly,
 * SameSite=Strict, production'da Secure). Kabuk, API ile AYNI doğrulamayı yapar:
 * token user_sessions'da AKTİF + sahibi role=admin + active=true (resolveAdminUserIdFromSessionToken).
 * Ayrı ikinci auth sistemi YOK. Token zaten istemcide (localStorage) bulunduğundan httpOnly
 * cookie ek bir maruziyet getirmez; cookie yalnız kabuk render kararında kullanılır (API yetkisi
 * header token'ı ile verilir → CSRF yüzeyi yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdminUserIdFromSessionToken } from "@/lib/auth/credentialLogin";
import { resolveActiveSession } from "@/lib/auth/sessionSecurity";

export const ADMIN_SESSION_COOKIE = "yasam_admin_session";
/** Eski (imzasız UUID) cookie — artık yazılmaz; çıkışta/yenilemede temizlenir. */
export const LEGACY_ADMIN_ID_COOKIE = "yasam_admin_id";
export const ADMIN_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 saat

const TOKEN_RE = /^[A-Za-z0-9._-]{16,200}$/;

export function adminSessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isProduction,
    path: "/",
    maxAge: ADMIN_SESSION_COOKIE_MAX_AGE,
  };
}

export type AdminShellResolution =
  | { status: "admin"; adminId: string }
  | { status: "denied" }
  | { status: "unavailable" };

/**
 * Final-A3: admin kabuk kararının ÜÇ DEĞERLİ hâli (resolveAdminUserIdFromSessionToken ile AYNI kural:
 * token user_sessions'da aktif + sahibi role=admin + active=true). Geçici DB/RPC hatası "denied"
 * DEĞİL "unavailable"dır → layout kullanıcıyı yetkisizmiş gibi "/"'a atmaz; kabuk yine render
 * edilmez (fail-closed).
 */
export async function resolveAdminShellSession(
  db: SupabaseClient,
  cookieToken: string | undefined | null,
): Promise<AdminShellResolution> {
  const token = String(cookieToken ?? "").trim();
  if (!TOKEN_RE.test(token)) return { status: "denied" };
  try {
    const session = await resolveActiveSession(db, token);
    if (session.status === "unavailable") return { status: "unavailable" };
    if (session.status !== "active") return { status: "denied" };
    const { data, error } = await db
      .from("users")
      .select("id, role, active")
      .eq("id", session.userId)
      .maybeSingle();
    if (error) return { status: "unavailable" };
    if (!data || data.role !== "admin" || data.active !== true) return { status: "denied" };
    return { status: "admin", adminId: String(data.id) };
  } catch {
    return { status: "unavailable" };
  }
}

/** Kabuk erişimi: geçerli admin oturum token'ı → admin id; aksi null (fail-closed). */
export async function resolveAdminShellUserId(
  db: SupabaseClient,
  cookieToken: string | undefined | null,
): Promise<string | null> {
  const token = String(cookieToken ?? "").trim();
  if (!TOKEN_RE.test(token)) return null;
  try {
    return await resolveAdminUserIdFromSessionToken(db, token);
  } catch {
    return null;
  }
}
