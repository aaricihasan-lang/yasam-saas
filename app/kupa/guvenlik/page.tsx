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

import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { CuppingProtocolUsage } from "../components/ProtocolUsage";
import { createSafety, deleteSafety, listSafety, updateSafety, type CuppingSafetyNote } from "../lib/api";

const SEVERITY_OPTIONS = [
  { value: "info", label: "Bilgi" },
  { value: "warning", label: "Uyarı" },
  { value: "contraindication", label: "Kontrendikasyon" },
];

const CONTRAINDICATION_OPTIONS = [
  { value: "absolute", label: "Mutlak (absolute)" },
  { value: "relative", label: "Göreceli (relative)" },
  { value: "none", label: "Yok (none)" },
];

const FIELDS: FieldDef[] = [
  { key: "title", label: "Başlık", type: "text", required: true },
  {
    key: "severity",
    label: "Önem",
    type: "select",
    options: SEVERITY_OPTIONS,
    allowEmpty: false,
    defaultValue: "warning",
  },
  {
    key: "contraindication_class",
    label: "Kontrendikasyon Sınıfı",
    type: "select",
    options: CONTRAINDICATION_OPTIONS,
  },
  { key: "content", label: "Açıklama", type: "textarea" },
  { key: "scope_tags", label: "Kapsam Etiketleri (virgülle ayırın)", type: "tags" },
  { key: "source_note", label: "Kaynak Bilgisi (serbest)", type: "textarea" },
  { key: "sort_order", label: "Sıra", type: "number" },
  { key: "is_active", label: "Aktif", type: "boolean" },
];

export default function GuvenlikPage() {
  return (
    <KupaShell
      title="Güvenlik & Kontrendikasyonlar"
      subtitle="Kendi güvenlik / dikkat maddelerinizi yönetin; protokollere QuickCreate ile de bağlanır."
      breadcrumb={[{ label: "Güvenlik" }]}
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
        addLabel="Güvenlik"
        searchKeys={["title", "content", "source_note", "scope_tags"]}
        searchPlaceholder="Başlık veya içeriğe göre ara…"
        filters={[
          { key: "severity", label: "Önem", options: SEVERITY_OPTIONS },
          { key: "contraindication_class", label: "Sınıf", options: CONTRAINDICATION_OPTIONS },
        ]}
        deleteCascadeHint="Bir protokolde kullanılan güvenlik maddesi silinemez; önce ilgili protokollerden çıkarın."
        renderExtra={(rec) => <CuppingProtocolUsage entity="safety" entityId={rec.id} />}
      />
    </KupaShell>
  );
}
