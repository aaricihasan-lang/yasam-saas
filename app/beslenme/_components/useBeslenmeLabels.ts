"use client";
/**
 * Beslenme modülü — ekran diline göre etiket ve hata metni yardımcıları (I18N gece, Ajan B).
 * Kanonik değerler (prep_state, section_key, relation_type, source_type, API kodları) DEĞİŞMEZ; yalnız
 * gösterim etiketi katalogdan (beslenme.labels) gelir. TR değerleri constants.ts haritalarıyla birebir.
 */
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { PREP_STATES, RELATION_TYPES, SECTION_KEYS, SOURCE_TYPES } from "@/lib/beslenme/contracts";
import {
  PREP_STATE_LABELS,
  RELATION_TYPE_LABELS,
  SECTION_KEY_LABELS,
  SOURCE_TYPE_LABELS,
  friendlyErrorKey,
} from "./constants";

export function useBeslenmeLabels() {
  const t = useTranslations("beslenme.labels");
  return useMemo(() => {
    const prepState = (v: string) => (t.has(`prepState.${v}`) ? t(`prepState.${v}`) : (PREP_STATE_LABELS[v] ?? v));
    const sectionKey = (v: string) => (t.has(`sectionKey.${v}`) ? t(`sectionKey.${v}`) : (SECTION_KEY_LABELS[v] ?? v));
    const relationType = (v: string) => (t.has(`relationType.${v}`) ? t(`relationType.${v}`) : (RELATION_TYPE_LABELS[v] ?? v));
    const sourceType = (v: string) => (t.has(`sourceType.${v}`) ? t(`sourceType.${v}`) : (SOURCE_TYPE_LABELS[v] ?? v));
    return {
      /** API hata kodu → ekran dilinde kullanıcı mesajı (friendlyError ile aynı eşleme). */
      error: (code?: string, status?: number) => t(`errors.${friendlyErrorKey(code, status)}`),
      prepState,
      sectionKey,
      relationType,
      sourceType,
      prepStateOptions: PREP_STATES.map((v) => ({ value: v, label: prepState(v) })),
      sectionKeyOptions: SECTION_KEYS.map((v) => ({ value: v, label: sectionKey(v) })),
      relationTypeOptions: RELATION_TYPES.map((v) => ({ value: v, label: relationType(v) })),
      sourceTypeOptions: SOURCE_TYPES.map((v) => ({ value: v, label: sourceType(v) })),
    };
  }, [t]);
}
