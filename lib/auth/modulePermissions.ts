import type { YasamUser } from "@/lib/auth/yasamUser";

function isAdminRole(user: YasamUser | null | undefined): boolean {
  return String(user?.role ?? "").trim().toLowerCase() === "admin";
}

export type ModulePermissionKey =
  | "clients"
  | "appointments"
  | "numerology"
  | "stones"
  | "stock"
  | "healing"
  | "energy_body"
  | "personal_archive";

export type ModulePermissions = Record<ModulePermissionKey, boolean>;

export const MODULE_PERMISSION_KEYS: ModulePermissionKey[] = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "stock",
  "healing",
  "energy_body",
  "personal_archive",
];

export const MODULE_PERMISSION_LABELS: Record<ModulePermissionKey, string> = {
  clients: "Danışan Yolculuğu",
  appointments: "Ajanda",
  numerology: "Numeroloji",
  stones: "Doğaltaş",
  stock: "Ürün & Stok Merkezi",
  healing: "Şifa Rehberi",
  energy_body: "Enerji & Beden",
  personal_archive: "Kişisel Arşiv",
};

export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  clients: false,
  appointments: false,
  numerology: false,
  stones: false,
  stock: false,
  healing: false,
  energy_body: false,
  personal_archive: false,
};

export const LOCKED_PERMISSION_TOAST =
  "Bu modül hesabınız için aktif değil. Yönetici ile iletişime geçin.";

export function parseModulePermissions(raw: unknown): ModulePermissions {
  const perms = { ...DEFAULT_MODULE_PERMISSIONS };
  if (!raw || typeof raw !== "object") return perms;
  const row = raw as Record<string, unknown>;
  for (const key of MODULE_PERMISSION_KEYS) {
    if (typeof row[key] === "boolean") perms[key] = row[key];
  }
  return perms;
}

export function hasModulePermission(
  user: YasamUser | null | undefined,
  key: ModulePermissionKey,
): boolean {
  if (!user) return false;
  if (isAdminRole(user)) return true;
  const perms = user.module_permissions ?? DEFAULT_MODULE_PERMISSIONS;
  return Boolean(perms[key]);
}

export type ModuleLockReason = "subscription" | "permission" | null;

export function getModuleLockReason(
  user: YasamUser | null | undefined,
  key: ModulePermissionKey,
  hasHref: boolean,
  subscriptionOpen: boolean,
): ModuleLockReason {
  if (!hasHref) return null;
  if (!subscriptionOpen) return "subscription";
  if (!hasModulePermission(user, key)) return "permission";
  return null;
}
