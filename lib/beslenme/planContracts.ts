/**
 * Beslenme FAZ 5 / Plan Motoru — paylaşılan (server+client) SAF sözleşmeler + hesap.
 * IO/DB YOK (pure). Mass-assignment allowlist'leri + plan totals hesabı buradadır.
 *
 * Hesap kaynağı: item nutrient SNAPSHOT (frozen /100 g). item katkısı = grams/100 × amount.
 *   meal = Σ item, day = Σ meal. HAM değer toplanır; yuvarlama YALNIZ display'de (§15, §37).
 */

export const PLAN_STATUSES = ["draft", "active", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Opsiyonel canonical öğün tipleri (NULL + label = özel öğün). §8 */
export const MEAL_TYPES = ["breakfast", "snack", "lunch", "dinner", "late_snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Quick-create öğün önerileri (UI). */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Kahvaltı",
  snack: "Ara Öğün",
  lunch: "Öğle",
  dinner: "Akşam",
  late_snack: "Gece Öğünü",
};

/** Food ownership snapshot vocabulary (item.food_ownership_snapshot CHECK ile birebir). */
export const FOOD_OWNERSHIPS = ["system", "custom"] as const;
export type FoodOwnership = (typeof FOOD_OWNERSHIPS)[number];

/** Ana UI metrikleri (kart/özet). enerji + 4 makro. §15 */
export const PRIMARY_NUTRIENT_CODES = ["energy", "protein", "carbohydrate", "total_fat", "fiber"] as const;
/** İkincil metrikler (detay). §15 */
export const SECONDARY_NUTRIENT_CODES = ["sugar", "sodium", "potassium"] as const;

export const NUTRIENT_LABELS: Record<string, string> = {
  energy: "Enerji",
  protein: "Protein",
  carbohydrate: "Karbonhidrat",
  total_fat: "Yağ",
  saturated_fat: "Doymuş Yağ",
  fiber: "Lif",
  sugar: "Şeker",
  sodium: "Sodyum",
  potassium: "Potasyum",
};

// ── Explicit SELECT kolonları (select * YOK) — migration şemasıyla birebir ──
export const PLAN_COLUMNS =
  "id, tenant_id, title, note, start_date, end_date, daily_energy_target, status, plan_family_id, revision_number, created_at, updated_at";
export const PLAN_DAY_COLUMNS =
  "id, tenant_id, plan_id, plan_date, energy_target_override, note, created_at, updated_at";
export const PLAN_MEAL_COLUMNS =
  "id, tenant_id, plan_id, plan_day_id, meal_type, label, sort_order, energy_target, note, created_at, updated_at";
export const PLAN_ITEM_COLUMNS =
  "id, tenant_id, plan_id, meal_id, food_id, grams, quantity, food_name_snapshot, food_ownership_snapshot, " +
  "portion_label_snapshot, portion_gram_snapshot, external_provider_snapshot, external_version_snapshot, sort_order, note, created_at, updated_at";
export const PLAN_ITEM_NUTRIENT_COLUMNS =
  "id, tenant_id, item_id, nutrient_code, amount, unit_code, created_at";

// ── Mutation allowlist'leri (mass-assignment koruması; tenant/id/plan_id ASLA body'den) ──
export const PLAN_CREATE_KEYS = ["title", "note", "start_date", "end_date", "daily_energy_target"] as const;
export const PLAN_PATCH_KEYS = ["title", "note", "daily_energy_target", "status", "expectedUpdatedAt"] as const;
export const PLAN_RANGE_KEYS = ["start_date", "end_date"] as const;
export const PLAN_COPY_KEYS = ["title", "start_date"] as const;
export const DAY_PATCH_KEYS = ["energy_target_override", "note"] as const;
export const MEAL_CREATE_KEYS = ["plan_day_id", "meal_type", "label", "energy_target", "note", "sort_order"] as const;
export const MEAL_PATCH_KEYS = ["meal_type", "label", "energy_target", "note", "sort_order"] as const;
export const MEAL_REORDER_KEYS = ["order"] as const;
/** Item create/replace client girdisi — SNAPSHOT client'tan GELMEZ (server üretir; §12). */
export const ITEM_INPUT_KEYS = ["food_id", "grams", "portion_id", "quantity", "note"] as const;
export const ITEM_PATCH_KEYS = ["grams", "portion_id", "quantity", "note", "target_meal_id"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** ISO tarih (YYYY-MM-DD) doğrulama + normalize. Geçersiz → null. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function cleanDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!DATE_RE.test(t)) return null;
  const d = new Date(t + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  // round-trip kontrolü (2026-02-31 gibi geçersiz günler reddedilsin).
  if (d.toISOString().slice(0, 10) !== t) return null;
  return t;
}

/** İki ISO tarih arası tam gün sayısı (inclusive değil; end - start). */
export function daysBetween(start: string, end: string): number {
  const a = Date.parse(start + "T00:00:00Z");
  const b = Date.parse(end + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

// ── Plan totals hesabı (HAM; yuvarlama display'de) ──
export type ItemNutrientSnapshot = { nutrient_code: string; amount: number; unit_code: string };
export type NutrientTotal = { nutrient_code: string; unit_code: string; amount: number };

/** Tek item katkısı: grams/100 × frozen amount (HAM). */
export function itemNutrientContribution(grams: number, snapshotAmount: number): number {
  if (!Number.isFinite(grams) || !Number.isFinite(snapshotAmount) || grams < 0) return 0;
  return (snapshotAmount * grams) / 100;
}

/**
 * Item listesini (grams + nutrient snapshot) nutrient_code bazında toplar (HAM accumulator).
 * Sıralama: PRIMARY sonra SECONDARY sonra diğerleri (stable). unit_code ilk görülen korunur.
 */
export function sumNutrients(
  items: Array<{ grams: number; nutrients: ItemNutrientSnapshot[] }>,
): NutrientTotal[] {
  const acc = new Map<string, NutrientTotal>();
  for (const it of items) {
    for (const n of it.nutrients) {
      const code = n.nutrient_code;
      const cur = acc.get(code);
      const add = itemNutrientContribution(it.grams, n.amount);
      if (cur) cur.amount += add;
      else acc.set(code, { nutrient_code: code, unit_code: n.unit_code, amount: add });
    }
  }
  return orderNutrients([...acc.values()]);
}

const ORDER: string[] = [...PRIMARY_NUTRIENT_CODES, ...SECONDARY_NUTRIENT_CODES];
function orderNutrients(list: NutrientTotal[]): NutrientTotal[] {
  return list.sort((a, b) => {
    const ia = ORDER.indexOf(a.nutrient_code);
    const ib = ORDER.indexOf(b.nutrient_code);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.nutrient_code.localeCompare(b.nutrient_code);
  });
}

/** Toplamlar içinden enerji (kcal) ham değerini çeker (yoksa 0). */
export function energyOf(totals: NutrientTotal[]): number {
  return totals.find((t) => t.nutrient_code === "energy")?.amount ?? 0;
}

/** Günün geçerli enerji hedefi: gün override ?? plan default (§16). */
export function effectiveDailyTarget(
  dayOverride: number | null | undefined,
  planDefault: number | null | undefined,
): number | null {
  if (dayOverride != null && dayOverride > 0) return dayOverride;
  if (planDefault != null && planDefault > 0) return planDefault;
  return null;
}
