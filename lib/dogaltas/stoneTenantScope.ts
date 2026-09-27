import { ADMIN_LIBRARY_TENANT_ID } from "../tenancy/syntheticTenants";

/**
 * Doğaltaş taş OKUMA görünürlüğü — tek kaynak (list, detay, Word, koşul arama,
 * uyarılar aynı kuralı kullanır; kopya iş kuralı YOK).
 *
 *   - Admin/kütüphane tenant'ı  → yalnız kendi kütüphanesi.
 *   - Demo hesap                → kendi tenant'ı + Admin Kütüphanesi (showcase).
 *   - Normal uzman              → YALNIZ kendi tenant'ı. Kütüphane (veya başka
 *                                 tenant) taşının id'sini bilse bile okuyamaz.
 *
 * Yazma (PATCH/DELETE) bu helper'ı KULLANMAZ; daima `.eq("tenant_id", tenantId)`.
 */
export function stoneReadTenantIds(tenantId: string, isDemo: boolean): string[] {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return [tenantId];
  return isDemo ? [tenantId, ADMIN_LIBRARY_TENANT_ID] : [tenantId];
}
