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
  // ── FAZ 1.5 — tipli citation junction tabloları ──
  pointSources: "cupping_point_sources",
  topicSources: "cupping_topic_sources",
  pointTopicSources: "cupping_point_topic_sources",
  techniqueSources: "cupping_technique_sources",
  knowledgeSources: "cupping_knowledge_sources",
  safetySources: "cupping_safety_sources",
} as const;

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
