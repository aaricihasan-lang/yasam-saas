import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import {
  hasAnyModulePermissionFlag,
  COMING_SOON_MODULE_KEYS,
  type ModulePermissionKey,
} from "@/lib/auth/modulePermissions";
import { isAdminUser, type YasamUser } from "@/lib/auth/yasamUser";

export type RouteModuleGuardDecision =
  | "skip"
  | "allow"
  | "deny"
  | "deny_membership";

type RouteModuleRule = {
  prefix: string;
  keys: string[];
};

/** Uzun eşleşme önce (alt yollar için) */
const ROUTE_MODULE_RULES: RouteModuleRule[] = [
  {
    prefix: "/dashboard/clients",
    keys: ["clients", "danisan_yonetimi"],
  },
  {
    prefix: "/dashboard/ajanda",
    keys: ["appointments", "ajanda"],
  },
  {
    prefix: "/dashboard/biyoenerji",
    keys: ["energy_body", "biyoenerji"],
  },
  {
    prefix: "/dashboard/kisisel-arsiv",
    keys: ["personal_archive", "kisisel_arsiv"],
  },
  {
    prefix: "/dashboard/refleksoloji",
    keys: ["reflexology", "refleksoloji"],
  },
  {
    prefix: "/dashboard/numeroloji-test",
    keys: ["numerology", "numeroloji"],
  },
  { prefix: "/numeroloji", keys: ["numerology", "numeroloji"] },
  { prefix: "/refleksoloji", keys: ["reflexology", "refleksoloji"] },
  { prefix: "/aromaterapi", keys: ["aromatherapy", "aromaterapi"] },
  { prefix: "/dogaltas", keys: ["stones", "dogaltas"] },
  {
    // Enerji & Beden artık yalnız Biyoenerji + Refleksoloji + Kupa ailesini temsil eder.
    // Aromaterapi Doğal Destek & Rehber'e taşındı → aromatherapy/aromaterapi kaldırıldı.
    // NOT: cupping BİLİNÇLİ olarak eklenMEDİ (ayrı /kupa access konusu; bu iş kapsamı dışı).
    prefix: "/enerji-beden",
    keys: [
      "energy_body",
      "biyoenerji",
      "reflexology",
      "refleksoloji",
    ],
  },
  {
    // Doğal Destek & Rehber: Aromaterapi VEYA Şifa Rehberi izni olan uzman girebilir (OR).
    // hasAnyModulePermissionFlag zaten OR uygular; ikisi de yoksa evaluateRouteModuleGuard "deny".
    prefix: "/dogal-destek",
    keys: ["aromatherapy", "aromaterapi", "sifa_rehberi", "healing"],
  },
  { prefix: "/danisan-yolculugu", keys: ["clients", "danisan_yonetimi"] },
  { prefix: "/urun-stok", keys: ["stok", "stock"] },
  { prefix: "/sifa-rehberi", keys: ["sifa_rehberi", "healing"] },
  { prefix: "/video-ceviri", keys: ["video_ceviri"] },
  { prefix: "/belge-ceviri", keys: ["belge_ceviri"] },
  { prefix: "/human-design", keys: ["human_design"] },
  { prefix: "/yasam-hafizasi", keys: ["yasam_hafizasi"] },
].sort((a, b) => b.prefix.length - a.prefix.length);

const PUBLIC_EXACT_PATHS = new Set(["/"]);

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return trimmed.toLowerCase();
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/register")) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function findRouteModuleRule(pathname: string): RouteModuleRule | null {
  const path = normalizePathname(pathname);
  for (const rule of ROUTE_MODULE_RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule;
    }
  }
  return null;
}

/**
 * YALNIZ admin (role='admin') erişebilen route prefix'leri. Modül-izin sistemi
 * DIŞINDADIR — hiçbir uzmana açılmaz ve hiçbir ModulePermissionKey'e bağlı değildir.
 * YEBS admin-only read-only uzman vitrini (/yebs) buradadır. Bu bir defense-in-depth
 * client kapısıdır; gerçek veri güvenliği server-side verifyAdminRequest'tir.
 */
const ADMIN_ONLY_ROUTE_PREFIXES = ["/yebs"] as const;

export function isAdminOnlyRoutePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return ADMIN_ONLY_ROUTE_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

export function canExpertAccessRoutePath(
  user: YasamUser | null | undefined,
  pathname: string,
): boolean {
  if (!user) return true;
  if (isAdminUser(user)) return true;

  // Admin-only route'lar (ör. /yebs) uzmanlara KAPALI — modül izninden bağımsız.
  if (isAdminOnlyRoutePath(pathname)) return false;

  const rule = findRouteModuleRule(pathname);
  if (!rule) return true;

  if (rule.keys.some((k) => COMING_SOON_MODULE_KEYS.has(k as ModulePermissionKey))) return false;

  return hasAnyModulePermissionFlag(user, rule.keys);
}

export function evaluateRouteModuleGuard(
  pathname: string,
  user: YasamUser | null | undefined,
): RouteModuleGuardDecision {
  const path = normalizePathname(pathname);

  if (isPublicPath(path) || isAdminPath(path)) return "skip";
  if (!user) return "skip";

  if (isAdminUser(user)) return "allow";

  // Admin-only route'lar (ör. /yebs) uzmanlara KAPALI — modül izninden bağımsız.
  if (isAdminOnlyRoutePath(path)) return "deny";

  const rule = findRouteModuleRule(path);
  if (!rule) return "allow";

  if (rule.keys.some((k) => COMING_SOON_MODULE_KEYS.has(k as ModulePermissionKey))) return "deny";

  if (!hasExpertMembershipAccess(user)) return "deny_membership";

  return hasAnyModulePermissionFlag(user, rule.keys) ? "allow" : "deny";
}

/** Panel kartı anahtarı → route prefix (test / yardımcı) */
export const MODULE_KEY_TO_ROUTE_PREFIX: Partial<
  Record<ModulePermissionKey | string, string>
> = {
  numerology: "/numeroloji",
  stones: "/dogaltas",
  clients: "/dashboard/clients",
  appointments: "/dashboard/ajanda",
  energy_body: "/dashboard/biyoenerji",
  personal_archive: "/dashboard/kisisel-arsiv",
  sifa_rehberi: "/sifa-rehberi",
  stok: "/urun-stok",
  healing: "/sifa-rehberi",
  stock: "/urun-stok",
  reflexology: "/refleksoloji",
  aromatherapy: "/aromaterapi",
  video_ceviri: "/video-ceviri",
  belge_ceviri: "/belge-ceviri",
  human_design: "/human-design",
  yasam_hafizasi: "/yasam-hafizasi",
};
