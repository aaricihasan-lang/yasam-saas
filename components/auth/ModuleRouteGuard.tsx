"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ModuleAccessDenied from "@/components/auth/ModuleAccessDenied";
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

  useEffect(() => {
    let cancelled = false;

    const path = pathname ?? "/";
    const rule = findRouteModuleRule(path);

    if (!rule) {
      setDecision("skip");
      return;
    }

    const cached = readYasamUser();
    const initial = evaluateRouteModuleGuard(path, cached);
    setDecision(initial);
    setDenyReason(
      initial === "deny_membership" ? "membership" : "permission",
    );

    if (!cached) return;

    backgroundSyncYasamUserFromDb(cached);

    void syncYasamUserFromDb(cached).then((fresh) => {
      if (cancelled || !fresh) return;
      const next = evaluateRouteModuleGuard(path, fresh);
      setDecision(next);
      setDenyReason(next === "deny_membership" ? "membership" : "permission");
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (decision === "deny" || decision === "deny_membership") {
    return <ModuleAccessDenied reason={denyReason} />;
  }

  return <>{children}</>;
}
