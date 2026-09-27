"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ModuleAccessDenied from "@/components/auth/ModuleAccessDenied";
import ModuleAccessPending from "@/components/auth/ModuleAccessPending";
import {
  evaluateRouteModuleGuard,
  findRouteModuleRule,
  type RouteModuleGuardDecision,
} from "@/lib/auth/routeModuleAccess";
import {
  backgroundSyncYasamUserFromDb,
  readYasamUser,
  syncYasamUserFromDb,
} from "@/lib/auth/yasamUser";

type ModuleRouteGuardProps = {
  children: ReactNode;
};

export default function ModuleRouteGuard({ children }: ModuleRouteGuardProps) {
  const pathname = usePathname();
  const [decision, setDecision] = useState<RouteModuleGuardDecision>("skip");
  const [denyReason, setDenyReason] = useState<"permission" | "membership">(
    "permission",
  );
  // K-1: Yetki DB ile kesinleşene kadar "deny" ekranı GÖSTERİLMEZ. Cache belirsizken
  // (henüz modül bilgisi senkronlanmamış) reddetmek yerine bekletiriz; böylece mobil
  // soğuk açılışta "Yetkiniz Bulunmuyor" ekranı yanıp sönmez.
  const [resolved, setResolved] = useState(false);
  // FLASH-GUARD (KAJ-P1-04): kararın HANGİ path için verildiğini izler. Modül-gate'li bir
  // route'ta karar bu path için verilene kadar children RENDER EDİLMEZ (aşağıdaki render
  // kapısı). Böylece hem soğuk açılış/direct-URL hem SPA navigasyonunda ilk paint'te
  // korumalı içerik "flash" edip sonra deny'a dönmez (izinsiz uzmana içerik sızıntısı yok).
  const [decidedPath, setDecidedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const path = pathname ?? "/";
    const rule = findRouteModuleRule(path);

    if (!rule) {
      setDecision("skip");
      setResolved(true);
      setDecidedPath(path);
      return;
    }

    const cached = readYasamUser();
    const initial = evaluateRouteModuleGuard(path, cached);
    setDecision(initial);
    setDenyReason(
      initial === "deny_membership" ? "membership" : "permission",
    );
    // Cache erişime izin veriyorsa (allow/skip) anında göster — ekstra gecikme yok.
    // Cache belirsiz/deny ise, DB doğrulaması bitene kadar "resolved" false kalır.
    setResolved(initial === "allow" || initial === "skip");
    setDecidedPath(path);

    if (!cached) {
      // Oturum yoksa üst katmanlar zaten girişe yönlendirir; kararı kesinleştir.
      setResolved(true);
      setDecidedPath(path);
      return;
    }

    backgroundSyncYasamUserFromDb(cached);

    void syncYasamUserFromDb(cached).then((fresh) => {
      if (cancelled) return;
      if (fresh) {
        const next = evaluateRouteModuleGuard(path, fresh);
        setDecision(next);
        setDenyReason(next === "deny_membership" ? "membership" : "permission");
      }
      // Sync başarılı da olsa (fresh null da olsa) yetki artık kesinleşti.
      setResolved(true);
      setDecidedPath(path);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const path = pathname ?? "/";
  const hasRule = findRouteModuleRule(path) !== null;
  const isDeny = decision === "deny" || decision === "deny_membership";

  // FLASH-GUARD (KAJ-P1-04): Modül-gate'li route'ta karar BU path için kesinleşene kadar
  // (decidedPath !== path VEYA henüz resolved değil) children RENDER EDİLMEZ; nötr bekleme
  // gösterilir. Bu, ilk paint'te korumalı içeriğin flash edip deny'a dönmesini (izinsiz
  // uzmana sızıntı) engeller. Nötr ekran (deny değil) → K-1 mobil "yetkiniz yok" flaşı da
  // olmaz. SSR + ilk client render ikisi de bu daldan Pending döndüğü için hydration uyumlu.
  // Gate'siz (rule'suz) route'lar ETKİLENMEZ → children anında.
  if (hasRule && (decidedPath !== path || !resolved)) {
    return <ModuleAccessPending />;
  }
  if (isDeny) {
    return <ModuleAccessDenied reason={denyReason} />;
  }

  return <>{children}</>;
}
