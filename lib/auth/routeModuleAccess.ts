import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import {
  hasAnyModulePermissionFlag,
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
    prefix: "/enerji-beden",
    keys: [
      "energy_body",
      "biyoenerji",
      "reflexology",
      "refleksoloji",
      "aromatherapy",
      "aromaterapi",
    ],
  },
  { prefix: "/danisan-yolculugu", keys: ["clients", "danisan_yonetimi"] },
  { prefix: "/urun-stok", keys: ["stok", "stock"] },
  { prefix: "/sifa-rehberi", keys: ["sifa_rehberi", "healing"] },
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

export function canExpertAccessRoutePath(
  user: YasamUser | null | undefined,
  pathname: string,
): boolean {
  if (!user) return true;
  if (isAdminUser(user)) return true;

  const rule = findRouteModuleRule(pathname);
  if (!rule) return true;

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

  const rule = findRouteModuleRule(path);
  if (!rule) return "allow";

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
};
