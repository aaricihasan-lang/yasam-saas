"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BiyoenerjiGroupId, BiyoenerjiSectionKey } from "./biyoenerjiFolderConfig";

/**
 * I18N (2026-11-25) — Biyoenerji bölüm/grup GÖRÜNEN adları (ekran dilinde).
 *
 * biyoenerjiFolderConfig.ts TR kaynak olarak kalır (route anahtarları, IA sözleşmesi, iaHarness);
 * bölüm anahtarı (route slug) ve grup kimliği kanoniktir, çevrilmez. TR katalog değerleri config'teki
 * title/desc/badge ile BİREBİR (messages/<dil>/bioenergy.json → bioenergy.sections / bioenergy.groups).
 */
export function useBiyoenerjiLabels() {
  const t = useTranslations("bioenergy");
  return useMemo(
    () => ({
      cardTitle: (key: BiyoenerjiSectionKey) => t(`sections.${key}.title`),
      cardDesc: (key: BiyoenerjiSectionKey) => t(`sections.${key}.desc`),
      cardBadge: (key: BiyoenerjiSectionKey) => t(`sections.${key}.badge`),
      groupTitle: (id: BiyoenerjiGroupId) => t(`groups.${id}.title`),
      groupDesc: (id: BiyoenerjiGroupId) => t(`groups.${id}.desc`),
    }),
    [t],
  );
}
