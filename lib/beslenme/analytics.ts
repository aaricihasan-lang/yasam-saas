import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan } from "./planEngine";
import {
  reducePlanAnalytics,
  type PlanAnalytics,
  type AnalyticsDayRow,
  type AnalyticsMealRow,
  type AnalyticsItemRow,
  type AnalyticsNutrientRow,
} from "./analyticsReduce";

/**
 * Beslenme FAZ 6 / Plan Analitiği — server-authoritative yükleyici (SNAPSHOT-only).
 *
 * KAYNAK KİLİDİ (§13): YALNIZ plan snapshot tabloları okunur
 *   (nutrition_plan_days / _meals / _items / _item_nutrients). Canlı nutrition_foods ASLA
 *   okunmaz — historical immutability. Tüm sorgular tenant-scoped (IDOR fail-closed).
 *
 * N+1 YOK: 4 batched indexed sorgu (days/meals/items/nutrients) → JS reduce (reducePlanAnalytics).
 * HAM değer taşınır; yuvarlama YALNIZ display'de (§15, §37).
 */

// Saf reduce'u yeniden dışa ver (analytics.ts kontratı — harness DB'siz doğrudan çağırabilsin).
export { reducePlanAnalytics };
export type { PlanAnalytics } from "./analyticsReduce";

export type PlanAnalyticsResult =
  | { ok: true; analytics: PlanAnalytics }
  | { ok: false; error: { code: string; status: number } };

export async function computePlanAnalytics(
  db: SupabaseClient,
  tenantId: string,
  planId: string,
): Promise<PlanAnalyticsResult> {
  // Plan (tenant-scoped) — yabancı/eksik → NOT_FOUND (IDOR fail-closed).
  const plan = await getPlan(db, tenantId, planId);
  if (!plan) return { ok: false, error: { code: "NOT_FOUND", status: 404 } };

  // 1) tüm günler (plan_date artan).
  const { data: dayData } = await db
    .from("nutrition_plan_days")
    .select("id, plan_date, energy_target_override")
    .eq("tenant_id", tenantId)
    .eq("plan_id", planId)
    .order("plan_date", { ascending: true });
  const days = (dayData as AnalyticsDayRow[] | null) ?? [];

  // 2) tüm öğünler (id, plan_day_id).
  const { data: mealData } = await db
    .from("nutrition_plan_meals")
    .select("id, plan_day_id")
    .eq("tenant_id", tenantId)
    .eq("plan_id", planId);
  const meals = (mealData as AnalyticsMealRow[] | null) ?? [];

  // 3) tüm item'lar (id, meal_id, grams).
  const { data: itemData } = await db
    .from("nutrition_plan_items")
    .select("id, meal_id, grams")
    .eq("tenant_id", tenantId)
    .eq("plan_id", planId);
  const items = (itemData as AnalyticsItemRow[] | null) ?? [];

  // 4) frozen nutrient snapshot'lar (yalnız item varsa).
  let nutrients: AnalyticsNutrientRow[] = [];
  if (items.length > 0) {
    const { data: nutrData } = await db
      .from("nutrition_plan_item_nutrients")
      .select("item_id, nutrient_code, amount, unit_code")
      .eq("tenant_id", tenantId)
      .in(
        "item_id",
        items.map((i) => i.id),
      );
    nutrients = (nutrData as AnalyticsNutrientRow[] | null) ?? [];
  }

  const analytics = reducePlanAnalytics({
    days,
    meals,
    items,
    nutrients,
    planDefaultTarget: plan.daily_energy_target ?? null,
    startDate: plan.start_date ?? null,
  });

  return { ok: true, analytics };
}
