"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { displayClientAdviceTitle, displayPlanName } from "./systemNames";

/**
 * I18N-F1-R3 — sistemin ürettiği varsayılan plan adı / danışan bilgilendirmesi başlığının GÖSTERİMİ
 * (kural: ./systemNames.ts). Kullanıcının yazdığı ad aynen gösterilir; düzenleme alanları ham kayıtlı değeri kullanır.
 */
export function useSystemNames() {
  const t = useTranslations("cupping.calendar");
  return useMemo(
    () => ({
      planName: (plan: { name: string; year: number; name_is_default?: boolean | null }) =>
        displayPlanName(plan, (year) => t("ws.defaultPlanName", { year })),
      adviceTitle: (title: string) => displayClientAdviceTitle(title, () => t("clientAdvice.defaultTitle")),
    }),
    [t],
  );
}
