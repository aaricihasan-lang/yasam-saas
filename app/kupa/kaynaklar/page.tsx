"use client";

import { KupaShell } from "../components/KupaShell";
import { CrudManager, type FieldDef } from "../components/CrudManager";
import { createSource, deleteSource, listSources, updateSource, type CuppingSource } from "../lib/api";

/**
 * Kupa & Hacamat — Kaynak Kataloğu. Citation'lar (içerik ↔ kaynak atıfları) bu
 * katalogdaki kayıtlara bağlanır. FAZ 1.5 bibliyografik alanlar burada girilir.
 */

const FIELDS: FieldDef[] = [
  { key: "source_name", label: "Kaynak Adı", type: "text", required: true },
  {
    key: "source_type",
    label: "Bibliyografik Tür",
    type: "select",
    options: [
      { value: "historical_primary", label: "Tarihsel Birincil" },
      { value: "historical_secondary", label: "Tarihsel İkincil" },
      { value: "book_monograph", label: "Kitap / Monografi" },
      { value: "academic_article", label: "Akademik Makale" },
      { value: "systematic_review", label: "Sistematik Derleme / Meta-analiz" },
      { value: "clinical_study", label: "Klinik Çalışma" },
      { value: "official_guidance", label: "Resmî Rehber / Otorite" },
      { value: "expert_educational", label: "Uzman / Eğitim" },
    ],
  },
  { key: "author_or_organization", label: "Yazar / Kurum", type: "text" },
  { key: "title", label: "Başlık", type: "text" },
  { key: "publication", label: "Yayın / Dergi", type: "text" },
  { key: "year", label: "Yıl", type: "number" },
  { key: "identifier", label: "Tanımlayıcı (DOI / PMID / ISBN)", type: "text" },
  { key: "language", label: "Dil", type: "text" },
  { key: "page_or_section", label: "Sayfa / Bölüm", type: "text" },
  { key: "source_url", label: "Bağlantı (URL)", type: "text" },
  { key: "accessed_on", label: "Erişim Tarihi", type: "text" },
  { key: "note", label: "Not", type: "textarea" },
  { key: "sort_order", label: "Sıra", type: "number" },
];

export default function KaynaklarPage() {
  return (
    <KupaShell
      title="Kaynak Kataloğu"
      subtitle="Kaynak künyeleri (tarihsel, akademik, klinik, resmî rehber…). İçerik atıfları (Kaynaklar bölümleri) bu kayıtlara bağlanır."
      breadcrumb={[{ label: "Kaynak Kataloğu" }]}
    >
      <CrudManager<CuppingSource>
        titleKey="source_name"
        subtitleKey="source_type"
        fields={FIELDS}
        load={listSources}
        create={createSource}
        update={updateSource}
        remove={deleteSource}
        emptyLabel="Henüz kaynak yok. Yeni ekleyin."
        addLabel="Kaynak"
      />
    </KupaShell>
  );
}
