import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFoodForRead } from "./foodEngine";
import { foodOwnershipClass } from "./systemTenant";
import {
  type ItemNutrientSnapshot,
  PLAN_DAY_COLUMNS,
  itemNutrientContribution,
} from "./planContracts";

/**
 * Beslenme FAZ 5 / Plan Motoru — server-authoritative snapshot + scoped resolver kapısı.
 *
 * SNAPSHOT MUTLAK KONTRATI (§12): client YALNIZ { foodId, grams } veya
 *   { foodId, portionId, quantity } gönderir. Server food'u DB'den okuyup ismi/ownership'i/
 *   nutrient değerlerini/porsiyon metadata'sını/provider bilgisini KENDİ üretir. Client
 *   kcal/protein/isim/ownership BELİRLEYEMEZ.
 *
 * HISTORICAL IMMUTABILITY (§13): snapshot yazıldıktan sonra canlı food update ya da custom
 *   food silinmesi historical planı değiştirmez (item + item_nutrients donmuş kopyadır).
 */

// ── Plan/gün/öğün/item scoped resolver'ları (hepsi tenant-scoped; foreign ID fail-closed) ──

export type PlanRow = {
  id: string; tenant_id: string; status: string; start_date: string; end_date: string;
  daily_energy_target: number | null; updated_at: string;
};

