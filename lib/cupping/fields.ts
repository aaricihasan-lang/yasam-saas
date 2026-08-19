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
  "sort_order",
] as const;

export const SAFETY_WRITABLE = [
  "title",
  "content",
  "severity",
  "scope_tags",
  "source_note",
  "sort_order",
  "is_active",
] as const;
