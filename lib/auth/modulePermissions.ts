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
  | "personal_archive"
  | "video_ceviri"
  | "belge_ceviri"
  | "ders_notu"
  | "human_design"
  | "digital_content"
  | "cosmic_calendar"
  | "yasam_hafizasi";

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
  "video_ceviri",
  "belge_ceviri",
  "ders_notu",
  "human_design",
  "digital_content",
  "cosmic_calendar",
  "yasam_hafizasi",
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
  video_ceviri: "Video → Türkçe Dönüşüm",
  belge_ceviri: "Belge Çeviri Merkezi",
  ders_notu: "Temizlenmiş Ders Notu Merkezi",
  human_design: "Human Design",
  digital_content: "Dijital İçerik Merkezi",
  cosmic_calendar: "Yaşam Takvimi / Kozmik Ajanda",
  yasam_hafizasi: "Yaşam Hafızası",
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
  video_ceviri: false,
  belge_ceviri: false,
  ders_notu: false,
  human_design: false,
  digital_content: false,
  cosmic_calendar: false,
  yasam_hafizasi: false,
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
  "video_ceviri",
  "belge_ceviri",
  "ders_notu",
  "digital_content",
  "cosmic_calendar",
  "human_design",
  // yasam_hafizasi BİLİNÇLİ olarak BURADA YOKTUR: YH izni yalnız ATOMİK premium-grade sözleşmesinden
  // verilir (public.yh_grade_expert_premium → lib/yasam-hafizasi/expertPremiumGrant); membership +
  // perm + flags TEK transaction. Aksi halde düz premium payload'ı perm'i tenant flag'i OLMADAN set
  // eder → permission/flags PARTIAL riski. DEFAULT_MODULE_PERMISSIONS da fail-closed false kalır.
  // human_design ise normal bir modüldür: Premium payload'ına dahildir → yeni Premium geçişlerinde
  // module_permissions.human_design=true üretilir (mevcut Premium'lar migration ile backfill).
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
  "digital_content",
  "numerology",
  "cosmic_calendar",
  "human_design",
];

/**
 * Yakında açılacak modüller — admin hariç herkes için kilitli (izin verilmiş olsa dahi).
 * Human Design ARTIK burada DEĞİLDİR: normal module_permissions.human_design kontratıyla
 * (Premium + active + approved + izin) erişilir. Bu abstraction başka modüller için korunur.
 */
export const COMING_SOON_MODULE_KEYS = new Set<ModulePermissionKey>([]);

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
  // P3: Premium otomatik-tüm-modül BYPASS'ı KALDIRILDI. Erişim yalnız kişiye özel
  // module_permissions'a dayanır (mevcut Premium izinleri migration 20260919 ile
  // backfill edildi). Server tarafı ayrıca lib/auth/moduleAccess ile zorlanır.
  const flags = getModulePermissionFlags(user);
  return keys.some((key) => flags[key] === true);
}

export function hasModulePermission(
  user: YasamUser | null | undefined,
  key: ModulePermissionKey,
): boolean {
  if (!user) return false;
  if (isAdminRole(user)) return true;
  if (key === "cosmic_calendar") return true;
  // P3: Premium bypass KALDIRILDI (bkz. hasAnyModulePermissionFlag notu).
  const perms = user.module_permissions ?? DEFAULT_MODULE_PERMISSIONS;
  // Hub kartı: alt modüllerden herhangi birine izin varsa erişilebilir
  if (key === "digital_content") {
    return Boolean(
      perms.personal_archive ||
      perms.video_ceviri ||
      perms.belge_ceviri ||
      perms.ders_notu,
    );
  }
  return Boolean(perms[key]);
}

export type ModuleLockReason = "subscription" | "permission" | "coming_soon" | null;

export function getModuleLockReason(
  user: YasamUser | null | undefined,
  key: ModulePermissionKey,
  hasHref: boolean,
  subscriptionOpen: boolean,
): ModuleLockReason {
  if (!hasHref) return null;
  // Yakında modüller: admin hariç herkes için kilitli (izin verilmiş olsa dahi)
  if (COMING_SOON_MODULE_KEYS.has(key) && !isAdminRole(user)) {
    return "coming_soon";
  }
  if (!subscriptionOpen) return "subscription";
  if (!hasModulePermission(user, key)) return "permission";
  return null;
}

/**
 * Server-side modül kapısı: `verifyUserRequest(req, { includeProfile: true })`'in
 * döndürdüğü gevşek `profile` kaydından merkezî `hasModulePermission` mantığını
 * yeniden kullanır (ayrı bir izin mantığı YAZILMAZ). Yalnız hasModulePermission'ın
 * okuduğu alanlar (role/admin_level/package_type/plan/module_permissions) kullanılır.
 */
export function hasModulePermissionForProfile(
  profile: Record<string, unknown> | null | undefined,
  key: ModulePermissionKey,
): boolean {
  if (!profile) return false;
  const user = {
    role: typeof profile.role === "string" ? profile.role : "",
    admin_level: typeof profile.admin_level === "string" ? profile.admin_level : undefined,
    package_type: typeof profile.package_type === "string" ? profile.package_type : undefined,
    plan: typeof profile.plan === "string" ? profile.plan : undefined,
    membership_status:
      typeof profile.membership_status === "string" ? profile.membership_status : undefined,
    module_permissions: parseModulePermissions(profile.module_permissions),
  } as unknown as YasamUser;
  return hasModulePermission(user, key);
}
