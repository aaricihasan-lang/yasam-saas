"use client";

/**
 * KUPA & HACAMAT — Güvenlik & Kontrendikasyonlar (standalone yönetim).
 *
 * K5: Uzman KENDİ güvenlik master kayıtlarını yönetir (liste / arama / oluştur / düzenle / güvenli
 * silme + "Kullanıldığı Protokoller"). Protokol QuickCreate ile AYNI datasource (cupping_safety_notes
 * / /api/kupa/safety) — ayrı duplicate sistem YOK. Hazır tıbbi içerik SEED EDİLMEZ (boş başlar).
 *
 * NOT: severity NOT NULL DEFAULT 'warning' → select boş-seçenek OLMADAN geçerli default ile
 * render edilir (allowEmpty:false + defaultValue). contraindication_class NULLABLE → boş = null.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { useCuppingVocab } from "@/app/kupa/lib/useCuppingVocab";
import { CuppingProtocolUsage } from "../components/ProtocolUsage";
import { createSafety, deleteSafety, listSafety, updateSafety, type CuppingSafetyNote } from "../lib/api";

type Tr = ReturnType<typeof useTranslations>;

// Görünen etiketler: messages/<dil>/cupping.library.json → cupping.library.safety. Seçenek değerleri kanonik.

const buildSeverityOptions = (t: Tr) => [
  { value: "info", label: t("opt.severity.info") },
  { value: "warning", label: t("opt.severity.warning") },
  { value: "contraindication", label: t("opt.severity.contraindication") },
];

const buildContraindicationOptions = (t: Tr) => [
  { value: "absolute", label: t("opt.contraindication.absolute") },
  { value: "relative", label: t("opt.contraindication.relative") },
  { value: "none", label: t("opt.contraindication.none") },
];

const buildFields = (t: Tr): FieldDef[] => [
  { key: "title", label: t("fields.title"), type: "text", required: true },
  {
    key: "severity",
    label: t("fields.severity"),
    type: "select",
    options: buildSeverityOptions(t),
    allowEmpty: false,
    defaultValue: "warning",
  },
  {
    key: "contraindication_class",
    label: t("fields.contraindication_class"),
    type: "select",
    options: buildContraindicationOptions(t),
  },
  { key: "content", label: t("fields.content"), type: "textarea" },
  { key: "scope_tags", label: t("fields.scope_tags"), type: "tags" },
  { key: "source_note", label: t("fields.source_note"), type: "textarea" },
  { key: "sort_order", label: t("fields.sort_order"), type: "number" },
  { key: "is_active", label: t("fields.is_active"), type: "boolean" },
];

export default function GuvenlikPage() {
  const t = useTranslations("cupping.library.safety");
  const vocab = useCuppingVocab();
  const fields = useMemo(() => buildFields(t), [t]);
  const severityOptions = useMemo(() => buildSeverityOptions(t), [t]);
  const contraOptions = useMemo(() => buildContraindicationOptions(t), [t]);
  return (
    <KupaShell
      title={t("title")}
      subtitle={t("subtitle")}
      breadcrumb={[{ label: t("crumb") }]}
    >
      <CrudManager<CuppingSafetyNote>
        titleKey="title"
        subtitleKey="severity"
        // I18N-0126: alt satırda ham kod ("warning") yerine sözlük etiketi; kayıt değeri değişmez.
        subtitleFormat={(v) => vocab.severity(typeof v === "string" ? v : null)}
        fields={fields}
        load={listSafety}
        create={createSafety}
        update={updateSafety}
        remove={deleteSafety}
        emptyLabel={t("empty")}
        addLabel={t("addLabel")}
        searchKeys={["title", "content", "source_note", "scope_tags"]}
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          { key: "severity", label: t("filterSeverity"), options: severityOptions },
          { key: "contraindication_class", label: t("filterClass"), options: contraOptions },
        ]}
        deleteCascadeHint={t("deleteCascadeHint")}
        renderExtra={(rec) => <CuppingProtocolUsage entity="safety" entityId={rec.id} />}
      />
    </KupaShell>
  );
}
