import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Günü Temizle" kapsamı: günün öğün + kalem kimlikleri (challenge özeti bunlardan üretilir).
 * Onay anında AYNI fonksiyonla yeniden hesaplanır → araya eklenen/silinen tek kayıt bile
 * kapsam özetini bozar ve işlem reddedilir (kullanıcının görmediği kayıt silinmez).
 */
export async function loadDayClearScope(
  db: SupabaseClient,
  tenantId: string,
  planId: string,
  dayId: string,
): Promise<{ ok: true; mealIds: string[]; itemCount: number; keys: string[] } | { ok: false }> {
  const { data: meals, error } = await db
    .from("nutrition_plan_meals")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("plan_id", planId)
    .eq("plan_day_id", dayId);
  if (error) return { ok: false };
  const mealIds = ((meals as Array<{ id: string }> | null) ?? []).map((m) => m.id);
  if (mealIds.length === 0) return { ok: true, mealIds, itemCount: 0, keys: [] };
  const { data: items, error: itemErr } = await db
    .from("nutrition_plan_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("plan_id", planId)
    .in("meal_id", mealIds);
  if (itemErr) return { ok: false };
  const itemIds = ((items as Array<{ id: string }> | null) ?? []).map((i) => i.id);
  return {
    ok: true,
    mealIds,
    itemCount: itemIds.length,
    keys: [...mealIds.map((m) => `meal:${m}`), ...itemIds.map((i) => `item:${i}`)],
  };
}
