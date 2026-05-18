"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import ModuleAccessDenied from "@/components/auth/ModuleAccessDenied";
import {
  evaluateRouteModuleGuard,
  findRouteModuleRule,
  type RouteModuleGuardDecision,
} from "@/lib/auth/routeModuleAccess";
import {
  readYasamUser,
  refreshYasamUserFromDb,
  saveYasamUser,
  type YasamUser,
} from "@/lib/auth/yasamUser";

type ModuleRouteGuardProps = {
  children: ReactNode;
};

export default function ModuleRouteGuard({ children }: ModuleRouteGuardProps) {
  const pathname = usePathname();
  const [decision, setDecision] = useState<RouteModuleGuardDecision>("skip");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      setChecking(true);

      const path = pathname ?? "/";
      const rule = findRouteModuleRule(path);
      let user: YasamUser | null = readYasamUser();

      if (user && rule) {
        const fresh = await refreshYasamUserFromDb(user);
        if (fresh) {
          user = fresh;
          saveYasamUser(fresh);
        }
      }

      if (cancelled) return;

      setDecision(evaluateRouteModuleGuard(path, user));
      setChecking(false);
    }

    void runCheck();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (checking && findRouteModuleRule(pathname ?? "/")) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (decision === "deny") {
    return <ModuleAccessDenied />;
  }

  return <>{children}</>;
}
