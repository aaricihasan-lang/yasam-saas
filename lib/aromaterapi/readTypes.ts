/**
 * Aromaterapi V2 — C3C tenant-kapsamlı okuma katmanı ortak tipleri.
 *
 * SAF TİP DOSYASI: `server-only` YOK, Supabase/secret YOK. Hem sunucu okuma
 * servisleri (lib/aromaterapi/service/*Reads.ts) hem istemci veri sarmalayıcıları
 * (lib/aromaterapi/*Data.ts) aynı sözleşmeyi paylaşsın; liste-öğesi ve detay
 * tipleri drift etmesin diye tek kaynaktır.
 *
 * Not: Tüm gerçek şema (aromatherapy_*) tabloları RLS-kilitlidir ve yalnız
 * service_role SELECT'ine sahiptir; tarayıcı bu tablolara DOĞRUDAN erişmez.
 * Bu tipler yalnız sunucudan dönen güvenli okuma projeksiyonlarını modeller.
 */

/** Ortak liste zarfı — her C3C liste route'u bu biçimde döner. */
export type ReadListEnvelope<T> = {
  rows: T[];
  page: number;
  limit: number;
  total: number;
};

/** Sayfalama sabitleri — sunucu ve istemci aynı sınırları kullanır. */
export const READ_DEFAULT_PAGE = 1;
export const READ_DEFAULT_LIMIT = 25;
export const READ_MAX_LIMIT = 100;
export const READ_MAX_Q_LEN = 200;

// ------------------------------------------------------------------
// Katalog — Bitki (takson) & Preparat
// ------------------------------------------------------------------

export type PlantTaxonListItem = {
  id: string;
  canonical_name: string;
  genus: string;
  species: string;
  taxon_rank: string;
  family: string;
  author_citation: string | null;
  is_hybrid: boolean;
  status: string;
  updated_at: string;
};

export type PlantTaxonDetail = PlantTaxonListItem & {
  infraspecific_epithet: string | null;
  created_at: string;
};

export type PreparationListItem = {
  id: string;
  taxon_id: string;
  preparation_type: string;
  plant_part: string;
  chemotype: string | null;
  status: string;
  updated_at: string;
  /** Bağlı taksonun okunur kanonik adı (tenant-scoped join). */
  taxon_canonical_name: string | null;
};

export type PreparationDetail = PreparationListItem & {
  created_at: string;
  taxon: PlantTaxonListItem | null;
  /** Bu preparata bağlı, aynı tenant'taki bilgi kaydı sayısı. */
  knowledge_record_count: number;
};

// ------------------------------------------------------------------
// Kaynaklar — Kaynak, Pasaj, Pasaj Katmanları
// ------------------------------------------------------------------

export type SourceListItem = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  authors: string | null;
  organization: string | null;
  publication_year: number | null;
  updated_at: string;
  /** Bu kaynağa bağlı pasaj sayısı (tenant-scoped). */
  passage_count: number;
};

export type SourceDetail = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  authors: string | null;
  organization: string | null;
  publication_year: number | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  document_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  passage_count: number;
  /** Bu kaynağa dayanan bilgi kaydı sayısı (claim_sources üzerinden). */
  knowledge_record_count: number;
};

export type PassageListItem = {
  id: string;
  source_id: string;
  locator_label: string;
  passage_kind: string;
  original_lang: string;
  rights_status: string;
  status: string;
  sort_key: number | null;
  /** Yalnız görünürlük özeti — tam metin detay uçta gelir. */
  has_original_text: boolean;
};

/** Sadık çeviri katmanı (fidelity yalnız literal/faithful). */
export type PassageTranslationLayer = {
  id: string;
  target_lang: string;
  source_lang: string;
  translated_text: string;
  fidelity: string;
  translation_method: string;
  translation_source: string;
  translator_name: string | null;
  status: string;
  review_status: string;
  revision: number;
};

/** Editoryal katman (açıklama / yorum / uzman notu) — kind series'ten gelir. */
export type PassageEditorialLayer = {
  id: string;
  note_series_id: string;
  note_type: string;
  editorial_class: string;
  note_lang: string;
  note_text: string;
  author_name: string | null;
  creation_method: string;
  status: string;
  review_status: string;
  revision: number;
};

export type PassageDetail = {
  id: string;
  source_id: string;
  locator_label: string;
  passage_kind: string;
  original_lang: string;
  rights_status: string;
  rights_note: string | null;
  status: string;
  /** 1) Özgün Kaynak Metni (reference_only ise null). */
  original_text: string | null;
  created_at: string;
  updated_at: string;
  /** 2) Sadık Çeviriler. */
  translations: PassageTranslationLayer[];
  /** 3) Editoryal Açıklamalar (editorial_explanation). */
  editorial_explanations: PassageEditorialLayer[];
  /** 4/5) Editoryal Yorumlar + Uzman Notları (editorial_interpretation). */
  editorial_interpretations: PassageEditorialLayer[];
};

// ------------------------------------------------------------------
// Bilgi Kayıtları (claims) + Değişiklik Geçmişi (audit)
// ------------------------------------------------------------------

export type KnowledgeRecordListItem = {
  id: string;
  claim_type: string;
  conclusion: string;
  conclusion_provenance: string;
  evidence_layer: string;
  rationale_status: string;
  status: string;
  safety_topic: string | null;
  outcome_type: string | null;
  preparation_id: string;
  preparation_context: string | null;
  updated_at: string;
  /** Bağlı preparatın okunur özeti. */
  preparation_type: string | null;
  taxon_canonical_name: string | null;
};

export type KnowledgeRouteItem = { id: string; route_code: string };
export type KnowledgePopulationItem = {
  id: string;
  population_code: string;
  age_min: number | null;
  age_max: number | null;
};
export type KnowledgeSourceLink = {
  id: string;
  source_id: string;
  source_role: string;
  verification_status: string;
  locator_text: string | null;
  source_original_excerpt: string | null;
  faithful_translation: string | null;
  source_title: string | null;
};
export type KnowledgePassageLink = {
  id: string;
  passage_id: string;
  passage_kind: string;
  evidence_relation: string;
  verification_status: string;
  passage_locator_label: string | null;
};
export type KnowledgeRelationLink = {
  id: string;
  a_claim_id: string;
  b_claim_id: string;
  relation_type: string;
  explanation_tr: string;
};

export type KnowledgeRecordDetail = {
  id: string;
  claim_type: string;
  safety_topic: string | null;
  route: string | null;
  preparation_context: string | null;
  conclusion: string;
  conclusion_provenance: string;
  outcome_type: string | null;
  evidence_layer: string;
  rationale: string | null;
  rationale_status: string;
  status: string;
  preparation_id: string;
  created_at: string;
  /** Optimistic concurrency için gerekli. */
  updated_at: string;
  preparation: PreparationListItem | null;
  routes: KnowledgeRouteItem[];
  populations: KnowledgePopulationItem[];
  sources: KnowledgeSourceLink[];
  passages: KnowledgePassageLink[];
  relations: KnowledgeRelationLink[];
};

export type KnowledgeAuditEvent = {
  id: string;
  occurred_at: string;
  operation: string;
  actor_label_snapshot: string;
  reason: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown>;
  warnings: unknown[];
};

// ------------------------------------------------------------------
// Sözlük (glossary)
// ------------------------------------------------------------------

export type GlossaryTermListItem = {
  id: string;
  canonical_term_tr: string;
  canonical_term_en: string | null;
  short_definition_tr: string;
  professional_definition_tr: string | null;
  status: string;
  updated_at: string;
};
