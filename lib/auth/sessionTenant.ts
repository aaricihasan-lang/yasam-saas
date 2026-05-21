import {
  readYasamUser,
  syncYasamUserFromDb,
  type YasamUser,
} from "@/lib/auth/yasamUser";

/** Admin kütüphane / toplu import varsayılan tenant (yalnızca admin aktarım kaynağı) */
export const ADMIN_LIBRARY_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export const MISSING_SESSION_TENANT_MESSAGE =
  "Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.";

/** Oturumdaki kullanıcının çalışma alanı — localStorage yasam_user (senkron, önbellek) */
export function getSessionTenantId(): string | null {
  const tenantId = readYasamUser()?.tenant_id?.trim();
  return tenantId || null;
}

/** Veri çekmeden önce: DB'den güncel kullanıcı + tenant_id */
export async function getSyncedTenantId(): Promise<string | null> {
  const user = await syncYasamUserFromDb();
  return user?.tenant_id?.trim() || null;
}

/** Veri çekmeden önce: güncel oturum kullanıcısı */
export async function getSyncedYasamUser(): Promise<YasamUser | null> {
  return syncYasamUserFromDb();
}
