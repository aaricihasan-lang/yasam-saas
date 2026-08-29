import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_MEAL_COLUMNS,
  TEMPLATE_ITEM_COLUMNS,
  TEMPLATE_ITEM_NUTRIENT_COLUMNS,
  type TemplateRow,
} from "./templateContracts";

/**
 * Beslenme FAZ 6 / Template — server-only okuma yardımcıları. Mutation'lar atomik RPC ile
 * (nutrition_template_*). Snapshot server-authoritative; hesap plan motoruyla ORTAK.
 */

export async function getTemplate(
  db: SupabaseClient,
  tenantId: string,
  templateId: string,
): Promise<TemplateRow | null> {
  const { data, error } = await db
    .from("nutrition_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as TemplateRow;
}

export type TemplateItemDetail = {
  id: string;
  food_id: string | null;
  grams: number;
  quantity: number | null;
  food_name_snapshot: string;
  food_ownership_snapshot: string;
  portion_label_snapshot: string | null;
  portion_gram_snapshot: number | null;
  external_provider_snapshot: string | null;
  external_version_snapshot: string | null;
  sort_order: number;
  note: string | null;
  nutrients: Array<{ nutrient_code: string; amount: number; unit_code: string }>;
};
export type TemplateMealDetail = {
  id: string;
  meal_type: string | null;
  label: string;
  sort_order: number;
  energy_target: number | null;
  note: string | null;
  items: TemplateItemDetail[];
};
export type TemplateDetail = {
  template: TemplateRow;
  meals: TemplateMealDetail[];
};

/** Tek şablonun tam ağacı (meal→item→nutrient). Batched (N+1 YOK). */
export async function loadTemplateDetail(
  db: SupabaseClient,
  tenantId: string,
  templateId: string,
): Promise<TemplateDetail | null> {
  const template = await getTemplate(db, tenantId, templateId);
  if (!template) return null;

  const { data: meals } = await db
    .from("nutrition_template_meals")
    .select(TEMPLATE_MEAL_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  const { data: items } = await db
    .from("nutrition_template_items")
    .select(TEMPLATE_ITEM_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  const itemIds = (items ?? []).map((i) => (i as unknown as { id: string }).id);
  let nutrients: Array<{ item_id: string; nutrient_code: string; amount: number; unit_code: string }> = [];
  if (itemIds.length > 0) {
    const { data: nut } = await db
      .from("nutrition_template_item_nutrients")
      .select(TEMPLATE_ITEM_NUTRIENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("item_id", itemIds);
    nutrients = (nut ?? []) as unknown as typeof nutrients;
  }

  const nutByItem = new Map<string, TemplateItemDetail["nutrients"]>();
  for (const n of nutrients) {
    const arr = nutByItem.get(n.item_id) ?? [];
    arr.push({ nutrient_code: n.nutrient_code, amount: Number(n.amount), unit_code: n.unit_code });
    nutByItem.set(n.item_id, arr);
  }

  const itemsByMeal = new Map<string, TemplateItemDetail[]>();
  for (const raw of items ?? []) {
    const it = raw as unknown as TemplateItemDetail & { template_meal_id: string };
    const detail: TemplateItemDetail = {
      id: it.id,
      food_id: it.food_id,
      grams: Number(it.grams),
      quantity: it.quantity == null ? null : Number(it.quantity),
      food_name_snapshot: it.food_name_snapshot,
      food_ownership_snapshot: it.food_ownership_snapshot,
      portion_label_snapshot: it.portion_label_snapshot,
      portion_gram_snapshot: it.portion_gram_snapshot == null ? null : Number(it.portion_gram_snapshot),
      external_provider_snapshot: it.external_provider_snapshot,
      external_version_snapshot: it.external_version_snapshot,
      sort_order: it.sort_order,
      note: it.note,
      nutrients: nutByItem.get(it.id) ?? [],
    };
    const arr = itemsByMeal.get(it.template_meal_id) ?? [];
    arr.push(detail);
    itemsByMeal.set(it.template_meal_id, arr);
  }

  const mealDetails: TemplateMealDetail[] = (meals ?? []).map((raw) => {
    const m = raw as unknown as TemplateMealDetail & { id: string };
    return {
      id: m.id,
      meal_type: m.meal_type,
      label: m.label,
      sort_order: m.sort_order,
      energy_target: m.energy_target == null ? null : Number(m.energy_target),
      note: m.note,
      items: itemsByMeal.get(m.id) ?? [],
    };
  });

  return { template, meals: mealDetails };
}
