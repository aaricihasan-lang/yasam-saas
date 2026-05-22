import type { YasamUser } from "@/lib/auth/yasamUser";

function isAdminRole(user: YasamUser | null | undefined): boolean {
  return String(user?.role ?? "").trim().toLowerCase() === "admin";
}

export type ModulePermissionKey =
  | "clients"
  | "appointments"
  | "numerology"
  | "stones"
  | "stok"
  | "sifa_rehberi"
  | "energy_body"
  | "personal_archive";

export type ModulePermissions = Record<ModulePermissionKey, boolean>;

export const MODULE_PERMISSION_KEYS: ModulePermissionKey[] = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "stok",
  "sifa_rehberi",
  "energy_body",
  "personal_archive",
];

export const MODULE_PERMISSION_LABELS: Record<ModulePermissionKey, string> = {
  clients: "Danışan Yolculuğu",
  appointments: "Ajanda",
  numerology: "Numeroloji",
  stones: "Doğaltaş",
  stok: "Ürün & Stok Merkezi",
  sifa_rehberi: "Şifa Rehberi",
  energy_body: "Enerji & Beden",
  personal_archive: "Kişisel Arşiv",
};

export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  clients: false,
  appointments: false,
  numerology: false,
  stones: false,
  stok: false,
  sifa_rehberi: false,
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
  "stock",
  "healing",
] as const;

export const LOCKED_PERMISSION_TOAST =
  "Bu modül hesabınız için aktif değil. Yönetici ile iletişime geçin.";

/** Premium uzman — admin hariç otomatik açık modül anahtarları (UI + DB alias) */
export const PREMIUM_EXPERT_MODULE_KEYS = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "stok",
  "sifa_rehberi",
  "reflexology",
  "energy_body",
  "aromatherapy",
  "personal_archive",
  "danisan_yonetimi",
  "ajanda",
  "numeroloji",
  "dogaltas",
  "refleksoloji",
  "biyoenerji",
  "aromaterapi",
  "kisisel_arsiv",
  "stock",
  "healing",
] as const;

const PREMIUM_EXPERT_MODULE_KEY_SET = new Set<string>(PREMIUM_EXPERT_MODULE_KEYS);

/** Ana panelde Premium ile gösterilecek kartlar */
export const PREMIUM_HOME_MODULE_KEYS: ModulePermissionKey[] = [
  "clients",
  "stones",
  "stok",
  "sifa_rehberi",
  "energy_body",
  "personal_archive",
  "numerology",
];

export function isPremiumExpertUser(
  user: YasamUser | null | undefined,
): boolean {
  if (!user) return false;
  if (isAdminRole(user)) return false;
  const pkg = String(user.package_type ?? user.plan ?? "")
    .trim()
    .toLowerCase();
  return pkg === "premium";
}

export function isPremiumModuleAccessKey(key: string): boolean {
  return PREMIUM_EXPERT_MODULE_KEY_SET.has(key);
}

export function buildPremiumModulePermissionsPayload(): Record<string, boolean> {
  const payload: Record<string, boolean> = {};
  for (const key of PREMIUM_EXPERT_MODULE_KEYS) {
    payload[key] = true;
  }
  return payload;
}

export function parseModulePermissions(raw: unknown): ModulePermissions {
  const perms = { ...DEFAULT_MODULE_PERMISSIONS };
  if (!raw || typeof raw !== "object") return perms;
  const row = raw as Record<string, unknown>;
  for (const key of MODULE_PERMISSION_KEYS) {
    if (typeof row[key] === "boolean") perms[key] = row[key];
  }
  if (row.stock === true) perms.stok = true;
  if (row.healing === true) perms.sifa_rehberi = true;
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
  if (isPremiumExpertUser(user)) {
    return keys.some((key) => isPremiumModuleAccessKey(key));
  }
  const flags = getModulePermissionFlags(user);
  return keys.some((key) => flags[key] === true);
}

export function hasModulePermission(
  user: YasamUser | null | undefined,
  key: ModulePermissionKey,
): boolean {
  if (!user) return false;
  if (isAdminRole(user)) return true;
  if (isPremiumExpertUser(user)) {
    return isPremiumModuleAccessKey(key);
  }
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
