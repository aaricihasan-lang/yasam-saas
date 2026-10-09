// NUMEROLOJİ — "Gelecek Yılları Göster" alt-yetkisi (module_permissions.numerology_future_years).
//
// Tek kaynak yetki kararı: numerology modülü (TR alias dahil, sunucu kapısıyla aynı
// resolveModuleAccess) + numerology_future_years alt-yetkisi BİRLİKTE gerekir; admin her zaman
// (hd_system_reading ile aynı model). Sunucu bu fonksiyonu DOĞRULANMIŞ profil
// (verifyUserRequest/requireModuleAccess) ile çağırır; istemcinin gönderdiği hiçbir değer yetki
// sayılmaz. Eksik / false / string "true" → KAPALI (fail-closed).

import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";

export const NUMEROLOGY_FUTURE_YEARS_KEY = "numerology_future_years" as const;

export function canSeeNumerologyFutureYears(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile) return false;
  const moduleOpen = resolveModuleAccess(profile.role, profile.module_permissions, "numerology", {
    isDemo: profile.is_demo_account === true,
  });
  return moduleOpen && hasModulePermissionForProfile(profile, NUMEROLOGY_FUTURE_YEARS_KEY);
}
