"use client";

import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { CuppingCitationManager } from "../components/CitationManager";
import { createKnowledge, deleteKnowledge, listKnowledge, updateKnowledge, type CuppingKnowledge } from "../lib/api";

const FIELDS: FieldDef[] = [
  { key: "title", label: "Başlık", type: "text", required: true },
  { key: "category", label: "Kategori", type: "text" },
  { key: "content", label: "İçerik", type: "textarea", full: true },
  { key: "tags", label: "Etiketler (virgülle ayırın)", type: "tags" },
  { key: "source", label: "Kaynak", type: "text" },
  { key: "source_section", label: "Kaynak Bölümü", type: "text" },
  { key: "keyword", label: "Anahtar Kelime", type: "text" },
  { key: "notes", label: "Notlar", type: "textarea" },
  { key: "sort_order", label: "Sıra", type: "number" },
  { key: "is_active", label: "Aktif", type: "boolean" },
];

export default function BilgiKutuphanesiPage() {
  return (
    <KupaShell
      title="Bilgi & Eğitim Kütüphanesi"
      subtitle="Uzun profesyonel bilgi ve eğitim kayıtları."
      breadcrumb={[{ label: "Bilgi & Eğitim Kütüphanesi" }]}
    >
      <CrudManager<CuppingKnowledge>
        titleKey="title"
        subtitleKey="category"
        fields={FIELDS}
        load={listKnowledge}
        create={createKnowledge}
        update={updateKnowledge}
        remove={deleteKnowledge}
        emptyLabel="Henüz bilgi kaydı yok. Yeni ekleyin."
        addLabel="Kayıt"
        renderExtra={(rec) => <CuppingCitationManager entity="knowledge" entityId={rec.id} />}
      />
    </KupaShell>
  );
}
