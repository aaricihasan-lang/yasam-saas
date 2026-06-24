import { supabase } from "@/lib/supabase";
import { clearYasamUser } from "@/lib/auth/yasamUser";

export type LoginAttemptResult = {
  rows: Record<string, unknown>[];
  rpcError: string | null;
  usedAdminFallback: boolean;
  normalizedEmail: string;
};

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** RPC bazen tek nesne döndürebilir; diziye çevirir */
export function rpcLoginRowsToArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (item) => item != null && typeof item === "object",
    ) as Record<string, unknown>[];
  }
  if (typeof data === "object") {
    return [data as Record<string, unknown>];
  }
  return [];
}

/**
 * Oturum öncesi localStorage temizler, e-posta/şifreyi normalize eder, login_user RPC çağırır.
 * RPC boş dönerse oturum açılamaz — users tablosu yedek doğrulaması kaldırıldı.
 */
export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<LoginAttemptResult> {
  clearYasamUser();

  const normalizedEmail = normalizeLoginEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    return {
      rows: [],
      rpcError: null,
      usedAdminFallback: false,
      normalizedEmail,
    };
  }

  const { data, error } = await supabase.rpc("login_user", {
    p_email: normalizedEmail,
    p_password: trimmedPassword,
  });

  // Kimlik doğrulama login_user RPC ile yapılır (SECURITY DEFINER).
  // Tam profil, login sonrası /api/auth/profile (service_role) üzerinden yüklenir;
  // burada users tablosuna doğrudan publishable key ile okuma YAPILMAZ.
  const rows = rpcLoginRowsToArray(data);

  return {
    rows,
    rpcError: error?.message ?? null,
    usedAdminFallback: false,
    normalizedEmail,
  };
}
