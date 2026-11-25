"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import {
  createSource,
  deleteSource,
  getSourceUsage,
  listSources,
  updateSource,
  type CuppingCitationEntity,
  type CuppingSource,
} from "../lib/api";

type Tr = ReturnType<typeof useTranslations>;

/**
 * Kupa & Hacamat — Kaynak Kataloğu. Citation'lar (içerik ↔ kaynak atıfları) bu
 * katalogdaki kayıtlara bağlanır. FAZ 1.5 bibliyografik alanlar burada girilir.
 */

const buildSourceTypeOptions = (t: Tr) => [
  { value: "historical_primary", label: t("opt.source_type.historical_primary") },
  { value: "historical_secondary", label: t("opt.source_type.historical_secondary") },
  { value: "book_monograph", label: t("opt.source_type.book_monograph") },
  { value: "academic_article", label: t("opt.source_type.academic_article") },
  { value: "systematic_review", label: t("opt.source_type.systematic_review") },
  { value: "clinical_study", label: t("opt.source_type.clinical_study") },
  { value: "official_guidance", label: t("opt.source_type.official_guidance") },
  { value: "expert_educational", label: t("opt.source_type.expert_educational") },
];

const buildFields = (t: Tr): FieldDef[] => [
  { key: "source_name", label: t("fields.source_name"), type: "text", required: true },
  {
    key: "source_type",
    label: t("fields.source_type"),
    type: "select",
    options: buildSourceTypeOptions(t),
  },
  { key: "author_or_organization", label: t("fields.author_or_organization"), type: "text" },
  { key: "title", label: t("fields.title"), type: "text" },
  { key: "publication", label: t("fields.publication"), type: "text" },
  { key: "year", label: t("fields.year"), type: "number" },
  { key: "identifier", label: t("fields.identifier"), type: "text" },
  { key: "language", label: t("fields.language"), type: "text" },
  { key: "page_or_section", label: t("fields.page_or_section"), type: "text" },
  { key: "source_url", label: t("fields.source_url"), type: "text" },
  { key: "accessed_on", label: t("fields.accessed_on"), type: "text" },
  { key: "note", label: t("fields.note"), type: "textarea" },
  { key: "sort_order", label: t("fields.sort_order"), type: "number" },
];

/** Atıf türü (kanonik entity anahtarı) → katalog anahtarı (silme etkisi mesajı; kullanıcı dili). */
const CITATION_LABEL_KEYS: Record<CuppingCitationEntity, string> = {
  point: "point",
  topic: "topic",
  "point-topic": "pointTopic",
  technique: "technique",
  knowledge: "knowledge",
  safety: "safety",
};

/**
 * P2-3 — Kaynak silinince bağlı atıflar (6 tablo) CASCADE ile silinir; protokol kaynakları ve
 * protokol bilgileri ise silmeyi ENGELLER. Silme onayından ÖNCE gerçek sayılar DB'den alınır.
 */
const makeSourceDeleteImpact = (t: Tr) => async function sourceDeleteImpact(rec: CuppingSource): Promise<{ message: string; blocked?: boolean }> {
  const u = await getSourceUsage(rec.id);
  const protocolUse = u.protocolSources + u.protocolEntries;
  if (protocolUse > 0) {
    const parts = [
      u.protocolSources > 0 ? t("impact.protocolSources", { count: String(u.protocolSources) }) : "",
      u.protocolEntries > 0 ? t("impact.protocolEntries", { count: String(u.protocolEntries) }) : "",
    ].filter(Boolean);
    return {
      blocked: true,
      message: t("impact.blocked", { name: rec.source_name, parts: parts.join(t("impact.and")) }),
    };
  }
  if (u.citationTotal === 0) return { message: t("impact.none") };
  const detail = (Object.keys(u.citations) as CuppingCitationEntity[])
    .filter((k) => u.citations[k] > 0)
    // Bilinmeyen entity (tip dışı sunucu yanıtı) → ham anahtar yolu yerine ham kod gösterilir (QA C-12).
    .map((k) => (CITATION_LABEL_KEYS[k] ? t(`impact.entityCount.${CITATION_LABEL_KEYS[k]}`, { count: String(u.citations[k]) }) : `${u.citations[k]} ${k}`))
    .join(", ");
  return {
    message: t("impact.cascade", { count: String(u.citationTotal), detail }),
  };
};

export default function KaynaklarPage() {
  const t = useTranslations("cupping.library.sources");
  const fields = useMemo(() => buildFields(t), [t]);
  const sourceTypeOptions = useMemo(() => buildSourceTypeOptions(t), [t]);
  const sourceDeleteImpact = useMemo(() => makeSourceDeleteImpact(t), [t]);
  return (
    <KupaShell
      title={t("title")}
      subtitle={t("subtitle")}
      breadcrumb={[{ label: t("title") }]}
    >
      <CrudManager<CuppingSource>
        titleKey="source_name"
        subtitleKey="source_type"
        fields={fields}
        load={listSources}
        create={createSource}
        update={updateSource}
        remove={deleteSource}
        loadDeleteImpact={sourceDeleteImpact}
        emptyLabel={t("empty")}
        addLabel={t("addLabel")}
        searchKeys={[
          "source_name",
          "title",
          "author_or_organization",
          "publication",
          "identifier",
          "note",
          "year",
        ]}
        searchPlaceholder={t("searchPlaceholder")}
        filters={[{ key: "source_type", label: t("filterType"), options: sourceTypeOptions }]}
      />
    </KupaShell>
  );
}
