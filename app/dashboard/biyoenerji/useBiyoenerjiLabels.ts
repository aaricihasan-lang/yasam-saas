"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { BIOENERJI_FOLDER_CARDS, type BiyoenerjiGroupId, type BiyoenerjiSectionKey } from "./biyoenerjiFolderConfig";

const SECTION_KEYS: ReadonlySet<string> = new Set(BIOENERJI_FOLDER_CARDS.map((c) => c.key));

/**
 * Ağdan / oturum önbelleğinden gelen bölüm anahtarı (string) gerçekten kanonik bir bölüm anahtarı mı?
 * Tip daraltma çalışma zamanında doğrulanır (as ile susturma yok).
 */
export function isBiyoenerjiSectionKey(key: string): key is BiyoenerjiSectionKey {
  return SECTION_KEYS.has(key);
}

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
