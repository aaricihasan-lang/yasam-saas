/**
 * Aromaterapi yağ tablosu — sunucu tarafı alan whitelisti + liste projeksiyonu.
 *
 * `/api/aromaterapi/oils` ve `/api/aromaterapi/oils/[id]` route'ları paylaşır.
 * İstemci `tenant_id` / `id` / `is_active` gibi alanları ENJEKTE EDEMEZ;
 * yalnız aşağıdaki yazılabilir alanlar DB'ye geçer (tenant_id daima oturumdan).
 */

// Liste görünümünde çekilen hafif projeksiyon (OilListRow ile birebir).
export const OIL_LIST_SELECT =
  "id,tenant_id,name,latin_name,english_name,oil_type,category,origin,aroma_profile," +
  "plant_part,main_components,benefits,physical_benefits,emotional_benefits,skin_benefits," +
  "spiritual_benefits,diffuser_usage,massage_usage,usage_methods,safety_notes," +
  "chakra_connection,element_connection,therapeutic_properties,is_photosensitive,target_systems," +
  "created_at,updated_at";

const OIL_STRING_FIELDS = [
  "name", "latin_name", "english_name", "oil_type", "category",
  "extraction_method", "plant_part", "origin", "shelf_life",
  "aroma_profile", "aroma_note", "color", "consistency",
  "main_components",
  "emotional_benefits", "spiritual_benefits", "physical_benefits", "skin_benefits", "benefits",
  "diffuser_usage", "massage_usage", "usage_methods", "dilution_ratio",
  "chakra_connection", "element_connection",
  "safety_notes", "contraindications",
  "notes", "source",
] as const;

const OIL_ARRAY_FIELDS = [
  "therapeutic_properties", "blends_well_with", "target_systems", "images",
] as const;

/**
 * İstemciden gelen ham gövdeyi güvenli, yazılabilir alan kümesine indirger.
 * Bilinmeyen alanlar (tenant_id, id, is_active, created_at…) tamamen düşer.
 */
export function pickWritableOilFields(raw: unknown): Record<string, unknown> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const k of OIL_STRING_FIELDS) {
    const v = b[k];
    out[k] = typeof v === "string" ? v.trim() : "";
  }
  if (!out.oil_type) out.oil_type = "essential";

  for (const k of OIL_ARRAY_FIELDS) {
    const v = b[k];
    out[k] = Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean)
      : [];
  }

  out.is_photosensitive = b.is_photosensitive === true;
  return out;
}
