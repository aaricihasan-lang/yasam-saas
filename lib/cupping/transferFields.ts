/**
 * KUPA & HACAMAT — admin→uzman aktarım kopya-alan allowlist'leri.
 *
 * Aktarım motoru (app/api/admin/veri-paylasimi/transfer/route.ts) YALNIZ bu iş alanlarını
 * kopyalar; id/tenant/created/provenance ASLA taşınmaz. Ayrı modül: `lib/aromaterapi/
 * oilFields` (OIL_COPY_FIELDS) ile aynı desen — route dosyasını şişirmez ve merge
 * çakışma yüzeyini daraltır.
 */

/** Hacamat noktası (parent) — iş alanları. */
export const CUPPING_POINT_COPY_FIELDS = [
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

/** Nokta yerleşimi (relational child) — point_id motor tarafından REMAP edilir. */
export const CUPPING_PLACEMENT_COPY_FIELDS = [
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

/** Konu (amaç/rahatsızlık). */
export const CUPPING_TOPIC_COPY_FIELDS = [
  "title",
  "description",
  "category",
  "notes",
  "source_note",
  "sort_order",
  "is_active",
] as const;

/** Kupa tekniği. */
export const CUPPING_TECHNIQUE_COPY_FIELDS = [
  "name",
  "kind",
  "description",
  "application_info",
  "safety_note",
  "source_note",
  "sort_order",
  "is_active",
] as const;

/** Bilgi kaydı. */
export const CUPPING_KNOWLEDGE_COPY_FIELDS = [
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

/** Kaynak künyesi. */
export const CUPPING_SOURCE_COPY_FIELDS = [
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

/** Güvenlik/kontrendikasyon. */
export const CUPPING_SAFETY_COPY_FIELDS = [
  "title",
  "content",
  "severity",
  "scope_tags",
  "source_note",
  "sort_order",
  "is_active",
] as const;

/** Konu↔nokta ilişki (junction) META alanları (FK'ler ayrıca remap edilir). */
export const CUPPING_POINT_TOPIC_COPY_FIELDS = [
  "note",
  "source_note",
  "relation_strength",
] as const;

/**
 * FAZ 1.5 — citation junction META alanları. Her citation tablosu için ORTAK
 * (source_id + entity FK motor tarafından junctionFkA/junctionFkB ile ayrıca remap
 * edilir; bunlar yalnız iş alanları). Tek allowlist 6 tabloda paylaşılır.
 */
export const CUPPING_CITATION_COPY_FIELDS = [
  "locator",
  "evidence_class",
  "note",
  "sort_order",
] as const;
