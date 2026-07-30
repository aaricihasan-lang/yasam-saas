/**
 * Aromaterapi V2 — C3D-D Bilgi Kaydı (claim) yazma formu KANONİK SÖZLEŞMESİ (client-safe).
 *
 * SAF: server-only YOK, Supabase/secret YOK. Değerler mevcut C2S RPC + C2T route
 * allowlist'lerinden (production) türetilmiştir; TAHMİNLE yeni enum/değer EKLENMEZ.
 * Çocuk (child) obje anahtar sözleşmeleri C2S create/update RPC allowlist'leriyle birebir.
 *
 * Kullanıcıya "claim" GÖSTERİLMEZ; etiketler @/lib/aromaterapi/readLabels'tan gelir.
 */

// ---- Core enum allowlist'leri (C2S/C2T ile birebir) ----
export const CLAIM_TYPES = ["safety", "use", "identity", "chemistry"] as const;
export const CONCLUSION_PROVENANCES = [
  "source_original",
  "faithful_translation",
  "editorial_explanation",
  "editorial_interpretation",
] as const;
export const EVIDENCE_LAYERS = [
  "regulatory",
  "scientific_review",
  "clinical",
  "experimental",
  "traditional",
  "experiential",
  "energetic",
] as const;
export const RATIONALE_STATUSES = ["from_source", "source_gives_no_rationale"] as const;
export const OUTCOME_TYPES = [
  "harm_shown",
  "risk_suspected",
  "insufficient_data",
  "no_study_done",
  "no_dose_found",
  "source_does_not_recommend",
  "source_contraindicates",
  "context_specific_non_recommendation",
  "conflicting",
  "unknown",
  "not_classified_as_risk_in_reviewed_source",
] as const;
/** status YALNIZ update patch'te izinli (create'te DB default'una bırakılır). */
export const CLAIM_STATUSES = ["draft", "under_review", "needs_verification"] as const;

// ---- Child enum allowlist'leri ----
export const ROUTE_CODES = ["oral", "topical", "inhalation", "other", "unknown"] as const;
export const POPULATION_CODES = [
  "infant",
  "child",
  "adolescent",
  "adult",
  "older_adult",
  "pregnancy",
  "lactation",
] as const;
export const SOURCE_ROLES = [
  "primary_support",
  "secondary_support",
  "contradiction",
  "context",
] as const;
export const VERIFICATION_STATUSES = ["unverified", "verified"] as const;
export const PASSAGE_KINDS = ["excerpt", "full_text"] as const;
export const EVIDENCE_RELATIONS = [
  "supports",
  "partially_supports",
  "qualifies",
  "limits",
  "contradicts",
  "contextualizes",
] as const;
export const RELATION_TYPES = [
  "complementary",
  "alternative",
  "partially_overlapping",
  "conflicting",
  "context_specific",
] as const;

// ---- Biçim kuralları ----
export const SAFETY_TOPIC_RE = /^[a-z][a-z0-9_]*$/;
export const PREPARATION_CONTEXT_RE = /^[a-z][a-z0-9_]*$/;
export const REASON_MAX_LEN = 2000;
export const AGE_MIN_LO = 0;
export const AGE_MAX_HI = 120;

// ---- Coupling kuralları (C2S CHECK'leriyle birebir) ----
/** claim_type='safety' → safety_topic ZORUNLU + regex; değilse NULL. */
export function safetyTopicRequired(claimType: string): boolean {
  return claimType === "safety";
}
/** claim_type='safety' → outcome_type ZORUNLU; değilse NULL. */
export function outcomeTypeRequired(claimType: string): boolean {
  return claimType === "safety";
}
/** from_source → rationale ZORUNLU; source_gives_no_rationale → rationale NULL olmalı. */
export function rationaleRequired(rationaleStatus: string): boolean {
  return rationaleStatus === "from_source";
}

/**
 * Child yazma anahtar sözleşmeleri (C2S RPC allowlist'leriyle birebir). Fazla anahtar
 * → RPC AROMA_INVALID_PAYLOAD/AROMA_IMMUTABLE_FIELD. relations a/b istemciden gelmez:
 * yalnız other_claim_id gönderilir (server least/greatest ile kanonikleştirir).
 */
export const CHILD_KEY_CONTRACT = {
  routes: ["route_code"],
  populations: ["population_code", "age_min", "age_max"],
  sources: [
    "source_id",
    "source_role",
    "locator_text",
    "url_fragment",
    "source_original_excerpt",
    "faithful_translation",
    "verification_status",
  ],
  passages: ["passage_id", "passage_kind", "evidence_relation", "verification_status"],
  relations: ["other_claim_id", "relation_type", "explanation_tr"],
} as const;

/** Create body core allowlist (C2T POST route CREATE_ALLOWED_KEYS ile birebir). */
export const CREATE_CORE_KEYS = [
  "preparation_id",
  "claim_type",
  "conclusion",
  "conclusion_provenance",
  "evidence_layer",
  "rationale_status",
  "safety_topic",
  "preparation_context",
  "outcome_type",
  "rationale",
] as const;

/** Update patch core allowlist (C2T PATCH route PATCH_ALLOWED_KEYS ile birebir; status DAHİL). */
export const UPDATE_PATCH_KEYS = [
  "claim_type",
  "safety_topic",
  "preparation_context",
  "conclusion",
  "conclusion_provenance",
  "outcome_type",
  "evidence_layer",
  "rationale",
  "rationale_status",
  "status",
] as const;
