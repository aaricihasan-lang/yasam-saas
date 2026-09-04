/**
 * Beslenme Class B — paylaşılan (server+client) SAF sözleşmeler: enum'lar, kolon
 * allowlist'leri, doğrulayıcılar. IO/DB YOK (pure). Mass-assignment koruması buradadır.
 */

export const TOPIC_TYPES = [
  "dietary_pattern",
  "goal",
  "condition",
  "sport",
  "life_stage",
  "traditional_profile",
] as const;
export type TopicType = (typeof TOPIC_TYPES)[number];

export const RELATION_TYPES = [
  "recommended",
  "suitable",
  "neutral",
  "limit",
  "avoid",
  "caution",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const PREP_STATES = ["raw", "cooked", "processed"] as const;

export const SECTION_KEYS = [
  "ozet",
  "prensipler",
  "uygun_besinler",
  "notr_besinler",
  "uzak_durulacak",
  "notlar",
  "diger",
] as const;

export const SOURCE_TYPES = [
  "book",
  "article",
  "clinical_guide",
  "official_institution",
  "web",
  "education",
  "traditional",
  "other",
] as const;

/** Class A canonical framework kodları (Class A prod'da CANLI). */
export const FRAMEWORK_CODES = ["mizac", "blood_type", "ayurveda", "tcm", "unani", "other"] as const;

/**
 * Canonical mizaç profilleri — mevcut Yaşam Sistemi data contract'ı (clients.mizac):
 * dem/safra/sovdavi/balgam. `sovdavi` yazımı stored data ile aynı. Nitelik açıklamasıyla gösterilir.
 */
export const MIZAC_PROFILES = [
  { code: "dem", title: "Dem", quality: "Sıcak-Yaş" },
  { code: "safra", title: "Safra", quality: "Sıcak-Kuru" },
  { code: "sovdavi", title: "Sovdavi", quality: "Soğuk-Kuru" },
  { code: "balgam", title: "Balgam", quality: "Soğuk-Yaş" },
] as const;

/** Kan grubu profilleri. "0" canonical (O değil), UI'da "0 (Sıfır)" gösterimi önerilir. */
export const BLOOD_TYPE_PROFILES = ["0", "A", "B", "AB"] as const;

// Explicit SELECT kolonları (select * YOK).
export const FOOD_COLUMNS =
  "id, tenant_id, name_tr, name_en, aliases, food_group_id, prep_state, description, notes, is_active, sort_order, created_at, updated_at";
export const TOPIC_COLUMNS =
  "id, tenant_id, topic_type, framework_id, title, summary, is_active, sort_order, created_at, updated_at";
export const SECTION_COLUMNS =
  "id, tenant_id, topic_id, section_key, heading, content, sort_order, created_at, updated_at";
export const TOPIC_FOOD_COLUMNS =
  "id, tenant_id, topic_id, food_id, relation_type, rationale, sort_order, created_at, updated_at";
export const SOURCE_COLUMNS =
  "id, tenant_id, title, authors, organization, source_type, publication_year, edition, page_range, chapter, url, reference_code, note, is_active, created_at, updated_at";
export const TOPIC_SOURCE_COLUMNS =
  "id, tenant_id, topic_id, source_id, locator, note, sort_order, created_at, updated_at";
export const FOOD_SOURCE_COLUMNS =
  "id, tenant_id, food_id, source_id, locator, note, sort_order, created_at, updated_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

export function cleanStr(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function cleanStringArray(v: unknown, maxItems = 50, maxLen = 200): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (t) out.push(t.slice(0, maxLen));
    if (out.length >= maxItems) break;
  }
  return out;
}

export function inEnum<T extends readonly string[]>(v: unknown, set: T): v is T[number] {
  return typeof v === "string" && (set as readonly string[]).includes(v);
}

/** URL sade doğrulama (http/https). Boş → null (opsiyonel). */
export function cleanUrl(v: unknown): string | null {
  const s = cleanStr(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return s;
  } catch {
    return null;
  }
}

/** Bilinmeyen key'leri reddet: gövde yalnız izinli alanları içermeli (mass-assignment koruması). */
export function hasOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(body).every((k) => allowed.includes(k));
}

// ============================================================
// FAZ 4 / Profesyonel Besin Motoru (Aşama 2) — food_nutrients / portions / external_refs
// ============================================================

// Explicit SELECT kolonları (select * YOK) — migration şemasıyla birebir.
export const FOOD_NUTRIENT_COLUMNS =
  "id, tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams, source_id, created_at, updated_at";
export const FOOD_PORTION_COLUMNS =
  "id, tenant_id, food_id, label_tr, label_en, quantity, measure_unit_id, gram_weight, is_default, sort_order, source_id, created_at, updated_at";
