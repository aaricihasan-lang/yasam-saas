import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemNutrientSnapshot } from "@/lib/beslenme/planContracts";
import {
  buildPlanDocxFromTree,
  MAX_PLAN_DAY_SPAN,
  MAX_PLAN_ITEMS,
  type PlanDocxTree,
  type PlanDocxResult,
  type PlanDocxDay,
  type PlanDocxMeal,
  type PlanDocxItem,
} from "./planDocxBuilder";
import { daysBetween } from "@/lib/beslenme/planContracts";

/**
 * Beslenme FAZ 6 / Plan Word — server yükleyici (SNAPSHOT-only).
 *
 * Plan ağacını YALNIZ snapshot tablolarından okur:
 *   nutrition_plan_days / _meals / _items / _item_nutrients.
 * nutrition_foods ASLA okunmaz (donmuş kayıt esastır; §12/§13). Tüm sorgular tenant-scoped.
 * N+1 YOK: gün/öğün/item/nutrient 4 (+chunk) toplu sorguda çekilir; ağaç JS'te kurulur.
 *
 * GÜVENLİK: bu dosya VE saf kurucu (planDocxBuilder.ts) uzak görsel getirme kod-yolu
 * TAŞIMAZ (SSRF-güvenli): hiçbir uzak-görsel getirme/gömme API'si çağrılmaz.
 * Beslenme Word HİÇBİR uzak görsel çekmez.
 */

export type { PlanDocxResult } from "./planDocxBuilder";

const PLAN_SELECT =
  "id, title, note, start_date, end_date, daily_energy_target, status, revision_number, plan_family_id";

type PlanRow = {
  id: string; title: string; note: string | null;
  start_date: string; end_date: string;
  daily_energy_target: number | null; status: string; revision_number: number | null;
  plan_family_id: string;
};

/**
 * Bağlı danışan adı (FAZ 7) — export anındaki CURRENT ad (snapshot DEĞİL; plan'a PII
 * yazılmaz). Bağlı değilse null. Yalnız ad+soyad; telefon/email/adres KONMAZ (§34).
 */
async function boundClientName(db: SupabaseClient, tenantId: string, planFamilyId: string): Promise<string | null> {
  const { data: bind } = await db
    .from("nutrition_plan_clients")
    .select("client_id")
    .eq("tenant_id", tenantId).eq("plan_family_id", planFamilyId)
    .maybeSingle();
  const clientId = (bind as { client_id?: string } | null)?.client_id;
  if (!clientId) return null;
  const { data: cli } = await db
    .from("clients").select("ad, soyad").eq("tenant_id", tenantId).eq("id", clientId).maybeSingle();
  if (!cli) return null;
  const c = cli as { ad: string | null; soyad: string | null };
  const raw = `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();
  return raw || null;
}

/** .in() URL sınırını aşmamak için item id chunk'ları (büyük planlar). */
function chunk<T>(arr: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Plan → DOCX buffer + dosya adı. Bulunamazsa NOT_FOUND(404). Boyut aşımı PLAN_TOO_LARGE(413).
 * Arşiv planlar da export edilebilir (yalnız okuma).
 */
export async function buildPlanDocxBuffer(
  db: SupabaseClient,
  tenantId: string,
  planId: string,
): Promise<PlanDocxResult> {
  const { data: planData } = await db
    .from("nutrition_plans")
    .select(PLAN_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();
  const plan = (planData as PlanRow | null) ?? null;
  if (!plan) return { ok: false, error: { code: "NOT_FOUND", status: 404 } };

  // Günler (kronolojik).
  const { data: dayData } = await db
    .from("nutrition_plan_days")
    .select("id, plan_date, energy_target_override, note")
    .eq("tenant_id", tenantId).eq("plan_id", planId)
    .order("plan_date", { ascending: true });
  const dayRows = (dayData as Array<{ id: string; plan_date: string; energy_target_override: number | null; note: string | null }> | null) ?? [];

  // Öğünler.
  const { data: mealData } = await db
    .from("nutrition_plan_meals")
    .select("id, plan_day_id, meal_type, label, sort_order")
    .eq("tenant_id", tenantId).eq("plan_id", planId);
  const mealRows = (mealData as Array<{ id: string; plan_day_id: string; meal_type: string | null; label: string; sort_order: number }> | null) ?? [];

  // Item'lar (donmuş snapshot alanları).
  const { data: itemData } = await db
    .from("nutrition_plan_items")
    .select("id, meal_id, grams, quantity, food_name_snapshot, portion_label_snapshot, sort_order")
    .eq("tenant_id", tenantId).eq("plan_id", planId);
  const itemRows = (itemData as Array<{ id: string; meal_id: string; grams: number; quantity: number | null; food_name_snapshot: string; portion_label_snapshot: string | null; sort_order: number }> | null) ?? [];

  // Erken boyut kontrolü (nutrient yükünden ÖNCE): span ≤ 366 ve item ≤ 3000.
  const span = daysBetween(plan.start_date, plan.end_date);
  if ((Number.isFinite(span) && span > MAX_PLAN_DAY_SPAN) || itemRows.length > MAX_PLAN_ITEMS) {
    return { ok: false, error: { code: "PLAN_TOO_LARGE", status: 413 } };
  }

  // Nutrient snapshot'ları (item_id chunk'lı; tenant-scoped).
  const nutrByItem = new Map<string, ItemNutrientSnapshot[]>();
  if (itemRows.length > 0) {
    for (const ids of chunk(itemRows.map((i) => i.id))) {
      const { data: nutr } = await db
        .from("nutrition_plan_item_nutrients")
        .select("item_id, nutrient_code, amount, unit_code")
        .eq("tenant_id", tenantId)
        .in("item_id", ids);
      for (const n of (nutr as Array<{ item_id: string; nutrient_code: string; amount: number; unit_code: string }> | null) ?? []) {
        const arr = nutrByItem.get(n.item_id) ?? [];
        arr.push({ nutrient_code: n.nutrient_code, amount: Number(n.amount), unit_code: n.unit_code });
        nutrByItem.set(n.item_id, arr);
      }
    }
  }

  // Ağacı kur (item → meal → day).
  const itemsByMeal = new Map<string, PlanDocxItem[]>();
  for (const it of itemRows) {
    const arr = itemsByMeal.get(it.meal_id) ?? [];
    arr.push({
      id: it.id,
      food_name_snapshot: it.food_name_snapshot,
      quantity: it.quantity,
      portion_label_snapshot: it.portion_label_snapshot,
      grams: Number(it.grams),
      sort_order: it.sort_order,
      nutrients: nutrByItem.get(it.id) ?? [],
    });
    itemsByMeal.set(it.meal_id, arr);
  }

  const mealsByDay = new Map<string, PlanDocxMeal[]>();
  for (const m of mealRows) {
    const arr = mealsByDay.get(m.plan_day_id) ?? [];
    arr.push({
      id: m.id,
      meal_type: m.meal_type,
      label: m.label,
      sort_order: m.sort_order,
      items: itemsByMeal.get(m.id) ?? [],
    });
    mealsByDay.set(m.plan_day_id, arr);
  }

  const recipientName = await boundClientName(db, tenantId, plan.plan_family_id);

  const tree: PlanDocxTree = {
    plan: { ...plan },
    recipientName,
    days: dayRows.map<PlanDocxDay>((d) => ({
      id: d.id,
      plan_date: d.plan_date,
      energy_target_override: d.energy_target_override,
      note: d.note,
      meals: mealsByDay.get(d.id) ?? [],
    })),
  };

  return buildPlanDocxFromTree(tree);
}
