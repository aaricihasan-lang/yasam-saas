import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";

/**
 * P0-1 KAPANIŞI — Session/token/cookie üretimi yalnızca SUNUCU TARAFINDA
 * doğrulanmış kimlik doğrulaması sonucundan sonra mümkün olmalıdır.
 *
 * Bu modül SUNUCU-TARAFI credential doğrulamasını sağlar. Client asla yalnız
 * bir UUID göndererek "bu kullanıcı giriş yaptı" iddiasını kanıtlayamaz; token
 * üretmek için gerçek credential (e-posta + şifre) sunulmalı ve aynı güvenilir
 * server yürütmesi içinde doğrulanmalıdır (atomik server-login).
 *
 * Yalnızca server-side (API route) kullanımı içindir — `lib/supabase-server.ts`
 * (service-role) ile aynı sınırda; yalnız route handler'larından import edilir.
 */

export type VerifiedCredentialUser = {
  userId: string;
  active: boolean;
  approvalStatus: string;
  role: string;
  tenantId: string | null;
};

/** login_user RPC'nin döndürebileceği tek satır (bkz. migration 20260624230000). */
type LoginUserRow = {
  id?: unknown;
  role?: unknown;
  active?: unknown;
  approval_status?: unknown;
  tenant_id?: unknown;
};

function normalizeRpcRows(data: unknown): LoginUserRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter((r) => r != null && typeof r === "object") as LoginUserRow[];
  }
  if (typeof data === "object") return [data as LoginUserRow];
  return [];
}

/**
 * SUNUCU-TARAFI credential doğrulaması — `login_user` RPC (bcrypt/pgcrypto,
 * SECURITY DEFINER; anon/authenticated/service_role EXECUTE grant'lı).
 *
 * e-posta + şifre geçerliyse doğrulanmış kullanıcıyı döndürür; aksi halde null.
 * Login formuyla birebir parite: e-posta lower(btrim), şifre btrim (RPC de btrim).
 *
 * NOT: active/approval FİLTRELENMEZ (RPC satır döndürür); çağıran route
 * mevcut politikaya göre (active zorunlu) karar verir.
 */
export async function verifyLoginCredentials(
  db: SupabaseClient,
  email: string,
  password: string,
): Promise<VerifiedCredentialUser | null> {
  const normEmail = (email ?? "").trim().toLowerCase();
  const normPassword = (password ?? "").trim();
  if (!normEmail || !normPassword) return null;

  const { data, error } = await db.rpc("login_user", {
    p_email: normEmail,
    p_password: normPassword,
  });
  if (error) return null;

  const row = normalizeRpcRows(data)[0];
  if (!row || row.id == null || String(row.id).length === 0) return null;

  return {
    userId: String(row.id),
    active: row.active === true,
    approvalStatus: String(row.approval_status ?? ""),
    role: String(row.role ?? ""),
    tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
  };
}

/**
 * admin-session için güvenilir kimlik: bir ADMIN cookie'si yalnızca, geçerli
 * (aktif) bir OTURUM TOKEN'ının sahibi role='admin' + active=true bir kullanıcıysa
 * verilir. Oturum token'ının kendisi artık credential-gated `/api/auth/session`
 * ile üretildiğinden, bu, önceden yapılmış gerçek kimlik doğrulamasının
 * server-side kanıtıdır. Çıplak adminUserId'ye ASLA güvenilmez.
 *
 * Token yoksa/pasifse veya sahibi admin değilse null döner.
 */
export async function resolveAdminUserIdFromSessionToken(
  db: SupabaseClient,
  sessionToken: string,
): Promise<string | null> {
  const token = (sessionToken ?? "").trim();
  if (!token) return null;

  const userId = await getActiveSessionUserId(db, token);
  if (!userId) return null;

  const { data, error } = await db
    .from("users")
    .select("id, role, active")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || data.role !== "admin" || data.active !== true) return null;
  return String(data.id);
}
