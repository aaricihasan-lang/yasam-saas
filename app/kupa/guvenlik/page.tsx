"use client";

import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { CuppingCitationManager } from "../components/CitationManager";
import { createSafety, deleteSafety, listSafety, updateSafety, type CuppingSafetyNote } from "../lib/api";

const FIELDS: FieldDef[] = [
  { key: "title", label: "Başlık", type: "text", required: true },
  {
    key: "severity",
    label: "Önem Düzeyi",
    type: "select",
    options: [
      { value: "info", label: "Bilgi" },
      { value: "warning", label: "Uyarı" },
      { value: "contraindication", label: "Kontrendikasyon" },
    ],
  },
  {
    key: "contraindication_class",
    label: "Kontrendikasyon Sınıfı (severity'den ayrı)",
    type: "select",
    options: [
      { value: "absolute", label: "Mutlak (absolute)" },
      { value: "relative", label: "Göreli (relative)" },
      { value: "none", label: "Yok (none)" },
    ],
  },
  { key: "content", label: "İçerik", type: "textarea", full: true },
  { key: "scope_tags", label: "Kapsam Etiketleri (virgülle ayırın)", type: "tags" },
  { key: "source_note", label: "Kaynak Bilgisi (serbest)", type: "textarea" },
  { key: "sort_order", label: "Sıra", type: "number" },
  { key: "is_active", label: "Aktif", type: "boolean" },
];

export default function GuvenlikPage() {
  return (
    <KupaShell
      title="Güvenlik & Kontrendikasyonlar"
      subtitle="Bağımsız güvenlik/kontrendikasyon kayıtları — açıklamalara gömülü değil, ayrı ve ilişkilendirilebilir."
      breadcrumb={[{ label: "Güvenlik & Kontrendikasyonlar" }]}
    >
      <CrudManager<CuppingSafetyNote>
        titleKey="title"
        subtitleKey="severity"
        fields={FIELDS}
        load={listSafety}
        create={createSafety}
        update={updateSafety}
        remove={deleteSafety}
        emptyLabel="Henüz güvenlik kaydı yok. Yeni ekleyin."
        addLabel="Kayıt"
        renderExtra={(rec) => <CuppingCitationManager entity="safety" entityId={rec.id} />}
      />
    </KupaShell>
  );
}
