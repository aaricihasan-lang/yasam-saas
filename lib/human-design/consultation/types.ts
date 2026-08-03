/**
 * HD Danışmanlık Kullanım Katmanı (F0B) · Bağlayıcı TypeScript Sözleşmeleri
 * ========================================================================
 *
 * Bu dosya, F0A'da kilitlenen 9 kalıcı yapı + snapshot + hak/entitlement
 * sözleşmelerinin SAF TypeScript karşılığıdır. DB/migration/RPC YOK; bu tur
 * yalnız tip + whitelist + enum guard'ları. RPC/persistence ileride bu
 * sözleşmeyi uygulayacaktır.
 *
 * REUSE (kopya YOK): entity türü + canonical anahtar sözleşmesi
 * lib/human-design/knowledge-system/canonicalKeys.ts'ten; evidence ilişki türü
 * lib/human-design/knowledge-system/contracts.ts'ten alınır. Uzman kaynak
 * katmanı (hd_canonical_content) tipleri DEĞİŞTİRİLMEZ.
 */

import type { HdCanonicalEntityKind, HdCanonicalKey } from "../knowledge-system/canonicalKeys";
import type { HdEvidenceRelationType } from "../knowledge-system/contracts";

export type { HdCanonicalEntityKind, HdCanonicalKey, HdEvidenceRelationType };

// ────────────────────────────────────────────────────────────────────────────
// Durum / whitelist enum'ları (ileride migration CHECK'leriyle birebir)
// ────────────────────────────────────────────────────────────────────────────

/** İçerik yaşam döngüsü: draft → published; archived son durak (assembly dışı). */
export type HdConsultationStatus = "draft" | "published" | "archived";
export const HD_CONSULTATION_STATUSES: readonly HdConsultationStatus[] = [
  "draft",
  "published",
  "archived",
] as const;

/** Başlangıç section_kind whitelist'i. Serbest key kabul edilmez. */
export type HdSectionKind =
  | "quick_reference"
  | "client_explanation"
  | "consultation_flow"
  | "relationship_guidance"
  | "career_guidance"
  | "childhood_guidance"
  | "energy_rest_guidance"
  | "practical_actions"
  | "report_ready_text";
export const HD_SECTION_KINDS: readonly HdSectionKind[] = [
  "quick_reference",
  "client_explanation",
  "consultation_flow",
  "relationship_guidance",
  "career_guidance",
  "childhood_guidance",
  "energy_rest_guidance",
  "practical_actions",
  "report_ready_text",
] as const;

/** Bölümün hangi üründe kullanılabileceği. */
export type HdUsageScope = "expert_guide" | "client_report" | "both";
export const HD_USAGE_SCOPES: readonly HdUsageScope[] = [
  "expert_guide",
  "client_report",
  "both",
] as const;

/** Koşul türü whitelist'i. Serbest SQL/JS/regex/DSL YOK. */
export type HdConditionKind = "type_is" | "authority_is" | "has_channel" | "has_gate";
export const HD_CONDITION_KINDS: readonly HdConditionKind[] = [
  "type_is",
  "authority_is",
  "has_channel",
  "has_gate",
] as const;

