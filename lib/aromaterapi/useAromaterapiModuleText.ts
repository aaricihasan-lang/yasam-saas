"use client";

/**
 * I18N: Aromaterapi bölüm kayıt defteri (aromaterapiModules.ts) Türkçe etiketleri kanonik/harness kaynağı olarak KALIR;
 * ekranda gösterim `aromatherapy.modules.<id>` ve `aromatherapy.facets.<anahtar>` katalog anahtarlarından gelir.
 * Kimliği katalogda olmayan (yeni eklenmiş) bölüm Türkçe kayıt defteri metniyle gösterilir (ham anahtar asla).
 */
import { useTranslations } from "next-intl";
import type { AromaterapiModule } from "./aromaterapiModules";

const FACET_KEY: Record<string, string> = {
  "/aromaterapi/ucucu-yaglar?view=list": "ucucu",
  "/aromaterapi/sabit-yaglar?view=list": "sabit",
  "/aromaterapi/maserasyon-yaglari?view=list": "maserasyon",
};

export function useAromaterapiModuleText() {
  const t = useTranslations("aromatherapy");
  return {
    label: (m: Pick<AromaterapiModule, "id" | "label">) => (t.has(`modules.${m.id}.label`) ? t(`modules.${m.id}.label`) : m.label),
    description: (m: Pick<AromaterapiModule, "id" | "description">) =>
      t.has(`modules.${m.id}.description`) ? t(`modules.${m.id}.description`) : m.description,
    facet: (f: { href: string; label: string }) => {
      const k = FACET_KEY[f.href];
      return k ? t(`facets.${k}`) : f.label;
    },
  };
}
