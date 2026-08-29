/**
 * Beslenme FAZ 6 / Template — paylaşılan (server+client) SAF sözleşmeler.
 * IO/DB YOK (pure). Mass-assignment allowlist'leri; snapshot ASLA client'tan gelmez (§39).
 */

export const TEMPLATE_TYPES = ["meal", "day"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  meal: "Öğün Şablonu",
  day: "Gün Şablonu",
};

// Explicit SELECT kolonları (select * YOK) — migration şemasıyla birebir.
export const TEMPLATE_COLUMNS =
  "id, tenant_id, template_type, title, note, is_active, created_at, updated_at";
export const TEMPLATE_MEAL_COLUMNS =
  "id, tenant_id, template_id, meal_type, label, sort_order, energy_target, note, created_at, updated_at";
export const TEMPLATE_ITEM_COLUMNS =
  "id, tenant_id, template_id, template_meal_id, food_id, grams, quantity, food_name_snapshot, food_ownership_snapshot, " +
  "portion_label_snapshot, portion_gram_snapshot, external_provider_snapshot, external_version_snapshot, sort_order, note, created_at, updated_at";
export const TEMPLATE_ITEM_NUTRIENT_COLUMNS =
  "id, tenant_id, item_id, nutrient_code, amount, unit_code, created_at";

// Mutation allowlist'leri (tenant/id ASLA body'den; snapshot server-authoritative).
/** Şablon oluşturma: kaynak plan öğünü/günü ID + başlık; snapshot server üretir. */
export const TEMPLATE_CREATE_KEYS = ["from", "source_id", "title", "note"] as const;
export const TEMPLATE_PATCH_KEYS = ["title", "note", "is_active"] as const;
export const TEMPLATE_DUPLICATE_KEYS = ["title"] as const;
export const TEMPLATE_APPLY_KEYS = ["mode", "target_plan_id", "target_day_id"] as const;

/** create body.from vocabulary. */
export const TEMPLATE_SOURCE_KINDS = ["meal", "day"] as const;
export type TemplateSourceKind = (typeof TEMPLATE_SOURCE_KINDS)[number];
/** apply body.mode vocabulary. */
export const TEMPLATE_APPLY_MODES = ["meal", "day"] as const;
export type TemplateApplyMode = (typeof TEMPLATE_APPLY_MODES)[number];

export type TemplateRow = {
  id: string;
  template_type: TemplateType;
  title: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
