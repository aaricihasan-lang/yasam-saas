/**
 * USAGE360 — ROTA → MODÜL çözümü (istemci; allowlist).
 *
 * Ham pathname telemetriye ASLA gönderilmez; yalnız buradan çıkan kanonik modül anahtarı
 * (ModuleGateKey) gider. Kaynak: mevcut route-guard kuralları (findRouteModuleRule) —
 * ayrı bir rota listesi tutulmaz. Birden çok modülü kapsayan hub sayfaları (Enerji & Beden,
 * Doğal Destek) tek modüle atfedilmez → null (hub süresi hiçbir modüle yazılmaz).
 */
import { findRouteModuleRule } from "@/lib/auth/routeModuleAccess";
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";
import { isUsageModuleKey } from "@/lib/usage/usageTaxonomy";

/** Route-guard kuralında olmayan ama kendi sayfası olan modüller (sunucu kapısı ayrı). */
const EXTRA_USAGE_ROUTES: { prefix: string; module: ModuleGateKey }[] = [
  { prefix: "/beslenme", module: "beslenme" },
];

/** Tek modüle atfedilemeyen çok-modüllü hub sayfaları. */
const MULTI_MODULE_HUB_PREFIXES = new Set(["/enerji-beden", "/dogal-destek"]);

export function resolveUsageModuleFromPath(pathname: string | null | undefined): ModuleGateKey | null {
  const path = String(pathname ?? "").split(/[?#]/)[0] || "/";
  for (const r of EXTRA_USAGE_ROUTES) {
    if (path === r.prefix || path.startsWith(`${r.prefix}/`)) return r.module;
  }
  const rule = findRouteModuleRule(path);
  if (!rule) return null;
  if (rule.prefix === "/digital-content") return "digital_content";
  if (MULTI_MODULE_HUB_PREFIXES.has(rule.prefix)) return null;
  const key = rule.keys[0];
  return isUsageModuleKey(key) ? key : null;
}
