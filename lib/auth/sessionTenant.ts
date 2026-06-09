import {
  backgroundSyncYasamUserFromDb,
  readYasamUser,
  syncYasamUserFromDb,
  type YasamUser,
} from "@/lib/auth/yasamUser";

/** Admin kütüphane / toplu import varsayılan tenant (yalnızca admin aktarım kaynağı) */
export const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

export const MISSING_SESSION_TENANT_MESSAGE =
  "Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.";

/** Oturumdaki kullanıcının çalışma alanı — localStorage yasam_user (senkron, önbellek) */
export function getSessionTenantId(): string | null {
  const tenantId = readYasamUser()?.tenant_id?.trim();
  return tenantId || null;
}

/** Veri çekmeden önce: önce localStorage, arka planda DB senkron */
export async function getSyncedTenantId(): Promise<string | null> {
  const cached = readYasamUser();
  const tid = cached?.tenant_id?.trim();
  if (cached) {
    backgroundSyncYasamUserFromDb(cached);
    if (tid) return tid;
  }
  const user = await syncYasamUserFromDb(cached);
  return user?.tenant_id?.trim() || null;
}

/** Veri çekmeden önce: önce önbellek, gerekirse DB */
export async function getSyncedYasamUser(): Promise<YasamUser | null> {
  const cached = readYasamUser();
  if (cached) {
    backgroundSyncYasamUserFromDb(cached);
    return cached;
  }
  return syncYasamUserFromDb();
}
