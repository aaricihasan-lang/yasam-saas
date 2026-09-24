"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { RefleksolojiHubLoading } from "./components/RefleksolojiSkeleton";

/**
 * REF-010 — Refleksoloji sayfa erişim kapısı (client shell guard).
 *
 * Sistem oturumu localStorage'da tuttuğundan gerçek SSR server-component gate mimari
 * bir auth refactor gerektirir (kapsam dışı). Bu yüzden API güvenlik sınırı
 * (`requireModuleAccess("reflexology")`) AYNEN korunur; bu guard yalnız SHELL UX'idir:
 *   - oturum yok → güvenli /home yönlendirme,
 *   - oturum var ama reflexology izni yok → /home yönlendirme,
 *   - kontrol bitene kadar iskele gösterir (yetkisiz içerik FLASH etmez).
 *
 * Karar mantığı SERVER ile birebir aynı SAF resolver (moduleAccessCore) — duplikasyon yok.
 * API guard bunun yerine geçmez; bu guard da API guard'ın yerine geçmez (ikisi de kalır).
 */
export default function RefleksolojiLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    const user = readYasamUser();
    if (!user) {
      setStatus("denied");
      router.replace("/");
      return;
    }
    // Demo hesap sandbox'ta modülü görür; veri erişimi yine API tarafında yönetilir.
    if (user.is_demo_account === true) {
      setStatus("allowed");
      return;
    }
    const allowed = resolveModuleAccess(user.role, user.module_permissions ?? null, "reflexology");
    if (allowed) {
      setStatus("allowed");
    } else {
      setStatus("denied");
      router.replace("/");
    }
  }, [router]);

  if (status !== "allowed") {
    return <RefleksolojiHubLoading />;
  }
  return <>{children}</>;
}
