/**
 * YEBS — Admin-only READ-ONLY uzman vitrini: kullanıcı-dostu etiket sözlükleri.
 *
 * Bu dosya YALNIZ görüntüleme etiketleridir; hiçbir backend enum'unu değiştirmez.
 * Ham internal enum değerleri UI'da doğrudan gösterilmez → her değer buradaki
 * Türkçe kullanıcı-dostu karşılığına map'lenir. Kapalı küme olduklarından map
 * daima isabet eder; beklenmeyen değer için güvenli genel karşılık döner.
 *
 * server & client tarafında ortak kullanılabilir (yan etkisiz saf sabitler).
 */

function pick(map: Record<string, string>, value: string, fallback: string): string {
  return map[value] ?? fallback;
}

const TRADITION_TYPE: Record<string, string> = {
  cultural_tradition: "Kültürel Gelenek",
  historical_system: "Tarihsel Sistem",
  modern_system: "Modern Sistem",
  professional_framework: "Profesyonel Çerçeve",
  research_framework: "Araştırma Çerçevesi",
};

const CONCEPT_TYPE: Record<string, string> = {
  energy_center: "Enerji Merkezi",
  channel: "Kanal",
  vital_substance: "Yaşamsal Öz",
  anatomy_model: "Anatomi Modeli",
  technique: "Teknik",
  principle: "İlke",
  other: "Diğer",
};

const CLAIM_TYPE: Record<string, string> = {
  identity: "Tanım",
  function: "İşlev",
  relationship: "İlişki",
  practice: "Uygulama",
  safety: "Güvenlik",
  research_finding: "Araştırma Bulgusu",
};

const PROVENANCE_KIND: Record<string, string> = {
  source_original: "Özgün kaynak metni",
  faithful_translation: "Sadık çeviri",
  editorial_explanation: "Editoryal açıklama",
  editorial_interpretation: "Editoryal yorum",
};

const EVIDENCE_LAYER: Record<string, string> = {
  classical_textual: "Klasik metin",
  traditional: "Geleneksel",
  ethnographic: "Etnografik",
  clinical: "Klinik",
  experimental: "Deneysel",
  scientific_review: "Bilimsel derleme",
  regulatory: "Düzenleyici",
  experiential: "Deneyimsel",
  energetic_metaphysical: "Enerjetik / Metafizik",
};

const SOURCE_TYPE: Record<string, string> = {
  classical_text: "Klasik metin",
  book: "Kitap",
  journal_article: "Makale",
  regulatory_document: "Düzenleyici belge",
  monograph: "Monografi",
  standard: "Standart",
  database_record: "Veritabanı kaydı",
  thesis: "Tez",
  website: "Web sitesi",
  oral_tradition_record: "Sözlü gelenek kaydı",
  other: "Diğer",
  institutional_report: "Kurumsal rapor",
  archival_document: "Arşiv belgesi",
  media_recording: "Medya kaydı",
  interview_record: "Görüşme kaydı",
  field_observation_record: "Saha gözlem kaydı",
  experiential_record: "Deneyim kaydı",
};

const SOURCE_ROLE: Record<string, string> = {
  primary_support: "Birincil destek",
  supporting: "Destekleyici",
  contradiction: "Çelişki",
  context: "Bağlam",
};

const RELATION_TYPE: Record<string, string> = {
  broader_than: "Daha geniş kavram",
  part_of: "Parçasıdır",
  related_to: "İlişkilidir",
  contrasted_with: "Karşılaştırılır / Karşıt bağlam",
  corresponds_to: "Karşılık gelir",
};

const LABEL_KIND: Record<string, string> = {
  original: "Özgün",
  transliteration: "Transliterasyon",
  faithful_translation: "Sadık çeviri",
  common_name: "Yaygın ad",
  alternative: "Alternatif",
};

const STATUS: Record<string, string> = {
  draft: "Taslak",
  under_review: "İncelemede",
  needs_verification: "Doğrulama bekliyor",
  verified: "Doğrulandı",
  approved: "Onaylandı",
  published: "Yayınlandı",
  archived: "Arşivlendi",
};

export const yebsLabel = {
  traditionType: (v: string) => pick(TRADITION_TYPE, v, "Gelenek"),
  conceptType: (v: string) => pick(CONCEPT_TYPE, v, "Kavram"),
  claimType: (v: string) => pick(CLAIM_TYPE, v, "Bilgi"),
  provenanceKind: (v: string) => pick(PROVENANCE_KIND, v, "Kaynak metni"),
  evidenceLayer: (v: string) => pick(EVIDENCE_LAYER, v, "Kanıt katmanı"),
  sourceType: (v: string) => pick(SOURCE_TYPE, v, "Kaynak"),
  sourceRole: (v: string) => pick(SOURCE_ROLE, v, "Kaynak rolü"),
  relationType: (v: string) => pick(RELATION_TYPE, v, "İlişkilidir"),
  labelKind: (v: string) => pick(LABEL_KIND, v, "Ad"),
  status: (v: string) => pick(STATUS, v, "Durum"),
} as const;
