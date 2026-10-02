"use client";

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

/**
 * Kupa & Hacamat — Kaynak Kataloğu. Citation'lar (içerik ↔ kaynak atıfları) bu
 * katalogdaki kayıtlara bağlanır. FAZ 1.5 bibliyografik alanlar burada girilir.
 */

const SOURCE_TYPE_OPTIONS = [
  { value: "historical_primary", label: "Tarihsel Birincil" },
  { value: "historical_secondary", label: "Tarihsel İkincil" },
  { value: "book_monograph", label: "Kitap / Monografi" },
  { value: "academic_article", label: "Akademik Makale" },
  { value: "systematic_review", label: "Sistematik Derleme / Meta-analiz" },
  { value: "clinical_study", label: "Klinik Çalışma" },
  { value: "official_guidance", label: "Resmî Rehber / Otorite" },
  { value: "expert_educational", label: "Uzman / Eğitim" },
];

const FIELDS: FieldDef[] = [
  { key: "source_name", label: "Kaynak Adı", type: "text", required: true },
  {
    key: "source_type",
    label: "Bibliyografik Tür",
    type: "select",
    options: SOURCE_TYPE_OPTIONS,
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

/** Atıf türü → kullanıcı dili (silme etkisi mesajı). */
const CITATION_LABELS: Record<CuppingCitationEntity, string> = {
  point: "nokta",
  topic: "amaç/rahatsızlık",
  "point-topic": "nokta–konu ilişkisi",
  technique: "teknik",
  knowledge: "bilgi kaydı",
  safety: "güvenlik maddesi",
};

/**
 * P2-3 — Kaynak silinince bağlı atıflar (6 tablo) CASCADE ile silinir; protokol kaynakları ve
 * protokol bilgileri ise silmeyi ENGELLER. Silme onayından ÖNCE gerçek sayılar DB'den alınır.
 */
async function sourceDeleteImpact(rec: CuppingSource): Promise<{ message: string; blocked?: boolean }> {
  const u = await getSourceUsage(rec.id);
  const protocolUse = u.protocolSources + u.protocolEntries;
  if (protocolUse > 0) {
    const parts = [
      u.protocolSources > 0 ? `${u.protocolSources} protokol kaynağı` : "",
      u.protocolEntries > 0 ? `${u.protocolEntries} protokol bilgisi` : "",
    ].filter(Boolean);
    return {
      blocked: true,
      message:
        `“${rec.source_name}” kaynağı ${parts.join(" ve ")} tarafından kullanılıyor; bu nedenle silinemez. ` +
        `Önce ilgili protokollerden bu kaynağı çıkarın.`,
    };
  }
  if (u.citationTotal === 0) return { message: "Bu kaynağa bağlı atıf yok." };
  const detail = (Object.keys(u.citations) as CuppingCitationEntity[])
    .filter((k) => u.citations[k] > 0)
    .map((k) => `${u.citations[k]} ${CITATION_LABELS[k]}`)
    .join(", ");
  return {
    message: `Bu kaynak ${u.citationTotal} atıfta kullanılıyor (${detail}). Kaynak silinirse bu atıfların tamamı da kalıcı olarak kaldırılacaktır.`,
  };
}

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
        loadDeleteImpact={sourceDeleteImpact}
        emptyLabel="Henüz kaynak yok. Yeni ekleyin."
        addLabel="Kaynak"
        searchKeys={[
          "source_name",
          "title",
          "author_or_organization",
          "publication",
          "identifier",
          "note",
          "year",
        ]}
        searchPlaceholder="Ada, yazara veya detaya göre ara…"
        filters={[{ key: "source_type", label: "Tür", options: SOURCE_TYPE_OPTIONS }]}
      />
    </KupaShell>
  );
}
