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

/** Admin paneli + Türkçe alias anahtarları (route guard / panel) */
export const EXTENDED_MODULE_PERMISSION_ALIASES = [
  "reflexology",
  "aromatherapy",
  "numeroloji",
  "dogaltas",
  "refleksoloji",
  "biyoenerji",
  "aromaterapi",
  "danisan_yonetimi",
  "ajanda",
  "kisisel_arsiv",
] as const;

export const LOCKED_PERMISSION_TOAST =
  "Bu modül hesabınız için aktif değil. Yönetici ile iletişime geçin.";

export function parseModulePermissions(raw: unknown): ModulePermissions {
  const perms = { ...DEFAULT_MODULE_PERMISSIONS };
  if (!raw || typeof raw !== "object") return perms;
  const row = raw as Record<string, unknown>;
  for (const key of MODULE_PERMISSION_KEYS) {
    if (typeof row[key] === "boolean") perms[key] = row[key];
  }
  const extended = perms as ModulePermissions & Record<string, boolean>;
  for (const key of EXTENDED_MODULE_PERMISSION_ALIASES) {
    if (typeof row[key] === "boolean") extended[key] = row[key];
  }
  return perms;
}

export function getModulePermissionFlags(
  user: YasamUser | null | undefined,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {
    ...(DEFAULT_MODULE_PERMISSIONS as Record<string, boolean>),
  };
  const perms = user?.module_permissions;
  if (!perms || typeof perms !== "object") return flags;
  for (const [key, value] of Object.entries(perms)) {
    if (typeof value === "boolean") flags[key] = value;
  }
  return flags;
}

export function hasAnyModulePermissionFlag(
  user: YasamUser | null | undefined,
  keys: string[],
): boolean {
  if (!user) return false;
  if (isAdminRole(user)) return true;
  const flags = getModulePermissionFlags(user);
  return keys.some((key) => flags[key] === true);
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
