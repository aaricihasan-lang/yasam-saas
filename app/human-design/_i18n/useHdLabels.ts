"use client";

// I18N (HD) — kanonik kod → görünen etiket, TR GEÇİŞLİ.
//
// TR'de mevcut lib yardımcıları AYNEN çağrılır (ekran metni bayt-bayt aynı; Word / test sözleşmeleri değişmez).
// Diğer dillerde hd.terms sözlüğü (useHdTerms). Kanonik değerler (tip/otorite/profil/tanım/merkez/kanal kodu) ÇEVRİLMEZ;
// filtre / kayıt / sorgu değerleri her zaman koddur — yalnız görünen ad dile göre seçilir.

import { useLocale } from "next-intl";
import {
  hdAuthorityDisplayLabel,
  hdCenterLabelFromCode,
  hdDefinitionLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { useHdTerms } from "./useHdTerms";

export function useHdLabels() {
  const isTr = useLocale() === "tr";
  const terms = useHdTerms();
  return {
    isTr,
    /** Tarih/saat biçimlendirme etiketi (yalnız gösterim). */
    dateLocale: isTr ? "tr-TR" : "en-GB",
    type: (code: string | null | undefined) => (isTr ? hdTypeLabelFromCode(code) : terms.label("type", code)),
    authority: (code: string | null | undefined, typeCode: string | null | undefined) =>
      isTr ? hdAuthorityDisplayLabel(code, typeCode) : terms.authority(code, typeCode),
    profile: (code: string | null | undefined) => (isTr ? hdProfileLabelFromCode(code) : terms.label("profile", code)),
    definition: (code: string | null | undefined) => (isTr ? hdDefinitionLabelFromCode(code) : terms.label("definition", code)),
    center: (code: string | null | undefined) => (isTr ? hdCenterLabelFromCode(code) : terms.label("center", code)),
    terms,
  };
}