/** Entitlement kapsam türü. Package bu turda YOK (F3'e ertelenir). */
export type HdEntitlementScopeKind = "all_hd" | "entity";
export const HD_ENTITLEMENT_SCOPE_KINDS: readonly HdEntitlementScopeKind[] = [
  "all_hd",
  "entity",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Enum type guard'ları (saf, dar)
// ────────────────────────────────────────────────────────────────────────────

export function isHdConsultationStatus(v: unknown): v is HdConsultationStatus {
  return typeof v === "string" && (HD_CONSULTATION_STATUSES as readonly string[]).includes(v);
}
export function isHdSectionKind(v: unknown): v is HdSectionKind {
  return typeof v === "string" && (HD_SECTION_KINDS as readonly string[]).includes(v);
}
export function isHdUsageScope(v: unknown): v is HdUsageScope {
  return typeof v === "string" && (HD_USAGE_SCOPES as readonly string[]).includes(v);
}
export function isHdConditionKind(v: unknown): v is HdConditionKind {
  return typeof v === "string" && (HD_CONDITION_KINDS as readonly string[]).includes(v);
}
export function isHdEntitlementScopeKind(v: unknown): v is HdEntitlementScopeKind {
  return typeof v === "string" && (HD_ENTITLEMENT_SCOPE_KINDS as readonly string[]).includes(v);
}

// ────────────────────────────────────────────────────────────────────────────
// 1) hd_consultation_contents — danışmanlık ana kaydı
//    Exact canonical kaynak izi: id + version + hash (yalnız id yeterli DEĞİL).
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationContent = {
  id: string;
  entity_id: string;
  /** RPC canonical entity'den doldurur; GENERATED değil, composite FK ile doğrulanır. */
  entity_kind: HdCanonicalEntityKind;
  canonical_key: HdCanonicalKey;
  /** İzlenebilir kaynak-sürüm bağı (üçü birlikte). */
  canonical_content_id: string | null;
  canonical_content_version: number | null;
  canonical_content_hash: string | null;
  status: HdConsultationStatus;
  version: number;
  is_ai_generated: boolean;
  human_approved_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 2) hd_consultation_sections — asıl kullanım blokları
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationSection = {
  id: string;
  content_id: string;
  section_kind: HdSectionKind;
  body_text: string;
  topic_scope: string | null;
  usage_scope: HdUsageScope;
  status: HdConsultationStatus;
  version: number;
  supersedes_section_id: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 3) hd_consultation_questions
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationQuestion = {
  id: string;
  content_id: string;
  section_id: string | null;
  question_text: string;
  topic_scope: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 4) hd_consultation_conditions — yalnız whitelist kind + canonical değer
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationCondition = {
  id: string;
  content_id: string;
  section_id: string | null;
  condition_kind: HdConditionKind;
  /** Canonical anahtar (ör. "tip_generator", "kanal_34_57"); kind ile aile uyumlu. */
  condition_value: string;
  sort_order: number;
  created_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 5) hd_consultation_evidence — her bölüm kendi provenansını taşır
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationEvidence = {
  id: string;
  content_id: string;
  section_id: string;
  passage_id: string;
  relation_type: HdEvidenceRelationType;
  is_primary: boolean;
  is_single_source: boolean;
  editorial_note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 6) hd_consultation_expert_notes — tenant-scoped overlay (canonical'ı değiştirmez)
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationExpertNote = {
  id: string;
  tenant_id: string;
  user_id: string;
  content_id: string;
  section_id: string | null;
  note_text: string;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 7) hd_consultation_entitlements — grant defteri (aktiflik = revoked_at === null)
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationEntitlement = {
  id: string;
  tenant_id: string;
  user_id: string;
  scope_kind: HdEntitlementScopeKind;
  /** all_hd → null zorunlu; entity → dolu zorunlu. */
  entity_id: string | null;
  granted_by_admin_id: string;
  granted_at: string;
  revoked_at: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// 8) hd_consultation_sessions — uzman görüşme oturumu (tenant-scoped)
// ────────────────────────────────────────────────────────────────────────────

export type HdConsultationSession = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_id: string;
  chart_id: string;
  topic_scope: string | null;
  fetched_snapshot: HdConsultationSnapshot;
  selected_section_ids: string[];
  expert_notes_snapshot: HdExpertNoteSnapshotEntry[];
  session_date: string;
  guide_snapshot: HdConsultationSnapshot;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 9) hd_client_reports — danışan raporu (tenant-scoped, immutable snapshot)
// ────────────────────────────────────────────────────────────────────────────

export type HdClientReport = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_id: string;
  chart_id: string;
  /** nullable; doluysa aynı tenant/client + uyumlu chart kontrolü zorunludur. */
  session_id: string | null;
  client_snapshot: HdConsultationSnapshot;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Snapshot sözleşmesi — canonical/danışmanlık sonradan değişse DEĞİŞMEZ
// ────────────────────────────────────────────────────────────────────────────

export type HdSnapshotSectionEntry = {
  content_id: string;
  content_version: number;
  section_id: string;
  section_version: number;
  section_kind: HdSectionKind;
  usage_scope: HdUsageScope;
  canonical_content_id: string | null;
  canonical_content_version: number | null;
  canonical_content_hash: string | null;
  /** Render anındaki TEMİZ gövde (dondurulmuş). */
  rendered_body: string;
  /** Bu bölümün üretim anındaki hak kararı. */
  rights_decision: RightsDecision;
};

export type HdExpertNoteSnapshotEntry = {
  section_id: string | null;
  note_text: string;
};

export type HdConsultationSnapshot = {
  /** Snapshot ürünü: uzman rehberi mi danışan raporu mu. */
  product: HdProduct;
  produced_at: string;
  entries: HdSnapshotSectionEntry[];
};

// ────────────────────────────────────────────────────────────────────────────
// Hak (rights) sözleşmesi — açık alanlar; içerik/çeviri varlığından türetilmez
// ────────────────────────────────────────────────────────────────────────────

/** Danışmanlık ürünü (hak eşiği bakımından). */
export type HdProduct = "expert_guide" | "client_report";
export const HD_PRODUCTS: readonly HdProduct[] = ["expert_guide", "client_report"] as const;

/**
 * Kaynak hak alanları (default-deny). translation_allowed ve quotation_allowed
 * AÇIK boolean'dır (verified çeviri varlığından / serbest quotation_limit
 * metninden TÜRETİLMEZ). Bu şekil, F1'de hd_sources'a additif kolonlar gerektirir.
 */
export type HdSourceRights = {
  internal_use_allowed: boolean;
  expert_delivery_allowed: boolean;
  private_report_use_allowed: boolean;
  translation_allowed: boolean;
  quotation_allowed: boolean;
  quotation_word_limit: number | null;
  rights_status: HdRightsStatus;
};

/** Passage override: her alan NULL = kaynaktan devral. */
export type HdPassageRightsOverride = {
  internal_use_allowed: boolean | null;
  expert_delivery_allowed: boolean | null;
  private_report_use_allowed: boolean | null;
  translation_allowed: boolean | null;
  quotation_allowed: boolean | null;
  quotation_word_limit: number | null;
  rights_status: HdRightsStatus | null;
};

export type HdRightsStatus =
  | "public_domain"
  | "licensed"
  | "permission_granted"
  | "permission_pending"
  | "restricted"
  | "unknown";

/** Teslim/dağıtımı engelleyen hak durumları (fail-closed). */
export const HD_BLOCKING_RIGHTS_STATUSES: readonly HdRightsStatus[] = [
  "permission_pending",
  "restricted",
  "unknown",
] as const;

/** Çözülmüş effective hak (override NULL değilse override, aksi halde source). */
export type HdEffectiveRights = HdSourceRights;

export type RightsDenyReason =
  | "INTERNAL_USE_DENIED"
  | "EXPERT_DELIVERY_DENIED"
  | "PRIVATE_REPORT_USE_DENIED"
  | "TRANSLATION_DENIED"
  | "QUOTATION_DENIED"
  | "QUOTATION_LIMIT_UNKNOWN"
  | "QUOTATION_LIMIT_EXCEEDED"
  | "RIGHTS_STATUS_BLOCKED"
  | "NO_RIGHTS_INFO";

/** Hak kararı — tam kaynak metni/hak notu SIZDIRILMAZ; yalnız neden kodu. */
export type RightsDecision =
  | { allowed: true }
  | { allowed: false; reason: RightsDenyReason };

// ────────────────────────────────────────────────────────────────────────────
// Uzman görünürlük AND kapıları — contract seviyesinde ifade
// ────────────────────────────────────────────────────────────────────────────

/** Nihai uzman görünürlüğü için birlikte aranan AND kapıları. */
export type HdExpertVisibilityGates = {
  activeUser: boolean;
  humanDesignModulePermission: boolean;
  contentEntitlement: boolean;
  publishedNonArchivedContent: boolean;
  rightsPassForProduct: boolean;
};