export async function getPlan(db: SupabaseClient, tenantId: string, planId: string): Promise<PlanRow | null> {
  const { data } = await db
    .from("nutrition_plans")
    .select("id, tenant_id, status, start_date, end_date, daily_energy_target, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

/** archived plan mutation reddi (server enforce; §18). Editable = draft|active. */
export function isPlanEditable(status: string): boolean {
  return status === "draft" || status === "active";
}

/** Öğün → plan_id/plan_day_id çöz (tenant-scoped). Yoksa null (404). */
export async function getMealScope(
  db: SupabaseClient, tenantId: string, mealId: string,
): Promise<{ id: string; plan_id: string; plan_day_id: string } | null> {
  const { data } = await db
    .from("nutrition_plan_meals")
    .select("id, plan_id, plan_day_id")
    .eq("tenant_id", tenantId)
    .eq("id", mealId)
    .maybeSingle();
  return (data as { id: string; plan_id: string; plan_day_id: string } | null) ?? null;
}

/** Gün → plan_id çöz (tenant-scoped). */
export async function getDayScope(
  db: SupabaseClient, tenantId: string, dayId: string,
): Promise<{ id: string; plan_id: string; plan_date: string } | null> {
  const { data } = await db
    .from("nutrition_plan_days")
    .select("id, plan_id, plan_date")
    .eq("tenant_id", tenantId)
    .eq("id", dayId)
    .maybeSingle();
  return (data as { id: string; plan_id: string; plan_date: string } | null) ?? null;
}

/** Item → plan_id/meal_id çöz (tenant-scoped). */
export async function getItemScope(
  db: SupabaseClient, tenantId: string, itemId: string,
): Promise<{ id: string; plan_id: string; meal_id: string } | null> {
  const { data } = await db
    .from("nutrition_plan_items")
    .select("id, plan_id, meal_id")
    .eq("tenant_id", tenantId)
    .eq("id", itemId)
    .maybeSingle();
  return (data as { id: string; plan_id: string; meal_id: string } | null) ?? null;
}

/**
 * Atomik RPC SQLSTATE → HTTP kod eşlemesi (§22 hata sözleşmesi). Bilinmeyen → 500.
 *   45010 archived · 45011 range-has-content · 45012 target-not-empty ·
 *   45013 range-out-of-bounds · 45014 not-found · 45015 bad-input
 */
export function mapRpcError(pgCode: string | undefined): { code: string; status: number } {
  switch (pgCode) {
    case "45010": return { code: "PLAN_ARCHIVED", status: 403 };
    case "45011": return { code: "RANGE_HAS_CONTENT", status: 409 };
    case "45012": return { code: "TARGET_NOT_EMPTY", status: 409 };
    case "45013": return { code: "RANGE_OUT_OF_BOUNDS", status: 409 };
    case "45014": return { code: "NOT_FOUND", status: 404 };
    case "45015": return { code: "BAD_INPUT", status: 400 };
    default: return { code: "RPC_FAILED", status: 500 };
  }
}

// ── Lightweight plan overview (week/month) — per-day meal_count + energy total (dynamic aggregate) ──
export type PlanDaySummary = {
  id: string; plan_date: string; energy_target_override: number | null; note: string | null;
  meal_count: number; energy_total: number;
};

/**
 * Plan günlerini + per-gün meal_count + enerji toplamı döner (HAM enerji; §35/§37 lightweight).
 * N+1 YOK: 4 tenant-scoped indexed sorgu (days/meals/items/energy-nutrients) + JS aggregate.
 */
export async function loadPlanDaySummaries(
  db: SupabaseClient, tenantId: string, planId: string,
): Promise<PlanDaySummary[]> {
  const { data: days } = await db
    .from("nutrition_plan_days")
    .select(PLAN_DAY_COLUMNS)
    .eq("tenant_id", tenantId).eq("plan_id", planId)
    .order("plan_date", { ascending: true });
  const dayRows = (days as Array<{ id: string; plan_date: string; energy_target_override: number | null; note: string | null }> | null) ?? [];
  if (dayRows.length === 0) return [];

  const { data: meals } = await db
    .from("nutrition_plan_meals").select("id, plan_day_id")
    .eq("tenant_id", tenantId).eq("plan_id", planId);
  const mealRows = (meals as Array<{ id: string; plan_day_id: string }> | null) ?? [];
  const mealToDay = new Map<string, string>();
  const mealCount = new Map<string, number>();
  for (const m of mealRows) {
    mealToDay.set(m.id, m.plan_day_id);
    mealCount.set(m.plan_day_id, (mealCount.get(m.plan_day_id) ?? 0) + 1);
  }

  const { data: items } = await db
    .from("nutrition_plan_items").select("id, meal_id, grams")
    .eq("tenant_id", tenantId).eq("plan_id", planId);
  const itemRows = (items as Array<{ id: string; meal_id: string; grams: number }> | null) ?? [];
  const itemGrams = new Map<string, number>();
  const itemToDay = new Map<string, string>();
  for (const it of itemRows) {
    itemGrams.set(it.id, Number(it.grams));
    const d = mealToDay.get(it.meal_id);
    if (d) itemToDay.set(it.id, d);
  }

  const energyByDay = new Map<string, number>();
  if (itemRows.length > 0) {
    const { data: nutr } = await db
      .from("nutrition_plan_item_nutrients").select("item_id, amount")
      .eq("tenant_id", tenantId).eq("nutrient_code", "energy")
      .in("item_id", itemRows.map((i) => i.id));
    for (const n of (nutr as Array<{ item_id: string; amount: number }> | null) ?? []) {
      const day = itemToDay.get(n.item_id);
      if (!day) continue;
      const grams = itemGrams.get(n.item_id) ?? 0;
      energyByDay.set(day, (energyByDay.get(day) ?? 0) + itemNutrientContribution(grams, Number(n.amount)));
    }
  }

  return dayRows.map((d) => ({
    id: d.id, plan_date: d.plan_date, energy_target_override: d.energy_target_override, note: d.note,
    meal_count: mealCount.get(d.id) ?? 0,
    energy_total: energyByDay.get(d.id) ?? 0,
  }));
}

// ── Gün detay (day editor) — meals + items + frozen nutrient snapshot tree ──
export type DayDetail = {
  id: string; plan_id: string; plan_date: string; energy_target_override: number | null; note: string | null;
  meals: Array<{
    id: string; plan_day_id: string; meal_type: string | null; label: string; sort_order: number;
    energy_target: number | null; note: string | null;
    items: Array<{
      id: string; meal_id: string; food_id: string | null; grams: number; quantity: number | null;
      food_name_snapshot: string; food_ownership_snapshot: string;
      portion_label_snapshot: string | null; portion_gram_snapshot: number | null;
      external_provider_snapshot: string | null; external_version_snapshot: string | null;
      sort_order: number; note: string | null;
      nutrients: ItemNutrientSnapshot[];
    }>;
  }>;
};

export async function loadDayDetail(
  db: SupabaseClient, tenantId: string, planId: string, dayId: string,
): Promise<DayDetail | null> {
  const { data: day } = await db
    .from("nutrition_plan_days")
    .select("id, plan_id, plan_date, energy_target_override, note")
    .eq("tenant_id", tenantId).eq("plan_id", planId).eq("id", dayId)
    .maybeSingle();
  if (!day) return null;

  const { data: meals } = await db
    .from("nutrition_plan_meals")
    .select("id, plan_day_id, meal_type, label, sort_order, energy_target, note")
    .eq("tenant_id", tenantId).eq("plan_day_id", dayId)
    .order("sort_order", { ascending: true });
  const mealRows = (meals as DayDetail["meals"] | null) ?? [];
  if (mealRows.length === 0) return { ...(day as Omit<DayDetail, "meals">), meals: [] };

  const mealIds = mealRows.map((m) => m.id);
  const { data: items } = await db
    .from("nutrition_plan_items")
    .select("id, meal_id, food_id, grams, quantity, food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot, external_provider_snapshot, external_version_snapshot, sort_order, note")
    .eq("tenant_id", tenantId).in("meal_id", mealIds)
    .order("sort_order", { ascending: true });
  const itemRows = (items as Array<DayDetail["meals"][number]["items"][number]> | null) ?? [];

  const nutrByItem = new Map<string, ItemNutrientSnapshot[]>();
  if (itemRows.length > 0) {
    const { data: nutr } = await db
      .from("nutrition_plan_item_nutrients")
      .select("item_id, nutrient_code, amount, unit_code")
      .eq("tenant_id", tenantId).in("item_id", itemRows.map((i) => i.id));
    for (const n of (nutr as Array<{ item_id: string; nutrient_code: string; amount: number; unit_code: string }> | null) ?? []) {
      const arr = nutrByItem.get(n.item_id) ?? [];
      arr.push({ nutrient_code: n.nutrient_code, amount: Number(n.amount), unit_code: n.unit_code });
      nutrByItem.set(n.item_id, arr);
    }
  }

  const itemsByMeal = new Map<string, DayDetail["meals"][number]["items"]>();
  for (const it of itemRows) {
    const arr = itemsByMeal.get(it.meal_id) ?? [];
    arr.push({ ...it, grams: Number(it.grams), nutrients: nutrByItem.get(it.id) ?? [] });
    itemsByMeal.set(it.meal_id, arr);
  }

  return {
    ...(day as Omit<DayDetail, "meals">),
    meals: mealRows.map((m) => ({ ...m, items: itemsByMeal.get(m.id) ?? [] })),
  };
}

// ── Server-authoritative snapshot üretimi ──

export type ItemSnapshot = {
  food_id: string;
  grams: number;
  quantity: number | null;
  snapshot: {
    food_name: string;
    food_ownership: string;
    portion_label: string | null;
    portion_gram: number | null;
    external_provider: string | null;
    external_version: string | null;
  };
  nutrients: ItemNutrientSnapshot[];
};

export type SnapshotError = { code: string; status: number };
export type SnapshotResult = { ok: true; value: ItemSnapshot } | { ok: false; error: SnapshotError };

type NutrientJoinRow = {
  amount: number | string;
  nutrient: { code: string } | { code: string }[] | null;
  unit: { code: string } | { code: string }[] | null;
};
function pickJoin<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * { foodId, grams } veya { foodId, portionId, quantity } girdisinden DB-okumalı snapshot üretir.
 * Doğrulamalar (fail-closed): food accessible (SYSTEM|caller) → yoksa 404; portion aynı food'a
 *   ait değilse 400; grams/quantity pozitif değilse 400. Nutrient set DB'den donar.
 */
export async function buildItemSnapshot(
  db: SupabaseClient,
  tenantId: string,
  input: { foodId: string; grams?: number | null; portionId?: string | null; quantity?: number | null },
): Promise<SnapshotResult> {
  const food = (await resolveFoodForRead(db, tenantId, input.foodId, "id, tenant_id, name_tr")) as
    | { id: string; tenant_id: string; name_tr: string }
    | null;
  if (!food) return { ok: false, error: { code: "FOOD_NOT_FOUND", status: 404 } };

  const ownership = foodOwnershipClass(food.tenant_id);

  let grams: number;
  let quantity: number | null = null;
  let portionLabel: string | null = null;
  let portionGram: number | null = null;

  if (input.portionId != null) {
    // Porsiyon: AYNI food'a ait olmalı (tenant + food_id eşleşmesi; §14).
    const { data: portion } = await db
      .from("nutrition_food_portions")
      .select("id, label_tr, gram_weight")
      .eq("tenant_id", food.tenant_id)
      .eq("food_id", food.id)
      .eq("id", input.portionId)
      .maybeSingle();
    if (!portion) return { ok: false, error: { code: "PORTION_MISMATCH", status: 400 } };
    const q = input.quantity == null ? 1 : input.quantity;
    if (!Number.isFinite(q) || q <= 0) return { ok: false, error: { code: "BAD_QUANTITY", status: 400 } };
    const gw = Number((portion as { gram_weight: number }).gram_weight);
    if (!Number.isFinite(gw) || gw <= 0) return { ok: false, error: { code: "BAD_PORTION", status: 400 } };
    quantity = q;
    portionGram = gw;
    portionLabel = (portion as { label_tr: string }).label_tr;
    grams = q * gw;
  } else {
    const g = input.grams;
    if (g == null || !Number.isFinite(g) || g <= 0) return { ok: false, error: { code: "BAD_GRAMS", status: 400 } };
    grams = g;
  }
  if (!Number.isFinite(grams) || grams <= 0) return { ok: false, error: { code: "BAD_GRAMS", status: 400 } };

  // Nutrient /100 g setini DB'den oku → snapshot (code + amount + unit_code).
  const { data: nutrientRows } = await db
    .from("nutrition_food_nutrients")
    .select("amount, nutrient:nutrition_nutrients(code), unit:nutrition_units(code)")
    .eq("tenant_id", food.tenant_id)
    .eq("food_id", food.id);
  const nutrients: ItemNutrientSnapshot[] = [];
  for (const r of (nutrientRows as NutrientJoinRow[] | null) ?? []) {
    const nut = pickJoin(r.nutrient);
    const unit = pickJoin(r.unit);
    const amount = Number(r.amount);
    if (!nut?.code || !unit?.code || !Number.isFinite(amount) || amount < 0) continue;
    nutrients.push({ nutrient_code: nut.code, amount, unit_code: unit.code });
  }

  // Dış-kaynak izlenebilirliği (varsa; usda_fdc öncelik). Tek satır snapshot'lanır.
  const { data: extRows } = await db
    .from("nutrition_food_external_refs")
    .select("provider, external_version")
    .eq("tenant_id", food.tenant_id)
    .eq("food_id", food.id)
    .order("provider", { ascending: true });
  const ext = ((extRows as { provider: string; external_version: string | null }[] | null) ?? [])[0] ?? null;

  return {
    ok: true,
    value: {
      food_id: food.id,
      grams,
      quantity,
      snapshot: {
        food_name: food.name_tr,
        food_ownership: ownership,
        portion_label: portionLabel,
        portion_gram: portionGram,
        external_provider: ext?.provider ?? null,
        external_version: ext?.external_version ?? null,
      },
      nutrients,
    },
  };
}
