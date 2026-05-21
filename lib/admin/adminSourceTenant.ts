import {
  isAdminUser,
  readYasamUser,
  syncYasamUserFromDb,
} from "@/lib/auth/yasamUser";

/** Admin import ve veri paylaşımı — kaynak tenant yok / geçersiz */
export const ADMIN_SOURCE_TENANT_MISSING_MESSAGE =
  "Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.";

/** Kaynak admin kütüphanesinde seçilen gruplar için aktarılacak kayıt yok */
export const EMPTY_SOURCE_ADMIN_MESSAGE =
  "Admin kütüphanesinde aktarılacak kayıt bulunamadı.";

/**
 * Giriş yapan adminin güncel users.tenant_id değeri.
 * localStorage yasam_user → DB senkron (syncYasamUserFromDb).
 */
export async function resolveSourceAdminTenantId(): Promise<{
  tenantId: string | null;
  error?: string;
}> {
  const session = readYasamUser();
  if (!session) {
    return {
      tenantId: null,
      error: "Admin oturumu bulunamadı. Lütfen tekrar giriş yapın.",
    };
  }

  const user = (await syncYasamUserFromDb(session)) ?? session;

  if (!isAdminUser(user)) {
    return {
      tenantId: null,
      error: "Kaynak tenant yalnızca admin oturumundan alınır.",
    };
  }

  const tenantId = user.tenant_id?.trim() || null;
  if (!tenantId) {
    return {
      tenantId: null,
      error: ADMIN_SOURCE_TENANT_MISSING_MESSAGE,
    };
  }

  return { tenantId };
}
