"use client";

// İlişki ve Grup Analizleri — ekran dili etiketleri (I18N-F1-R5 HD). SAF GÖSTERİM.
//
// Kanonik değerler (ilişki türü kodu, Connection dinamiği, devre, Penta konumu, kanal / merkez / tanım kodu) ÇEVRİLMEZ;
// yalnız görünen ad dile göre seçilir. TR katalog değerleri lib/human-design/relations/labels.ts sabitleriyle BAYT-BAYT
// aynıdır (scripts/hd-i18n/relations-catalog.harness.ts kilitler); TR'de kanal / tanım / merkez adları mevcut lib
// yardımcılarından AYNEN gelir (Word ve test sözleşmeleri değişmez). Diğer dillerde hd.terms sözlüğü.

import { useLocale, useTranslations } from "next-intl";
import { useHdTerms } from "@/app/human-design/_i18n/useHdTerms";
import { hdCenterLabelFromCode } from "@/lib/human-design/codeHelpers";
import { toAppDefinitionCode } from "@/lib/human-design/normalize/hdAppCodes";
import { combinedDefinitionLabel, relationChannelLabel } from "@/lib/human-design/relations/labels";
import { CONNECTION_TITLE_LABELS_TR, type ConnectionTitleLabels } from "@/lib/human-design/relations/roxyConnectionChart";
import { PENTA_SCENE_LABELS_TR, type PentaSceneLabels } from "@/lib/human-design/relations/pentaScene";
import type { HdCenterCode } from "@/lib/human-design/types";
import type { ConnectionDynamic } from "@/lib/human-design/relations/connection";
import type { RelationKind, RelationType } from "@/lib/human-design/relations/relationService";

const EN_PENTA_BANDS = { Throat: "THROAT CENTER", G: "G CENTER", Sacral: "SACRAL CENTER" } as const;

export function useRelationLabels() {
  const t = useTranslations("hd.relations");
  const terms = useHdTerms();
  const isTr = useLocale() === "tr";
  const channel = (id: string, fallbackName: string): string => {
    if (isTr) return relationChannelLabel(id, fallbackName);
    const l = terms.label("channel", id);
    return l && l !== id ? l : `${id} ${fallbackName}`;
  };
  const center = (code: HdCenterCode): string => (isTr ? hdCenterLabelFromCode(code) : terms.label("center", code));
  const titleLabels: ConnectionTitleLabels = isTr
    ? CONNECTION_TITLE_LABELS_TR
    : {
        gate: (n) => t("connTitle.gate", { n }),
        channel: (id) => t("connTitle.channel", { id }),
        defined: t("connTitle.defined"),
        open: t("connTitle.open"),
        combined: t("connTitle.combined"),
      };
  const pentaLabels: PentaSceneLabels = isTr
    ? PENTA_SCENE_LABELS_TR
    : {
        band: (k) => EN_PENTA_BANDS[k],
        channelName: (id, fallback) => {
          const l = terms.label("channel", id);
          const name = l.replace(/^\s*\d+-\d+\s*/, "").replace(/^Channel of\s+/i, "").trim();
          return name && name !== id ? name : fallback;
        },
        coreSuffix: " · CORE",
        gapSuffix: " · gap",
        gapWord: "gap",
      };
  return {
    t,
    isTr,
    dateLocale: isTr ? "tr-TR" : "en-GB",
    kind: (k: RelationKind) => t(`kind.${k}`),
    type: (x: RelationType) => t(`type.${x}`),
    dynamic: (d: ConnectionDynamic) => t(`dynamic.${d}`),
    dynamicDef: (d: ConnectionDynamic) => t(`dynamicDef.${d}`),
    circuit: (c: string) => (t.has(`circuit.${c}`) ? t(`circuit.${c}`) : c),
    channel,
    center,
    shortCenter: (code: HdCenterCode) => center(code).replace(/\s*\(.*\)$/, ""),
    combinedDefinition: (kind: string): string => {
      if (isTr) return combinedDefinitionLabel(kind);
      const code = toAppDefinitionCode(kind);
      return code ? terms.label("definition", code) : kind;
    },
    titleLabels,
    pentaLabels,
  };
}
