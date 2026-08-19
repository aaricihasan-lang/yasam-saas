"use client";

import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { createTechnique, deleteTechnique, listTechniques, updateTechnique, type CuppingTechnique } from "../lib/api";

const FIELDS: FieldDef[] = [
  { key: "name", label: "Teknik Adı", type: "text", required: true },
  {
    key: "kind",
    label: "Tür",
    type: "select",
    options: [
      { value: "kuru", label: "Kuru Kupa" },
      { value: "yas", label: "Yaş Kupa (Hacamat)" },
      { value: "sabit", label: "Sabit Kupa" },
      { value: "hareketli", label: "Hareketli / Kaydırmalı Kupa" },
    ],
  },
  { key: "description", label: "Açıklama", type: "textarea" },
  { key: "application_info", label: "Uygulama Bilgisi", type: "textarea" },
  { key: "safety_note", label: "Güvenlik / Dikkat", type: "textarea" },
  { key: "source_note", label: "Kaynak Bilgisi", type: "textarea" },
  { key: "sort_order", label: "Sıra", type: "number" },
  { key: "is_active", label: "Aktif", type: "boolean" },
];

export default function TekniklerPage() {
  return (
    <KupaShell
      title="Kupa Teknikleri"
      subtitle="Kuru, yaş (hacamat), sabit ve hareketli/kaydırmalı teknik kayıtları. Tür serbesttir."
      breadcrumb={[{ label: "Kupa Teknikleri" }]}
    >
      <CrudManager<CuppingTechnique>
        titleKey="name"
        subtitleKey="kind"
        fields={FIELDS}
        load={listTechniques}
        create={createTechnique}
        update={updateTechnique}
        remove={deleteTechnique}
        emptyLabel="Henüz teknik yok. Yeni ekleyin."
        addLabel="Teknik"
      />
    </KupaShell>
  );
}
