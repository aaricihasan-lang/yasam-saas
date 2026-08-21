/**
 * KUPA & HACAMAT — kontrollü sözlükler (tek kaynak: UI select + server doğrulama +
 * DB CHECK ile hizalı). Değerler İngilizce anahtar; TR etiket UI'da.
 *
 * ÖNEMLİ AYRIM:
 *   - `source_type`  = kaynağın BİBLİYOGRAFİK türü (kitap/makale/derleme…).
 *   - `evidence_class` = citation'ın (kaynak↔içerik ilişkisi) KANIT/BAĞLAM katmanı.
 *   Geleneksel ile modern klinik ASLA aynı değerde birleşmez.
 */

/** citation.evidence_class — kaynağın içeriğe ne tür destek verdiği. */
export const CUPPING_EVIDENCE_CLASSES = [
  "traditional",
  "historical",
  "modern_clinical",
  "systematic_review",
  "safety_guidance",
  "expert_educational",
] as const;
export type CuppingEvidenceClass = (typeof CUPPING_EVIDENCE_CLASSES)[number];

/** source.source_type — bibliyografik tür (mevcut kolon; DB CHECK NOT VALID). */
export const CUPPING_SOURCE_TYPES = [
  "historical_primary",
  "historical_secondary",
  "book_monograph",
  "academic_article",
  "systematic_review",
  "clinical_study",
  "official_guidance",
  "expert_educational",
] as const;
export type CuppingSourceType = (typeof CUPPING_SOURCE_TYPES)[number];

/** point.laterality (DB CHECK). */
export const CUPPING_LATERALITIES = ["midline", "bilateral", "left", "right", "unspecified"] as const;
export type CuppingLaterality = (typeof CUPPING_LATERALITIES)[number];

/** technique.technique_type — ana müdahale ekseni (DB CHECK). */
export const CUPPING_TECHNIQUE_TYPES = ["dry", "wet", "unspecified"] as const;
export type CuppingTechniqueType = (typeof CUPPING_TECHNIQUE_TYPES)[number];

/** technique.movement_style — hareket/uygulama ekseni (DB CHECK). massage ≈ dry+gliding. */
export const CUPPING_MOVEMENT_STYLES = ["stationary", "gliding", "flash", "unspecified"] as const;
export type CuppingMovementStyle = (typeof CUPPING_MOVEMENT_STYLES)[number];

/** safety.contraindication_class (severity'den AYRI; DB CHECK). */
export const CUPPING_CONTRAINDICATION_CLASSES = ["absolute", "relative", "none"] as const;
export type CuppingContraindicationClass = (typeof CUPPING_CONTRAINDICATION_CLASSES)[number];

/** point_topic.relation_strength (mevcut kolon; DB CHECK NOT VALID). */
export const CUPPING_RELATION_STRENGTHS = [
  "traditional_primary",
  "traditional_secondary",
  "historically_associated",
  "modern_supported",
] as const;
export type CuppingRelationStrength = (typeof CUPPING_RELATION_STRENGTHS)[number];

/** Değer kontrollü sözlükte mi (server-side citation doğrulaması için). */
export function isEvidenceClass(v: unknown): v is CuppingEvidenceClass {
  return typeof v === "string" && (CUPPING_EVIDENCE_CLASSES as readonly string[]).includes(v);
}
