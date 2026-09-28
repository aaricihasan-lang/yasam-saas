import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan } from "./planEngine";
import { fetchAllPaged, chunkIds } from "./pagedFetch";
import { resolveEffectiveFoodsBatch, loadSnapshotSources } from "./effectiveBatch";
import { energyOf, sameNutrientSet, type SnapNutrient } from "./effectiveCore";
import { foodOwnershipClass } from "./systemTenant";

/**
 * TASLAK plan — MANUEL "Besin değerlerini güncelle" önizleme + yük (server-authoritative).
 *
 * Snapshot mimarisi korunur: bu hesap yalnız kullanıcı istediğinde çalışır; plan status='draft'
 * değilse güncelleme YAPILMAZ. Her kalem için effective besin (uzman kopyası ?? sistem) okunur;
 * /100 g seti, adı veya effective kimliği farklı olan kalemler "değişecek" listesine girer.
 * Besini çalışma alanından kaldırılmış/silinmiş kalemler DOKUNULMADAN kalır (ayrıca listelenir).
 * grams / quantity / porsiyon / sıra / not DEĞİŞMEZ.
 */

type ItemRow = { id: string; food_id: string | null; meal_id: string; grams: number | string; food_name_snapshot: string };
type ItemNutrientRow = { id: string; item_id: string; nutrient_code: string; amount: number | string; unit_code: string };

export type RefreshChange = {
  item_id: string;
  plan_date: string | null;
  meal_label: string | null;
  food_name_before: string;
  food_name_after: string;
  grams: number;
  energy_per100_before: number | null;
  energy_per100_after: number | null;
};

export type RefreshPlan = {
  eligible: boolean;
  status: string;
  totalItems: number;
  changes: RefreshChange[];
  unavailable: Array<{ item_id: string; food_name: string }>;
  payload: Array<Record<string, unknown>>;
};

export async function computeSnapshotRefresh(
  db: SupabaseClient,
  tenantId: string,
  planId: string,
): Promise<{ ok: true; value: RefreshPlan } | { ok: false; code: string; status: number }> {
  const plan = await getPlan(db, tenantId, planId);
  if (!plan) return { ok: false, code: "NOT_FOUND", status: 404 };

  const items = await fetchAllPaged<ItemRow>((from, to) =>
    db
      .from("nutrition_plan_items")
      .select("id, food_id, meal_id, grams, food_name_snapshot")
      .eq("tenant_id", tenantId)
      .eq("plan_id", planId)
      .not("food_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const oldSets = new Map<string, SnapNutrient[]>();
  for (const part of chunkIds(items.map((i) => i.id), 200)) {
    const rows = await fetchAllPaged<ItemNutrientRow>((from, to) =>
      db
        .from("nutrition_plan_item_nutrients")
        .select("id, item_id, nutrient_code, amount, unit_code")
        .eq("tenant_id", tenantId)
        .in("item_id", part)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const r of rows) {
      if (!oldSets.has(r.item_id)) oldSets.set(r.item_id, []);
      oldSets.get(r.item_id)!.push({ nutrient_code: r.nutrient_code, amount: Number(r.amount), unit_code: r.unit_code });
    }
  }

  const effMap = await resolveEffectiveFoodsBatch(db, tenantId, items.map((i) => i.food_id as string));
  const effFoods = [...new Map([...effMap.values()].filter((f) => f).map((f) => [f!.id, f!])).values()];
  const sources = await loadSnapshotSources(db, effFoods);

  // Görüntü bağlamı: öğün etiketi + gün tarihi.
  const mealIds = [...new Set(items.map((i) => i.meal_id))];
  const mealInfo = new Map<string, { label: string | null; day: string }>();
  for (const part of chunkIds(mealIds, 200)) {
    const { data } = await db.from("nutrition_plan_meals").select("id, label, plan_day_id").eq("tenant_id", tenantId).in("id", part);
    for (const m of (data as Array<{ id: string; label: string | null; plan_day_id: string }> | null) ?? []) {
      mealInfo.set(m.id, { label: m.label, day: m.plan_day_id });
    }
  }
  const dayIds = [...new Set([...mealInfo.values()].map((m) => m.day))];
  const dayDate = new Map<string, string>();
  for (const part of chunkIds(dayIds, 200)) {
    const { data } = await db.from("nutrition_plan_days").select("id, plan_date").eq("tenant_id", tenantId).in("id", part);
    for (const d of (data as Array<{ id: string; plan_date: string }> | null) ?? []) dayDate.set(d.id, d.plan_date);
  }

  const changes: RefreshChange[] = [];
  const unavailable: Array<{ item_id: string; food_name: string }> = [];
  const payload: Array<Record<string, unknown>> = [];
  for (const it of items) {
    const eff = effMap.get(it.food_id as string) ?? null;
    if (!eff) {
      unavailable.push({ item_id: it.id, food_name: it.food_name_snapshot });
      continue;
    }
    const src = sources.get(eff.id) ?? { nutrients: [], externalProvider: null, externalVersion: null };
    const before = oldSets.get(it.id) ?? [];
    const same = sameNutrientSet(before, src.nutrients) && eff.name_tr === it.food_name_snapshot && eff.id === it.food_id;
    if (same) continue;
    const meal = mealInfo.get(it.meal_id);
    changes.push({
      item_id: it.id,
      plan_date: meal ? dayDate.get(meal.day) ?? null : null,
      meal_label: meal?.label ?? null,
      food_name_before: it.food_name_snapshot,
      food_name_after: eff.name_tr,
      grams: Number(it.grams),
      energy_per100_before: energyOf(before),
      energy_per100_after: energyOf(src.nutrients),
    });
    payload.push({
      item_id: it.id,
      food_id: eff.id,
      food_name: eff.name_tr,
      food_ownership: foodOwnershipClass(eff.tenant_id),
      external_provider: src.externalProvider,
      external_version: src.externalVersion,
      nutrients: src.nutrients,
    });
  }
  changes.sort((a, b) => (a.plan_date ?? "").localeCompare(b.plan_date ?? "") || a.food_name_after.localeCompare(b.food_name_after, "tr"));

  return {
    ok: true,
    value: { eligible: plan.status === "draft", status: plan.status, totalItems: items.length, changes, unavailable, payload },
  };
}
