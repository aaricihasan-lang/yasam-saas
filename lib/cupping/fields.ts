/**
 * KUPA & HACAMAT — yazılabilir kolon allowlist'leri (server-side).
 *
 * INSERT/UPDATE payload'u YALNIZ bu alanlardan kurulur; client'ın gönderdiği
 * tenant_id / id / created_at / provenance / başka kolonlar ASLA kabul edilmez
 * (server tenant_id'yi kendisi yazar). Doğaltaş/refleksoloji desenleriyle aynı.
 */

export const CUPPING_TABLES = {
  points: "cupping_points",
  placements: "cupping_point_placements",
  topics: "cupping_topics",
  pointTopics: "cupping_point_topics",
  techniques: "cupping_techniques",
  knowledge: "cupping_knowledge_records",
  sources: "cupping_sources",
  safety: "cupping_safety_notes",
  // ── FAZ 4 — technique ↔ master safety note (protocol_safety'den AYRI) ──
  techniqueSafety: "cupping_technique_safety",
  // ── FAZ 1.5 — tipli citation junction tabloları ──
  pointSources: "cupping_point_sources",
  topicSources: "cupping_topic_sources",
  pointTopicSources: "cupping_point_topic_sources",
  techniqueSources: "cupping_technique_sources",
  knowledgeSources: "cupping_knowledge_sources",
  safetySources: "cupping_safety_sources",
  // ── Kullanıcı/uzman notları (formal citation'dan AYRI, tenant-local) ──
  topicNotes: "cupping_topic_notes",
  topicNotePoints: "cupping_topic_note_points",
  // ── V2 CLEAN CORE — Hacamat Protokolleri (legacy topics ağacından TAMAMEN AYRI) ──
  protocols: "cupping_protocols",
  protocolPoints: "cupping_protocol_points",
  protocolTechniques: "cupping_protocol_techniques",
  protocolSafety: "cupping_protocol_safety",
  protocolSteps: "cupping_protocol_steps",
  protocolEntries: "cupping_protocol_entries",
  protocolEntryPoints: "cupping_protocol_entry_points",
  protocolSources: "cupping_protocol_sources",
} as const;

/**
 * cupping_topic_notes yazılabilir alanları (server-side). tenant_id/id/topic_id/created_at
 * ASLA client'tan alınmaz (topic_id path/param'dan gelir, server assertOwnedRef eder).
 * point_id listesi ayrı body alanı olarak (point_ids) ele alınır — junction'a server yazar.
 */
export const TOPIC_NOTE_WRITABLE = ["note", "source_label", "sort_order", "is_active"] as const;

export const POINT_WRITABLE = [
  "name",
  "alt_name",
  "code",
  "anatomical_region",
  "description",
  "traditional_use",
  "application_info",
  "related_points",
  "safety_note",
  "source_note",
  "professional_note",
  "synonyms",
  "laterality",
  "sort_order",
  "is_active",
] as const;

export const PLACEMENT_WRITABLE = [
  "point_id",
  "map_key",
  "shape",
  "cx",
  "cy",
  "rx",
  "ry",
  "angle",
  "color",
  "placement_no",
] as const;

export const TOPIC_WRITABLE = [
  "title",
  "description",
  "category",
  "notes",
  "source_note",
  "sort_order",
  "is_active",
] as const;

export const POINT_TOPIC_WRITABLE = [
  "point_id",
  "topic_id",
  "note",
  "source_note",
  "relation_strength",
] as const;

export const TECHNIQUE_WRITABLE = [
  "name",
  "kind",
  "technique_type",
  "movement_style",
  "description",
  "application_info",
  "safety_note",
  "source_note",
  // ── FAZ 4 — "Uzman Notum" (kişisel not; source_note/safety_note'tan AYRI) ──
  "practitioner_note",
  "sort_order",
  "is_active",
] as const;

export const KNOWLEDGE_WRITABLE = [
  "title",
  "content",
  "category",
  "tags",
  "source",
  "source_section",
  "keyword",
  "notes",
  "sort_order",
  "is_active",
] as const;

export const SOURCE_WRITABLE = [
  "source_name",
  "source_type",
  "author_or_organization",
  "title",
  "page_or_section",
  "source_url",
  "accessed_on",
  "note",
  "year",
  "identifier",
  "publication",
  "language",
  "sort_order",
] as const;

export const SAFETY_WRITABLE = [
  "title",
  "content",
  "severity",
  "contraindication_class",
  "scope_tags",
  "source_note",
  "sort_order",
  "is_active",
] as const;

// ─── FAZ 1.5 — citation junction yazılabilir alanları ────────────────────────
/** Citation POST allowlist: source_id + entity FK + meta. Entity FK per-tablo değişir. */
export const CITATION_META_WRITABLE = ["locator", "evidence_class", "note", "sort_order"] as const;

/**
 * 6 citation junction'ın entity FK kolonu + parent tablosu (route factory + transfer +
 * harness tek kaynağı). source_id her zaman cupping_sources'a bakar.
 */
