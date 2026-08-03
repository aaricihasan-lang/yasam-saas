// ============================================================
// YEBS A8 — Paylaşımlı UI DTO/tip sözleşmesi (client-safe)
//
// Backend DTO'ları YENİDEN İCAT EDİLMEZ; buradaki tipler lib/yebs/service/*
// katmanındaki exact route/servis dönüşlerinin birebir UI yansımasıdır.
// Bu dosya "server-only" DEĞİLDİR: hem sunucu hem istemci bileşenleri import edebilir.
// service_role veya gizli hiçbir şey burada yer almaz.
// ============================================================

// ---- Status kümeleri (backend CHECK ile birebir) ----
export const CANONICAL_STATUSES = ["draft", "verified", "approved", "published"] as const;
export const SOURCE_STATUSES = ["draft", "verified", "approved", "published", "archived"] as const;
export const CLAIMLIKE_STATUSES = [
  "draft",
  "under_review",
  "needs_verification",
  "verified",
  "approved",
  "published",
  "archived",
] as const;
export const VERIFICATION_STATUSES = ["unverified", "verified", "rejected"] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export type ClaimLikeStatus = (typeof CLAIMLIKE_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type AnyStatus = CanonicalStatus | SourceStatus | ClaimLikeStatus;

// ---- Entity enum kümeleri (backend ile birebir) ----
export const CONCEPT_TYPES = [
  "energy_center", "channel", "vital_substance", "anatomy_model", "technique", "principle", "other",
] as const;

export const SOURCE_TYPES = [
  "classical_text", "book", "journal_article", "regulatory_document", "monograph", "standard",
  "database_record", "thesis", "website", "oral_tradition_record", "other",
  "institutional_report", "archival_document", "media_recording", "interview_record",
  "field_observation_record", "experiential_record",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CLAIM_TYPES = ["identity", "function", "relationship", "practice", "safety", "research_finding"] as const;
export const CLAIM_PROVENANCE_KINDS = [
  "source_original", "faithful_translation", "editorial_explanation", "editorial_interpretation",
] as const;
export const EVIDENCE_LAYERS = [
  "classical_textual", "traditional", "ethnographic", "clinical", "experimental",
  "scientific_review", "regulatory", "experiential", "energetic_metaphysical",
] as const;
export type EvidenceLayer = (typeof EVIDENCE_LAYERS)[number];

export const RELATION_TYPES = ["broader_than", "part_of", "related_to", "contrasted_with", "corresponds_to"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const LABEL_KINDS = ["original", "transliteration", "faithful_translation", "common_name", "alternative"] as const;
export const EVIDENCE_ROLES = ["primary_support", "supporting", "contradiction", "context"] as const;
export const RATIONALE_STATUSES = ["from_source", "source_gives_no_rationale"] as const;

// ---- Row tipleri (service DTO'larıyla birebir) ----
export type TraditionRow = {
  id: string; slug: string; name_tr: string; tradition_type: string;
  native_name: string | null; native_language_tag: string | null; native_script_code: string | null;
  status: string; created_at: string; updated_at: string;
};

export type SchoolRow = {
  id: string; tradition_id: string; slug: string; name_tr: string;
  native_name: string | null; native_language_tag: string | null; native_script_code: string | null;
  status: string; created_at: string; updated_at: string;
};

export type ConceptRow = {
  id: string; tradition_id: string; school_id: string | null; slug: string;
  concept_type: string; status: string; created_at: string; updated_at: string;
};

export type ConceptLabelRow = {
  id: string; concept_id: string; language_tag: string; script_code: string; label: string;
  label_kind: string; transliteration_scheme: string | null; is_primary: boolean;
  created_at: string; updated_at: string;
};

export type SourceRow = {
  id: string; source_type: string; title: string; language_tag: string; script_code: string | null;
  authors: string | null; organization: string | null; publisher: string | null;
  publication_year: number | null; dating_note: string | null; edition: string | null;
  doi: string | null; pmid: string | null; isbn: string | null; url: string | null; document_no: string | null;
  tradition_context_id: string | null; status: string; notes: string | null;
  created_at: string; updated_at: string; accessed_on: string | null;
};

export type ClaimRow = {
  id: string; concept_id: string; claim_type: string; claim_text: string;
  provenance_kind: string; evidence_layer: string; outcome_type: string | null; safety_topic: string | null;
  status: string; created_at: string; updated_at: string;
};

export type ClaimSourceRow = {
  id: string; claim_id: string; source_id: string; source_role: string;
  locator_text: string | null; url_fragment: string | null;
  source_original_excerpt: string | null; source_original_language_tag: string | null;
  source_original_script_code: string | null; transliteration: string | null; transliteration_scheme: string | null;
  faithful_translation: string | null; translation_language_tag: string | null;
  rationale: string | null; rationale_status: string; verification_status: string;
  created_at: string; updated_at: string;
};

export type ConceptRelationRow = {
  id: string; source_concept_id: string; target_concept_id: string;
  relation_type: string; status: string; created_at: string; updated_at: string;
};

export type ConceptRelationSourceRow = {
  id: string; concept_relation_id: string; source_id: string; evidence_layer: string; source_role: string;
  locator_text: string | null; url_fragment: string | null;
  source_original_excerpt: string | null; source_original_language_tag: string | null;
  source_original_script_code: string | null; transliteration: string | null; transliteration_scheme: string | null;
  faithful_translation: string | null; translation_language_tag: string | null;
  rationale: string | null; rationale_status: string; verification_status: string;
  created_at: string; updated_at: string;
};

// ---- API zarfları (route sözleşmesiyle birebir) ----
export type ListEnvelope<T> = { rows: T[]; count: number | null; limit: number; offset: number };

/** Tek yönlü client sonucu: başarı=data; hata=stable code + Türkçe UI mesajı taşınabilir. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string; status: number };

// ---- Entity kimlikleri ----
export const YEBS_ENTITIES = ["tradition", "school", "concept", "source", "claim", "relation"] as const;
export type YebsEntity = (typeof YEBS_ENTITIES)[number];
