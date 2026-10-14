"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { clearYasamUser } from "@/lib/auth/yasamUser";

/**
 * Admin "Çıkış Yap" düğmeleri için onaylı çıkış (Final-A1). Ana paneldeki `requestLogout` ile AYNI
 * ortak onay penceresi ve metinleri kullanılır; yanlış tek tıklama oturumu kapatmaz. Onaylanınca
 * davranış öncekiyle aynıdır: yerel oturum temizlenir, ana sayfaya dönülür.
 */
export function useConfirmedLogout(): () => Promise<void> {
  const { confirm } = useConfirm();
  const router = useRouter();
  const t = useTranslations("home");
  return useCallback(async () => {
    const ok = await confirm({
      title: t("dashboard.logoutConfirmTitle"),
      message: t("dashboard.logoutConfirmMessage"),
      confirmText: t("dashboard.logout"),
      cancelText: t("dashboard.logoutConfirmCancel"),
      tone: "warning",
    });
    if (!ok) return;
    clearYasamUser();
    router.push("/");
  }, [confirm, router, t]);
}
