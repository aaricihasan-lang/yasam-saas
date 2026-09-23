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
  "id,tenant_id,name,latin_name,english_name,oil_type,category,is_photosensitive,photosensitivity_status,origin_type," +
  "aroma_profile,physical_benefits,emotional_benefits,benefits";

/**
 * ARO-004 — Fotosensitiflik/fototoksisite üç-durumlu sözleşme (PAYLAŞIMLI).
 * Diğer worker'lar (typeahead/blend/detail) bu tipi ve türeticiyi buradan import eder.
 * "unknown" = değerlendirilmemiş (VERİ EKSİK) — asla "güvenli" olarak gösterilmez.
 * Legacy boolean `is_photosensitive` ile SENKRON tutulur: status==="yes" ↔ boolean true.
 */
export type PhotosensitivityStatus = "yes" | "no" | "unknown";

export function derivePhotosensitivity(
  raw: { photosensitivity_status?: unknown; is_photosensitive?: unknown } | null | undefined,
): PhotosensitivityStatus {
  // Legacy boolean `is_photosensitive === true` DAİMA 'yes' kabul edilir (otoriter):
  // migration apply ile kod deploy arasındaki pencerede ESKİ kod yalnız is_photosensitive'e
  // yazıp photosensitivity_status'u güncellemezse kolon 'unknown' kalabilir; bu durumda bile
  // okuma 'yes' döner (fototoksik yağ sessizce "bilinmiyor" görünmez). is_photosensitive=false
  // iken üçlü-durum ('no'/'unknown'/legacy) status'tan okunur.
  if (raw?.is_photosensitive === true) return "yes";
  const s = String(raw?.photosensitivity_status ?? "").trim().toLowerCase();
  if (s === "yes" || s === "no" || s === "unknown") return s;
  return "unknown";
}

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
  "photosensitivity_status",
] as const;

/**
 * İstemciden gelen ham gövdeyi güvenli, yazılabilir alan kümesine indirger.
 * Bilinmeyen alanlar (tenant_id, id, is_active, created_at…) tamamen düşer.
 *
 * ARO-003 kısmi birleştirme: `opts.partial === true` (PATCH) iken YALNIZ gövdede
 * BULUNAN anahtarlar dahil edilir → gönderilmeyen `safety_notes`/`contraindications`/
 * `photosensitivity_status` DOKUNULMAZ (yanlışlıkla "" ile ezilmez). Açık temizleme
 * yine çalışır: `"safety_notes": ""` alanı temizler. Tam mod (CREATE, varsayılan)
 * eski davranışı korur: tüm alanlar üretilir + oil_type default'u uygulanır.
 */
export function pickWritableOilFields(
  raw: unknown,
  opts?: { partial?: boolean },
): Record<string, unknown> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const partial = opts?.partial === true;

  for (const k of OIL_STRING_FIELDS) {
    if (partial && !(k in b)) continue; // kısmi: yok olan alanı ELLEME
    const v = b[k];
    out[k] = typeof v === "string" ? v.trim() : "";
  }
  // oil_type default'u yalnız tam modda (create) — kısmi modda omit edilen oil_type'ı
  // "essential" ile ezmemek için.
  if (!partial && !out.oil_type) out.oil_type = "essential";

  for (const k of OIL_ARRAY_FIELDS) {
    if (partial && !(k in b)) continue; // kısmi: yok olan alanı ELLEME
    const v = b[k];
    out[k] = Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean)
      : [];
  }

  // Fotosensitiflik (ARO-004): enum + legacy boolean DAİMA senkron.
  // Kısmi modda yalnız iki anahtardan EN AZ BİRİ gövdede varsa dokunulur.
  const photoPresent = "photosensitivity_status" in b || "is_photosensitive" in b;
  if (!partial || photoPresent) {
    out.photosensitivity_status = derivePhotosensitivity(b);
    out.is_photosensitive = out.photosensitivity_status === "yes";
  }

  return out;
}
