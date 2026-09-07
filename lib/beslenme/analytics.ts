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
import { fetchAllPaged, chunkIds } from "./pagedFetch";

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

  // 2) tüm öğünler (SAYFALI: büyük planlarda öğün sayısı 1000-satır yanıt sınırını aşabilir).
  const meals = await fetchAllPaged<AnalyticsMealRow>(
    (from, to) =>
      db
        .from("nutrition_plan_meals")
        .select("id, plan_day_id")
        .eq("tenant_id", tenantId)
        .eq("plan_id", planId)
        .order("id", { ascending: true })
        .range(from, to),
  );

  // 3) tüm item'lar (SAYFALI: item sayısı MAX_PLAN_ITEMS'e kadar → 1000 sınırını aşabilir).
  const items = await fetchAllPaged<AnalyticsItemRow>(
    (from, to) =>
      db
        .from("nutrition_plan_items")
        .select("id, meal_id, grams")
        .eq("tenant_id", tenantId)
        .eq("plan_id", planId)
        .order("id", { ascending: true })
        .range(from, to),
  );

  // 4) frozen nutrient snapshot'lar (SAYFALI + item_id chunk'lı; yalnız item varsa).
  // KRİTİK: item başına birden çok nutrient kodu → toplam satır 1000'i kolayca aşar
  // (84 item ≈ 1430 satır). Sayfalamadan çekilirse son item'ların nutrient'ları düşer
  // → analytics gün toplamı/ortalaması YANLIŞ. Snapshot-only; canlı food okuma YOK.
  let nutrients: AnalyticsNutrientRow[] = [];
  if (items.length > 0) {
    for (const ids of chunkIds(items.map((i) => i.id))) {
      const page = await fetchAllPaged<AnalyticsNutrientRow>(
        (from, to) =>
          db
            .from("nutrition_plan_item_nutrients")
            .select("item_id, nutrient_code, amount, unit_code")
            .eq("tenant_id", tenantId)
            .in("item_id", ids)
            .order("id", { ascending: true })
            .range(from, to),
      );
      nutrients = nutrients.length === 0 ? page : nutrients.concat(page);
    }
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
