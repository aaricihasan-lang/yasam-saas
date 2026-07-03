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

  useEffect(() => {
    let cancelled = false;

    const path = pathname ?? "/";
    const rule = findRouteModuleRule(path);

    if (!rule) {
      setDecision("skip");
      setResolved(true);
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

    if (!cached) {
      // Oturum yoksa üst katmanlar zaten girişe yönlendirir; kararı kesinleştir.
      setResolved(true);
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
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const isDeny = decision === "deny" || decision === "deny_membership";
  // Yetki henüz kesinleşmemişken reddi göstermek yerine nötr yükleniyor ekranı.
  if (isDeny && !resolved) {
    return <ModuleAccessPending />;
  }
  if (isDeny) {
    return <ModuleAccessDenied reason={denyReason} />;
  }

  return <>{children}</>;
}
