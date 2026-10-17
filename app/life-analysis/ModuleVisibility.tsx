"use client";

/**
 * Yaşam Analiz Merkezi alt kart görünürlüğü (2026-10-17 owner kararı: uzman KENDİSİNE AÇILMAMIŞ alt modülü görmez).
 * Yalnız görünürlüktür — kartın tasarımına dokunmaz; çocuğu ya olduğu gibi çizer ya da hiç çizmez.
 * Canlı module_permissions syncYasamUserFromDb ile kesinleşmeden çizilmez (fail-closed). Sistem sahibi her şeyi görür
 * (hasAnyModulePermissionFlag). Sayfalar ModuleRouteGuard, API'ler requireModuleAccess ile ayrıca korunur.
 */
import { useEffect, useState, type ReactNode } from "react";
import { hasAnyModulePermissionFlag } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb } from "@/lib/auth/yasamUser";

export default function ModuleVisibility({ keys, children }: { keys: readonly string[]; children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const keyList = keys.join("|");

  useEffect(() => {
    let cancelled = false;
    const list = keyList.split("|");
    const cached = readYasamUser();
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setAllowed(hasAnyModulePermissionFlag(fresh ?? cached ?? null, list));
      })
      .catch(() => {
        if (!cancelled) setAllowed(hasAnyModulePermissionFlag(cached ?? null, list));
      });
    return () => {
      cancelled = true;
    };
  }, [keyList]);

  return allowed ? <>{children}</> : null;
}
