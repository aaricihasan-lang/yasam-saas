import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isAstrologyModuleEnabled } from "@/lib/astrology/config";

/**
 * Astroloji UZMAN sayfası kabuğu (Aşama 7C) — Server Component.
 *
 *   1) Kill switch (ASTROLOGY_MODULE_ENABLED === "true") kapalıysa DB'ye gitmeden notFound().
 *   2) Modül yetkisi: oturum localStorage'da olduğundan (refleksoloji/HD ile aynı mimari) sayfa kapısı
 *      istemcidedir — genel ModuleRouteGuard (routeModuleAccess: /astroloji → astrology) + sayfanın
 *      sunucu erişim yoklaması (/api/astroloji/access; yetkisizde "Yetkiniz Bulunmuyor").
 *   3) Veri yetkisi HER API çağrısında sunucuda verilir (requireAstrologyAccess; doğrudan URL/API
 *      yetkisizde tek tip 404). Bu kabuk o kapının yerine geçmez.
 * Owner'ın admin kabuğu (/admin/astroloji) ayrıca server-side owner kapısıyla korunur.
 */
export default function AstrologyExpertLayout({ children }: { children: ReactNode }) {
  if (!isAstrologyModuleEnabled()) notFound();
  return <>{children}</>;
}

export const dynamic = "force-dynamic";
