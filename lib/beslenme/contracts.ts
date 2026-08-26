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
