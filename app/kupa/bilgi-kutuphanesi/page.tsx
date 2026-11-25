"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { CuppingCitationManager } from "../components/CitationManager";
import { createKnowledge, deleteKnowledge, listKnowledge, updateKnowledge, type CuppingKnowledge } from "../lib/api";

type Tr = ReturnType<typeof useTranslations>;

const buildFields = (t: Tr): FieldDef[] => [
  { key: "title", label: t("fields.title"), type: "text", required: true },
  { key: "category", label: t("fields.category"), type: "text" },
  { key: "content", label: t("fields.content"), type: "textarea", full: true },
  { key: "tags", label: t("fields.tags"), type: "tags" },
  { key: "source", label: t("fields.source"), type: "text" },
  { key: "source_section", label: t("fields.source_section"), type: "text" },
  { key: "keyword", label: t("fields.keyword"), type: "text" },
  { key: "notes", label: t("fields.notes"), type: "textarea" },
  { key: "sort_order", label: t("fields.sort_order"), type: "number" },
  { key: "is_active", label: t("fields.is_active"), type: "boolean" },
];

export default function BilgiKutuphanesiPage() {
  const t = useTranslations("cupping.library.knowledge");
  const fields = useMemo(() => buildFields(t), [t]);
  return (
    <KupaShell
      title={t("title")}
      subtitle={t("subtitle")}
      breadcrumb={[{ label: t("title") }]}
    >
      <CrudManager<CuppingKnowledge>
        titleKey="title"
        subtitleKey="category"
        fields={fields}
        load={listKnowledge}
        create={createKnowledge}
        update={updateKnowledge}
        remove={deleteKnowledge}
        emptyLabel={t("empty")}
        addLabel={t("addLabel")}
        renderExtra={(rec) => <CuppingCitationManager key={rec.id} entity="knowledge" entityId={rec.id} />}
      />
    </KupaShell>
  );
}
