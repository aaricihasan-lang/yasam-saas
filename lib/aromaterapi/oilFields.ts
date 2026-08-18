/**
 * Aromaterapi yağ tablosu — sunucu tarafı alan whitelisti + liste projeksiyonu.
 *
 * `/api/aromaterapi/oils` ve `/api/aromaterapi/oils/[id]` route'ları paylaşır.
 * İstemci `tenant_id` / `id` / `is_active` gibi alanları ENJEKTE EDEMEZ;
 * yalnız aşağıdaki yazılabilir alanlar DB'ye geçer (tenant_id daima oturumdan).
 */

// FAZ 2 — SLIM liste projeksiyonu. Arama server-side `search_norm`'a taşındığı için
// listeye artık 21 aranabilir alanın tamamını göndermeye gerek YOK; yalnız kartın +
// önizlemenin (oilListRowPreview: physical/emotional_benefits/benefits/aroma_profile) +
// blend typeahead'in (name/latin_name/is_photosensitive) gerçekten kullandığı alanlar
// çekilir → satır payload'u ~yarıya iner. Ağır detay/arama-only metin alanları
// (main_components, skin/spiritual_benefits, diffuser/massage/usage_methods, safety_notes,
// origin, plant_part, chakra/element_connection, therapeutic_properties[], target_systems[])
// yalnız DETAY'da (fetchOilDetail full-row) gelir. origin_type teknik provenance için küçük tutulur.
export const OIL_LIST_SELECT =
  "id,tenant_id,name,latin_name,english_name,oil_type,category,is_photosensitive,origin_type," +
  "aroma_profile,physical_benefits,emotional_benefits,benefits";

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
 * Admin→uzman bağımsız snapshot (P4 transfer) için kopyalanacak iş alanları.
 * Yalnız iş verisi; id/tenant_id/timestamps/provenance ASLA buraya dahil değildir
 * (bunlar hedef kayıtta yeniden üretilir). pickWritableOilFields ile aynı alan
 * kümesini paylaşır → drift olmaz. Sunucu transfer route'u bunu import eder.
 */
export const OIL_COPY_FIELDS = [
  ...OIL_STRING_FIELDS,
  ...OIL_ARRAY_FIELDS,
  "is_photosensitive",
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
