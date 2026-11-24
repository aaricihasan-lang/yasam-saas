"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { CuppingCitationManager } from "../components/CitationManager";
import { CuppingProtocolUsage } from "../components/ProtocolUsage";
import { createPoint, deletePoint, listPoints, updatePoint, type CuppingPoint } from "../lib/api";

type Tr = ReturnType<typeof useTranslations>;

// Görünen etiketler: messages/<dil>/cupping.library.json → cupping.library.points. Seçenek değerleri (midline/…) kanonik.

const buildLateralityOptions = (t: Tr) => [
  { value: "midline", label: t("opt.laterality.midline") },
  { value: "bilateral", label: t("opt.laterality.bilateral") },
  { value: "left", label: t("opt.laterality.left") },
  { value: "right", label: t("opt.laterality.right") },
  { value: "unspecified", label: t("opt.laterality.unspecified") },
];

const buildFields = (t: Tr): FieldDef[] => [
  { key: "name", label: t("fields.name"), type: "text", required: true },
  { key: "alt_name", label: t("fields.alt_name"), type: "text" },
  { key: "synonyms", label: t("fields.synonyms"), type: "tags" },
  { key: "code", label: t("fields.code"), type: "text" },
  { key: "anatomical_region", label: t("fields.anatomical_region"), type: "text" },
  {
    key: "laterality",
    label: t("fields.laterality"),
    type: "select",
    options: buildLateralityOptions(t),
  },
  { key: "description", label: t("fields.description"), type: "textarea" },
  { key: "traditional_use", label: t("fields.traditional_use"), type: "textarea" },
  { key: "application_info", label: t("fields.application_info"), type: "textarea" },
  { key: "related_points", label: t("fields.related_points"), type: "tags" },
  { key: "safety_note", label: t("fields.safety_note"), type: "textarea" },
  { key: "source_note", label: t("fields.source_note"), type: "textarea" },
  { key: "professional_note", label: t("fields.professional_note"), type: "textarea" },
  { key: "sort_order", label: t("fields.sort_order"), type: "number" },
  { key: "is_active", label: t("fields.is_active"), type: "boolean" },
];

export default function NoktalarPage() {
  const t = useTranslations("cupping.library.points");
  const fields = useMemo(() => buildFields(t), [t]);
  const lateralityOptions = useMemo(() => buildLateralityOptions(t), [t]);
  return (
    <KupaShell
      title={t("title")}
      subtitle={t("subtitle")}
      breadcrumb={[{ label: t("title") }]}
    >
      <CrudManager<CuppingPoint>
        titleKey="name"
        subtitleKey="code"
        fields={fields}
        load={listPoints}
        create={createPoint}
        update={updatePoint}
        remove={deletePoint}
        emptyLabel={t("empty")}
        addLabel={t("addLabel")}
        searchKeys={[
          "name",
          "alt_name",
          "code",
          "anatomical_region",
          "description",
          "traditional_use",
          "application_info",
          "synonyms",
        ]}
        searchPlaceholder={t("searchPlaceholder")}
        filters={[{ key: "laterality", label: t("filterLaterality"), options: lateralityOptions }]}
        deleteCascadeHint={t("deleteCascadeHint")}
        renderExtra={(rec) => (
          <>
            <CuppingProtocolUsage entity="point" entityId={rec.id} />
            <CuppingCitationManager key={rec.id} entity="point" entityId={rec.id} />
          </>
        )}
      />
    </KupaShell>
  );
}
