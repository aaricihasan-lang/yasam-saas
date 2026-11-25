"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  CONTRA_CLASS_LABEL,
  MOVEMENT_STYLE_LABEL,
  SAFETY_SEVERITY_LABEL,
  TECHNIQUE_TYPE_LABEL,
} from "@/app/kupa/teknikler/lib/labels";

/**
 * I18N (2026-11-25) — Kupa & Hacamat kanonik kod → GÖRÜNEN etiket (ekran dilinde).
 *
 * Kodlar (dry/wet/stationary/gliding/flash/unspecified, info/warning/contraindication,
 * absolute/relative/none) DB'de durur ve DEĞİŞMEZ; yalnız gösterim etiketi çevrilir.
 * TR değerleri app/kupa/teknikler/lib/labels.ts haritalarıyla birebirdir (o dosya TR kaynağı olarak kalır;
 * sunucu Word raporu ve sözleşme testleri onu kullanır). Bilinmeyen kod → bugünkü davranış:
 * tür/biçim için "Belirtilmemiş", önem/sınıf için ham değer.
 */
export function useCuppingVocab() {
  const t = useTranslations("cupping.vocab");
  return useMemo(() => {
    const has = (m: Record<string, string>, v: string | null | undefined) =>
      v != null && Object.prototype.hasOwnProperty.call(m, v);
    return {
      techniqueType: (v: string | null | undefined) =>
        t(`techniqueType.${has(TECHNIQUE_TYPE_LABEL, v) ? v : "unspecified"}`),
      movementStyle: (v: string | null | undefined) =>
        t(`movementStyle.${has(MOVEMENT_STYLE_LABEL, v) ? v : "unspecified"}`),
      /** Bilinmeyen önem kodu → ham değer (mevcut davranış). */
      severity: (v: string | null | undefined) => (has(SAFETY_SEVERITY_LABEL, v) ? t(`severity.${v}`) : (v ?? "")),
      contraClass: (v: string | null | undefined) => (has(CONTRA_CLASS_LABEL, v) ? t(`contraClass.${v}`) : (v ?? "")),
      unspecified: t("unspecified"),
      all: t("all"),
    };
  }, [t]);
}

export type CuppingVocab = ReturnType<typeof useCuppingVocab>;