export const FOOD_EXTERNAL_REF_COLUMNS =
  "id, tenant_id, food_id, provider, external_id, external_dataset, external_version, source_url, retrieved_at, content_hash, created_at, updated_at";

/** Canonical besin değeri temeli: HER satır 100 g food içindir (basis_grams invariant). */
export const NUTRIENT_BASIS_GRAMS = 100;

/** Bulk nutrient upsert item allowlist. basis server-side sabit; tenant/food/id ASLA body'den. */
export const FOOD_NUTRIENT_ITEM_KEYS = ["nutrient_id", "amount", "unit_id", "source_id"] as const;

export const FOOD_PORTION_CREATE_KEYS = [
  "label_tr", "label_en", "quantity", "measure_unit_id", "gram_weight", "is_default", "sort_order", "source_id",
] as const;
export const FOOD_PORTION_PATCH_KEYS = FOOD_PORTION_CREATE_KEYS;

/** API import-capable provider allowlist. DB enum ayrıca 'turkomp'/'manual' tanır; ancak
 *  otomatik IMPORT yalnız usda_fdc (CC0). TürKomp lisanssız veri girişi API'de kapalı. */
export const IMPORT_PROVIDERS = ["usda_fdc"] as const;

// ── numeric doğrulayıcılar ──
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function isNonNegative(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0;
}
export function isPositive(v: unknown): v is number {
  return isFiniteNumber(v) && v > 0;
}

/** Porsiyon ölçü birimi count/household/volume olmalı (kütle gram_weight kolonundadır). */
export function isValidPortionMeasureUnitType(unitType: string): boolean {
  return unitType === "count" || unitType === "household" || unitType === "volume";
}

// ── FAZ 4 — Besin Motoru: traditional kolonları + kategori/uyum + sayı doğrulama ──
// (Kolon allowlist'leri FOOD_NUTRIENT_COLUMNS/FOOD_PORTION_COLUMNS/FOOD_EXTERNAL_REF_COLUMNS
//  yukarıda tanımlıdır; burada yalnız traditional + doğrulama yardımcıları eklenir.)

export const FOOD_TRADITIONAL_COLUMNS =
  "id, tenant_id, food_id, framework_id, thermal_quality, moisture_quality, notes, source_id, created_at, updated_at";

/** Class A nutrient kategorileri (nutrition_nutrients.category CHECK ile birebir). */
export const NUTRIENT_CATEGORIES = ["energy", "macronutrient", "vitamin", "mineral", "fatty_acid", "other"] as const;

/** Geleneksel nitelik vocabulary (food_traditional CHECK ile birebir). */
export const THERMAL_QUALITIES = ["hot", "cold", "neutral"] as const;
export const MOISTURE_QUALITIES = ["wet", "dry", "neutral"] as const;

/** Dış-kaynak provider'ları (external_refs CHECK ile birebir). turkomp = geleceğe hazır (import YOK). */
export const EXTERNAL_PROVIDERS = ["usda_fdc", "turkomp", "manual"] as const;

/**
 * nutrient kategorisi → izin verilen ölçü birimi kodları (fail-closed uyum kapısı).
 * Server, nutrient'in kategorisini + unit kodunu çözüp bu haritayla doğrular:
 * energy yalnız kcal/kj; makro g/mg; mineral mg/mcg/g; vitamin mg/mcg; fatty_acid mg/g.
 */
export const NUTRIENT_UNIT_ALLOW: Record<(typeof NUTRIENT_CATEGORIES)[number], readonly string[]> = {
  energy: ["kcal", "kj"],
  macronutrient: ["g", "mg"],
  mineral: ["mg", "mcg", "g"],
  vitamin: ["mg", "mcg"],
  fatty_acid: ["mg", "g"],
  other: ["g", "mg", "mcg", "kcal", "kj", "ml", "l"],
};

export function isUnitAllowedForCategory(category: string, unitCode: string): boolean {
  const set = NUTRIENT_UNIT_ALLOW[category as (typeof NUTRIENT_CATEGORIES)[number]];
  return Array.isArray(set) && set.includes(unitCode);
}

/**
 * Sayı doğrulayıcı: number ya da string ("12,5" TR virgül → 12.5). NaN/Infinity/negatif reddi.
 * min/max sınırları (aşırı-klinik-limit engine DEĞİL; makul üst sınır guard'ı).
 */
export function cleanNumber(
  v: unknown,
  opts: { min?: number; max?: number } = {},
): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    n = Number(t);
  } else return null;
  if (!Number.isFinite(n)) return null;
  if (opts.min != null && n < opts.min) return null;
  if (opts.max != null && n > opts.max) return null;
  return n;
}
