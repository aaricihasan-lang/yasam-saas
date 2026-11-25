"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

type ToastFn = (o: {
  title?: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
}) => void;

/**
 * I18N — Dijital İçerik Merkezi demo uyarısı (lib/demo/digitalContentDemo.ts metinlerinin dile göre
 * karşılığı; TR metinleri BİREBİR aynı: digitalContent.demo). Davranış aynı: info toast, 6 sn.
 * lib/demo/digitalContentDemo.ts Kişisel Arşiv tarafından da kullanıldığı için DEĞİŞTİRİLMEDİ.
 */
export function useDigitalContentDemo() {
  const t = useTranslations("digitalContent.demo");
  const notify = useCallback(
    (showToast: ToastFn) => {
      showToast({ title: t("title"), message: t("message"), type: "info", duration: 6000 });
    },
    [t],
  );
  return { banner: t("banner"), notify };
}
