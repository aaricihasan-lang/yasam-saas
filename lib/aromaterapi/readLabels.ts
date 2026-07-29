/**
 * Aromaterapi V2 — C3C enum → Türkçe kullanıcı etiketi sözlüğü (client-safe).
 *
 * Gerçek şema kodları (preparation_type, claim_type, evidence_layer, ...) kullanıcıya
 * ASLA ham gösterilmez. "claim" teknik terimi UI'da geçmez; her yerde "Bilgi Kaydı".
 * Bilinmeyen kod → kodun kendisi (dürüst fallback; uydurma yok).
 */

function label(map: Record<string, string>, code: string | null | undefined): string {
  if (!code) return "—";
  return map[code] ?? code;
}

export const PREPARATION_TYPE_TR: Record<string, string> = {
  essential_oil: "Uçucu Yağ",
  hydrosol: "Hidrosol",
  dried_plant_material: "Kuru Bitki Materyali",
  tincture: "Tentür",
  infusion: "İnfüzyon",
  decoction: "Dekoksiyon",
  extract: "Ekstrakt",
  infused_oil: "Maserasyon (İnfüze) Yağı",
  absolute: "Absolü",
  concrete: "Konkret",
  resinoid: "Rezinoit",
  oleoresin: "Oleorezin",
  fixed_oil: "Sabit Yağ",
  powder: "Toz",
  other: "Diğer",
};

export const TAXON_RANK_TR: Record<string, string> = {
  species: "Tür",
  subspecies: "Alt tür",
  variety: "Varyete",
  forma: "Forma",
};

export const CATALOG_STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  verified: "Doğrulanmış",
  approved: "Onaylanmış",
};

export const SOURCE_TYPE_TR: Record<string, string> = {
  book: "Kitap",
  journal_article: "Dergi Makalesi",
  regulatory_document: "Düzenleyici Belge",
  monograph: "Monograf",
  standard: "Standart",
  database_record: "Veritabanı Kaydı",
  website: "Web Sitesi",
  other: "Diğer",
};

export const SOURCE_STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  verified: "Doğrulanmış",
  archived: "Arşivlenmiş",
};

export const PASSAGE_KIND_TR: Record<string, string> = {
  excerpt: "Alıntı",
  full_text: "Tam Metin",
  reference_only: "Yalnız Atıf",
};

export const RIGHTS_STATUS_TR: Record<string, string> = {
  public_domain: "Kamu Malı",
  licensed: "Lisanslı",
  permission_granted: "İzinli",
  restricted: "Kısıtlı",
  pending_review: "İnceleme Bekliyor",
  unknown: "Bilinmiyor",
};

export const FIDELITY_TR: Record<string, string> = {
  literal: "Birebir",
  faithful: "Sadık",
};

export const EDITORIAL_NOTE_TYPE_TR: Record<string, string> = {
  summary: "Özet",
  context: "Bağlam",
  terminology: "Terminoloji",
  cultural: "Kültürel Not",
  plain_language: "Sade Dil Açıklaması",
  expert_commentary: "Uzman Notu",
};

export const CLAIM_TYPE_TR: Record<string, string> = {
  safety: "Güvenlik",
  use: "Kullanım",
  identity: "Kimlik",
  chemistry: "Kimya",
};

export const CLAIM_STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  under_review: "İncelemede",
  needs_verification: "Doğrulama Gerekli",
};

export const EVIDENCE_LAYER_TR: Record<string, string> = {
  regulatory: "Düzenleyici",
  scientific_review: "Bilimsel Derleme",
  clinical: "Klinik",
  experimental: "Deneysel",
  traditional: "Geleneksel",
  experiential: "Deneyimsel",
  energetic: "Enerjetik",
};

export const RATIONALE_STATUS_TR: Record<string, string> = {
  from_source: "Kaynaktan Gerekçeli",
  source_gives_no_rationale: "Kaynak Gerekçe Vermiyor",
};

export const CONCLUSION_PROVENANCE_TR: Record<string, string> = {
  source_original: "Özgün Kaynak Metni",
  faithful_translation: "Sadık Çeviri",
  editorial_explanation: "Editoryal Açıklama",
  editorial_interpretation: "Editoryal Yorum",
};

export const OUTCOME_TYPE_TR: Record<string, string> = {
  harm_shown: "Zarar Gösterildi",
  risk_suspected: "Risk Şüphesi",
  insufficient_data: "Yetersiz Veri",
  no_study_done: "Çalışma Yapılmamış",
  no_dose_found: "Doz Bulunmadı",
  source_does_not_recommend: "Kaynak Önermiyor",
  source_contraindicates: "Kaynak Kontrendike",
  context_specific_non_recommendation: "Bağlama Özel Öneri Yok",
  conflicting: "Çelişkili",
  unknown: "Bilinmiyor",
  not_classified_as_risk_in_reviewed_source: "İncelenen Kaynakta Risk Sınıfı Yok",
};

export const ROUTE_CODE_TR: Record<string, string> = {
  oral: "Ağızdan",
  topical: "Haricen (Cilt)",
  inhalation: "Solunum",
  other: "Diğer",
  unknown: "Bilinmiyor",
};

export const POPULATION_CODE_TR: Record<string, string> = {
  infant: "Bebek",
  child: "Çocuk",
  adolescent: "Ergen",
  adult: "Yetişkin",
  older_adult: "İleri Yaş",
  pregnancy: "Gebelik",
  lactation: "Emzirme",
};

export const SOURCE_ROLE_TR: Record<string, string> = {
  primary_support: "Birincil Destek",
  secondary_support: "İkincil Destek",
  contradiction: "Çelişki",
  context: "Bağlam",
};

export const EVIDENCE_RELATION_TR: Record<string, string> = {
  supports: "Destekler",
  partially_supports: "Kısmen Destekler",
  qualifies: "Niteler",
  limits: "Sınırlar",
  contradicts: "Çelişir",
  contextualizes: "Bağlamlandırır",
};

export const RELATION_TYPE_TR: Record<string, string> = {
  complementary: "Tamamlayıcı",
  alternative: "Alternatif",
  partially_overlapping: "Kısmen Örtüşen",
  conflicting: "Çelişen",
  context_specific: "Bağlama Özel",
};

export const VERIFICATION_STATUS_TR: Record<string, string> = {
  unverified: "Doğrulanmamış",
  verified: "Doğrulanmış",
};

export const GLOSSARY_STATUS_TR = SOURCE_STATUS_TR;
export const AUDIT_OPERATION_TR: Record<string, string> = {
  create: "Oluşturma",
  update: "Güncelleme",
};

export const tr = { label };