export const CITATION_SPECS = {
  point: { table: CUPPING_TABLES.pointSources, entityFk: "point_id", entityTable: CUPPING_TABLES.points },
  topic: { table: CUPPING_TABLES.topicSources, entityFk: "topic_id", entityTable: CUPPING_TABLES.topics },
  "point-topic": { table: CUPPING_TABLES.pointTopicSources, entityFk: "point_topic_id", entityTable: CUPPING_TABLES.pointTopics },
  technique: { table: CUPPING_TABLES.techniqueSources, entityFk: "technique_id", entityTable: CUPPING_TABLES.techniques },
  knowledge: { table: CUPPING_TABLES.knowledgeSources, entityFk: "knowledge_id", entityTable: CUPPING_TABLES.knowledge },
  safety: { table: CUPPING_TABLES.safetySources, entityFk: "safety_id", entityTable: CUPPING_TABLES.safety },
} as const;

export type CitationEntity = keyof typeof CITATION_SPECS;

export function isCitationEntity(v: unknown): v is CitationEntity {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CITATION_SPECS, v);
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 CLEAN CORE — Hacamat Protokolleri yazılabilir alanları (server-side)
//
// LEGACY (cupping_topics / cupping_point_topics / cupping_topic_notes) ağacından
// TAMAMEN AYRI. tenant_id / id / created_at / provenance ASLA client'tan alınmaz.
// Junction PATCH'lerinde FK kolonları (protocol_id/point_id/technique_id/...) META
// allowlist'ten HARİÇ (immutable) — yalnız protocol_note/sort_order düzenlenir.
// ═══════════════════════════════════════════════════════════════════════════

/** cupping_protocols — protokol dosyası temel bilgisi. */
export const PROTOCOL_WRITABLE = [
  "title",
  "category",
  "summary",
  "tags",
  "preparation_note",
  "aftercare_note",
  "follow_up_note",
  "sort_order",
  "is_active",
] as const;

/** cupping_protocol_points — POST (FK dahil) / PATCH (yalnız META). */
export const PROTOCOL_POINT_WRITABLE = ["protocol_id", "point_id", "protocol_note", "sort_order"] as const;
export const PROTOCOL_POINT_META_WRITABLE = ["protocol_note", "sort_order"] as const;

/** cupping_protocol_techniques — POST (FK dahil) / PATCH (yalnız META). */
export const PROTOCOL_TECHNIQUE_WRITABLE = ["protocol_id", "technique_id", "protocol_note", "sort_order"] as const;
export const PROTOCOL_TECHNIQUE_META_WRITABLE = ["protocol_note", "sort_order"] as const;

/** cupping_protocol_safety — POST (FK dahil) / PATCH (yalnız META). */
export const PROTOCOL_SAFETY_WRITABLE = ["protocol_id", "safety_id", "protocol_note", "sort_order"] as const;
export const PROTOCOL_SAFETY_META_WRITABLE = ["protocol_note", "sort_order"] as const;

/**
 * FAZ 4 — cupping_technique_safety (technique ↔ master safety note).
 * POST FK'leri (technique_id, safety_id) içerir; PATCH yalnız META (note/sort_order) —
 * technique_id/safety_id/tenant_id PATCH ile DEĞİŞTİRİLEMEZ (immutable ilişki kimliği).
 */
export const TECHNIQUE_SAFETY_WRITABLE = ["technique_id", "safety_id", "note", "sort_order"] as const;
export const TECHNIQUE_SAFETY_META_WRITABLE = ["note", "sort_order"] as const;

/**
 * cupping_protocol_steps — POST (protocol_id dahil) / PATCH (protocol_id HARİÇ; ref'ler
 * düzenlenebilir ama step route'u protokol-üyeliğini doğrular + DB composite FK backstop).
 */
export const PROTOCOL_STEP_WRITABLE = [
  "protocol_id",
  "title",
  "body",
  "stage_label",
  "ref_point_id",
  "ref_technique_id",
  "sort_order",
] as const;
export const PROTOCOL_STEP_META_WRITABLE = [
  "title",
  "body",
  "stage_label",
  "ref_point_id",
  "ref_technique_id",
  "sort_order",
] as const;

/**
 * cupping_protocol_entries — UNIFIED "Bilgiler". source_id opsiyonel (nullable);
 * protocol_id body'den (POST) alınır, PATCH'te immutable. point_ids ayrı body alanı
 * (junction'a yalnız server yazar; atomik REPLACE).
 */
export const PROTOCOL_ENTRY_WRITABLE = [
  "title",
  "content",
  "source_id",
  "source_label",
  "locator",
  "sort_order",
  "is_active",
] as const;

/** cupping_protocol_sources — protokol-seviye künye. POST (FK dahil) / PATCH (META). */
export const PROTOCOL_SOURCE_WRITABLE = ["protocol_id", "source_id", "locator", "note", "sort_order"] as const;
export const PROTOCOL_SOURCE_META_WRITABLE = ["locator", "note", "sort_order"] as const;
