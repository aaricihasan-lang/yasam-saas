import { supabase } from "@/lib/supabase";
import { clearYasamUser } from "@/lib/auth/yasamUser";

// password kasıtlı olarak hariç tutulmuştur — şifre browser'a asla gelmemeli
const LOGIN_LOOKUP_SELECT =
  "id, email, full_name, name, role, tenant_id, active, approval_status, module_permissions, package_type, membership_status, subscription_status, trial_started_at, trial_ends_at, membership_started_at, membership_ends_at, plan, admin_level, status";

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

function stripPasswordField(
  row: Record<string, unknown>,
): Record<string, unknown> {
  // password ve password_hash alanları hiçbir zaman client state'ine girmemeli
  const { password: _p, password_hash: _ph, ...rest } = row as Record<string, unknown>;
  return rest;
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

  let rows = rpcLoginRowsToArray(data);

  // RPC kimlik doğruladı ama full_name gibi profil alanlarını döndürmüyor olabilir.
  // Doğrudan users tablosundan tam profili çekip RPC satırını zenginleştir.
  if (!error && rows.length > 0) {
    const rpcRow = rows[0];
    const userId = rpcRow?.id != null ? String(rpcRow.id) : null;
    if (userId) {
      const { data: profileData } = await supabase
        .from("users")
        .select(LOGIN_LOOKUP_SELECT)
        .eq("id", userId)
        .maybeSingle();
      if (profileData) {
        rows = [stripPasswordField(profileData as Record<string, unknown>)];
      }
    }
  }

  return {
    rows,
    rpcError: error?.message ?? null,
    usedAdminFallback: false,
    normalizedEmail,
  };
}
