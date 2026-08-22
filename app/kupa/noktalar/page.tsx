"use client";

import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { CuppingCitationManager } from "../components/CitationManager";
import { createPoint, deletePoint, listPoints, updatePoint, type CuppingPoint } from "../lib/api";

const FIELDS: FieldDef[] = [
  { key: "name", label: "Ad", type: "text", required: true },
  { key: "alt_name", label: "Alternatif Ad", type: "text" },
  { key: "synonyms", label: "Eş Adlar / Kodlar (virgülle ayırın)", type: "tags" },
  { key: "code", label: "Kod", type: "text" },
  { key: "anatomical_region", label: "Anatomik Bölge", type: "text" },
  {
    key: "laterality",
    label: "Taraf (laterality)",
    type: "select",
    options: [
      { value: "midline", label: "Orta hat (midline)" },
      { value: "bilateral", label: "İki taraflı (bilateral)" },
      { value: "left", label: "Sol" },
      { value: "right", label: "Sağ" },
      { value: "unspecified", label: "Belirtilmemiş" },
    ],
  },
  { key: "description", label: "Açıklama", type: "textarea" },
  { key: "traditional_use", label: "Geleneksel Kullanım", type: "textarea" },
  { key: "application_info", label: "Uygulama Bilgisi", type: "textarea" },
  { key: "related_points", label: "İlişkili Noktalar (virgülle ayırın)", type: "tags" },
  { key: "safety_note", label: "Güvenlik / Dikkat", type: "textarea" },
  { key: "source_note", label: "Kaynak Bilgisi (serbest — yapısal atıf için Kaynaklar)", type: "textarea" },
  { key: "professional_note", label: "Profesyonel Not", type: "textarea" },
  { key: "sort_order", label: "Sıra", type: "number" },
  { key: "is_active", label: "Aktif", type: "boolean" },
];

export default function NoktalarPage() {
  return (
    <KupaShell
      title="Hacamat Noktaları"
      subtitle="Nokta bilgisi: ad, kod, anatomik bölge, geleneksel kullanım, uygulama ve güvenlik."
      breadcrumb={[{ label: "Hacamat Noktaları" }]}
    >
      <CrudManager<CuppingPoint>
        titleKey="name"
        subtitleKey="code"
        fields={FIELDS}
        load={listPoints}
        create={createPoint}
        update={updatePoint}
        remove={deletePoint}
        emptyLabel="Henüz nokta yok. Yeni ekleyin."
        addLabel="Nokta"
        renderExtra={(rec) => <CuppingCitationManager entity="point" entityId={rec.id} />}
      />
    </KupaShell>
  );
}
