/**
 * lib/backup/guardContext.ts — Oturum guard'ından geri yükleme bağlamı (SUNUCU).
 */
import type { UserGuardOk } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import type { RestoreContext } from "./engine";

/**
 * guard `verifyUserRequest(req, { includeProfile: true })` ile alınmış olmalı (role,
 * module_permissions ve üyelik alanları profil whitelist'inde).
 */
export function restoreContextFrom(guard: UserGuardOk): RestoreContext {
  const profile = guard.profile ?? {};
  return {
    tenantId: guard.tenantId,
    userId: guard.userId,
    role: profile.role,
    modulePermissions: profile.module_permissions,
    membershipActive: hasMembershipAccessForRow(profile),
  };
}
