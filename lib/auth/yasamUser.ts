/** Oturum — Supabase `login_user` RPC / users tablosundan gelen rol ile */

import { supabase } from "@/lib/supabase";
import {
  parseModulePermissions,
  type ModulePermissions,
} from "@/lib/auth/modulePermissions";

export type UserRole = "admin" | "expert";

export type SubscriptionStatus = "active" | "trial" | "passive" | string;

export type ApprovalStatus = "pending" | "approved" | "rejected" | string;

export type YasamUser = {
  id: string;
  tenant_id?: string;
  full_name?: string;
  name?: string;
  email?: string;
  role: UserRole;
  status?: string;
  plan?: string;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string;
  approval_status?: ApprovalStatus;
  active?: boolean;
  module_permissions?: ModulePermissions;
};

const LOCKED_SUBSCRIPTION_TOAST =
  "Üyeliğiniz aktif değil. Yönetici ile iletişime geçin.";

export const PENDING_APPROVAL_MESSAGE =
  "Hesabınız yönetici onayı bekliyor.";

const STORAGE_KEY = "yasam_user";

export function normalizeRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isAllowedLoginRole(role: unknown): role is UserRole {
  const r = normalizeRole(role);
  return r === "admin" || r === "expert";
}

/** login_user RPC satırı veya localStorage kaydını doğrular */
export function parseLoginUserRecord(raw: unknown): YasamUser | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const role = normalizeRole(r.role);
  if (role !== "admin" && role !== "expert") return null;
  const id = r.id != null ? String(r.id).trim() : "";
  if (!id) return null;

  const fullNameFromRow =
    r.full_name ?? r.fullName ?? null;
  const nameRaw = r.name != null ? String(r.name).trim() : "";
  const fullName =
    fullNameFromRow != null
      ? String(fullNameFromRow).trim()
      : nameRaw && !nameRaw.includes("@")
        ? nameRaw
        : undefined;

  return {
    id,
    tenant_id: r.tenant_id != null ? String(r.tenant_id) : undefined,
    full_name: fullName || undefined,
    name: nameRaw || undefined,
    email: r.email != null ? String(r.email).trim() : undefined,
    role,
    status: r.status != null ? String(r.status) : undefined,
    plan: r.plan != null ? String(r.plan).trim() : undefined,
    subscription_status:
      r.subscription_status != null
        ? String(r.subscription_status).trim().toLowerCase()
        : undefined,
    trial_ends_at:
      r.trial_ends_at != null ? String(r.trial_ends_at).trim() : undefined,
    approval_status:
      r.approval_status != null
        ? String(r.approval_status).trim().toLowerCase()
        : undefined,
    active: parseActiveFlag(r.active),
    module_permissions: parseModulePermissions(r.module_permissions),
  };
}

function parseActiveFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === "true" || value === "t") {
    return true;
  }
  if (value === false || value === 0 || value === "false" || value === "f") {
    return false;
  }
  return undefined;
}

export function normalizeApprovalStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Admin hariç giriş: active ve onay kontrolü */
export function canLoginYasamUser(
  user: YasamUser,
): { allowed: true } | { allowed: false; message: string } {
  if (isAdminUser(user)) return { allowed: true };
  if (user.active !== true) {
    return { allowed: false, message: PENDING_APPROVAL_MESSAGE };
  }
  const approval = normalizeApprovalStatus(user.approval_status);
  if (approval === "approved") return { allowed: true };
  if (!approval && user.active === true) {
    return { allowed: true };
  }
  return { allowed: false, message: PENDING_APPROVAL_MESSAGE };
}

export function normalizeSubscriptionStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Deneme süresi geçerli mi (trial_ends_at şu anki zamandan sonra) */
export function isTrialSubscriptionActive(trialEndsAt: string | undefined): boolean {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/** Ana panel modüllerine tam erişim (admin her zaman açık) */
export function hasFullPanelAccess(user: YasamUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;

  const status = normalizeSubscriptionStatus(user.subscription_status);

  if (status === "active") return true;
  if (status === "passive") return false;
  if (status === "trial") return isTrialSubscriptionActive(user.trial_ends_at);

  return false;
}

export { LOCKED_SUBSCRIPTION_TOAST };

export function readYasamUser(): YasamUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const user = parseLoginUserRecord(JSON.parse(raw));
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return user;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveYasamUser(user: YasamUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearYasamUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function isAdminUser(user: YasamUser | null | undefined): boolean {
  return normalizeRole(user?.role) === "admin";
}

/** Hero / panel başlığı: full_name → name → email → varsayılan */
export function getYasamUserDisplayName(
  user: YasamUser | null | undefined,
): string {
  if (!user) return "Uzman Paneli";
  const fullName = user.full_name?.trim();
  if (fullName) return fullName;
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return "Uzman Paneli";
}

export function isExpertUser(user: YasamUser | null | undefined): boolean {
  return normalizeRole(user?.role) === "expert";
}

/** login_user RPC eksik alanları users tablosundan tamamlar */
export async function enrichYasamUserProfile(user: YasamUser): Promise<YasamUser> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "full_name, approval_status, active, module_permissions, subscription_status, trial_ends_at, plan",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Kullanıcı profili yüklenemedi:", error);
    return user;
  }

  if (!data) return user;

  const row = data as Record<string, unknown>;
  const fullNameDb =
    row.full_name != null ? String(row.full_name).trim() : "";

  return {
    ...user,
    full_name: user.full_name?.trim() || fullNameDb || user.full_name,
    approval_status:
      row.approval_status != null
        ? String(row.approval_status).trim().toLowerCase()
        : user.approval_status,
    active:
      parseActiveFlag(row.active) !== undefined
        ? parseActiveFlag(row.active)
        : user.active,
    module_permissions: parseModulePermissions(
      row.module_permissions ?? user.module_permissions,
    ),
    subscription_status:
      row.subscription_status != null
        ? String(row.subscription_status).trim().toLowerCase()
        : user.subscription_status,
    trial_ends_at:
      row.trial_ends_at != null
        ? String(row.trial_ends_at).trim()
        : user.trial_ends_at,
    plan: row.plan != null ? String(row.plan).trim() : user.plan,
  };
}

/** @deprecated enrichYasamUserProfile kullanın */
export async function enrichYasamUserFullName(
  user: YasamUser,
): Promise<YasamUser> {
  return enrichYasamUserProfile(user);
}
