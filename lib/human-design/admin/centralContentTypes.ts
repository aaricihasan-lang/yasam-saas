/**
 * HD FAZ-2 — Merkezî İçerik Admin hattı · Tipler
 * ==============================================
 *
 * Tenant'sız, admin-only merkezî içerik/kaynak/çeviri/evidence + HD-özel audit
 * satır ve insert tipleri. Bu tipler yalnız server-only admin hattında kullanılır
 * (verifyAdminRequest → service_role). Tenant tipleri (lib/human-design/types.ts)
 * DEĞİŞTİRİLMEZ; bunlar AYRI merkezî sözleşmedir.
 */

// ── Dar enum'lar (migration CHECK'leriyle birebir) ──────────────────────────
export type HdEntityKind = "tip" | "otorite" | "kapi" | "kanal";
export type HdContentStatus = "draft" | "published";
export type HdTranslationStatus = "draft" | "verified" | "archived";
export type HdSourceStatus = "draft" | "verified" | "archived";
export type HdRelationType = "supports" | "contradicts" | "school_specific" | "background";

export type HdAuditAction = "created" | "updated" | "deleted" | "published";
export type HdAuditResourceKind =
  | "canonical_content"
  | "source"
  | "source_passage"
  | "original_text"
  | "faithful_translation"
  | "content_evidence";

// ── Canonical kimlik (salt-okuma; registry + tür) ───────────────────────────
export type HdCanonicalEntityRow = {
  id: string;
  entity_kind: HdEntityKind;
  canonical_key: string;
  name_tr: string;
  name_original: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
};

// ── Kaynaklandırılmış Ana Metin (hd_canonical_content) ──────────────────────
export type HdCanonicalContentRow = {
  id: string;
  entity_id: string;
  entity_kind: HdEntityKind;
  canonical_key: string;
  general_description: string;
  report_text: string;
  status: HdContentStatus;
  version: number;
  is_ai_generated: boolean;
  human_approved_at: string | null;
  // Tip
  strategy_text: string | null;
  signature_text: string | null;
  not_self_text: string | null;
  // Otorite
  decision_mechanism: string | null;
  application_text: string | null;
  caution_notes: string | null;
  // Kapı
  general_theme: string | null;
  // Kanal
  full_channel_text: string | null;
  hanging_gate_context: string | null;
  created_at: string;
  updated_at: string;
};

/** Client'tan kabul edilen içerik alanları (id/entity_kind/canonical_key/zaman/version server-only). */
export type HdCanonicalContentWritable = Partial<
  Omit<
    HdCanonicalContentRow,
    "id" | "entity_kind" | "canonical_key" | "version" | "created_at" | "updated_at"
  >
> & { entity_id: string };

// ── Sadık Türkçe Çeviri (hd_faithful_translations) ──────────────────────────
export type HdFaithfulTranslationRow = {
  id: string;
  original_text_id: string;
  source_content_hash: string;
  source_language_tag: string;
  source_script_code: string;
  target_language_tag: string;
  translation_text: string;
  translation_hash: string;
  status: HdTranslationStatus;
  revision: number;
  supersedes_translation_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── İçerik ↔ Kaynak pasajı evidence (hd_content_evidence) ────────────────────
export type HdContentEvidenceRow = {
  id: string;
  content_id: string;
  passage_id: string;
  relation_type: HdRelationType;
  is_primary: boolean;
  is_single_source: boolean;
  sort_order: number;
  editorial_note: string | null;
  created_at: string;
  updated_at: string;
};

// ── Merkezî kaynak katmanı (hd_sources / passages / original_texts) ─────────
export type HdSourceRow = {
  id: string;
  source_type: string;
  title: string;
  authors: string[];
  organization: string | null;
  rights_status: string;
  internal_use_allowed: boolean;
  expert_delivery_allowed: boolean;
  private_report_use_allowed: boolean;
  public_display_allowed: boolean;
  commercial_use_allowed: boolean;
  status: HdSourceStatus;
  created_at: string;
  updated_at: string;
};

export type HdSourcePassageRow = {
  id: string;
  source_id: string;
  locator_kind: string;
  locator_label: string;
  locator_value: string;
  passage_kind: string;
  /** Kaynağa Özgü Not (editöryal). rights_note ile karıştırılmaz. */
  source_specific_note: string | null;
  rights_note: string | null;
  status: HdSourceStatus;
  created_at: string;
  updated_at: string;
};

export type HdOriginalTextRow = {
  id: string;
  passage_id: string;
  language_tag: string;
  script_code: string;
  original_text: string;
  content_hash: string;
  capture_method: string;
  status: HdSourceStatus;
  revision: number;
  created_at: string;
  updated_at: string;
};

// ── HD-özel append-only audit (hd_content_audit_events) ─────────────────────
export type HdContentAuditContext = Record<string, unknown>;

export type HdContentAuditInsert = {
  actor_admin_id: string;
  action: HdAuditAction;
  resource_kind: HdAuditResourceKind;
  resource_id: string;
  canonical_entity_id?: string | null;
  canonical_key?: string | null;
  changed_fields?: string[];
  context?: HdContentAuditContext;
};

export type HdContentAuditRow = HdContentAuditInsert & {
  id: string;
  changed_fields: string[];
  context: HdContentAuditContext;
  created_at: string;
};

// ── Persistence sonuç tipleri ───────────────────────────────────────────────
export type HdPersistError = {
  code: "validation" | "not_found" | "dependency_conflict" | "db_error" | "audit_error";
  message: string;
};

export type HdPersistResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: HdPersistError };
