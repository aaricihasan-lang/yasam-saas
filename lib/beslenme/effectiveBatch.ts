import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_NUTRITION_TENANT_ID, isSystemNutritionTenant } from "./systemTenant";
import { computeEffectiveMap, type FoodLite, type SnapNutrient } from "./effectiveCore";
import { chunkIds, fetchAllPaged } from "./pagedFetch";

/**
 * Toplu effective besin çözümü (N+1 yok): istenen food id'leri → effective satır (veya null).
 * Tenant izolasyonu: yalnız caller tenant ∪ SYSTEM satırları okunur; başka tenant ASLA.
 */
export async function resolveEffectiveFoodsBatch(
  db: SupabaseClient,
  tenantId: string,
  requestedIds: string[],
): Promise<Map<string, FoodLite | null>> {
  const ids = [...new Set(requestedIds)];
  if (ids.length === 0) return new Map();
  const scope = isSystemNutritionTenant(tenantId) ? [SYSTEM_NUTRITION_TENANT_ID] : [SYSTEM_NUTRITION_TENANT_ID, tenantId];
  const rows: FoodLite[] = [];
  const forks: FoodLite[] = [];
  const hiddenIds: string[] = [];
  for (const part of chunkIds(ids, 100)) {
    const [r, f, h] = await Promise.all([
      db.from("nutrition_foods").select("id, tenant_id, name_tr, origin_food_id").in("tenant_id", scope).in("id", part),
      db.from("nutrition_foods").select("id, tenant_id, name_tr, origin_food_id").eq("tenant_id", tenantId).in("origin_food_id", part),
      db.from("nutrition_food_tenant_hidden").select("food_id").eq("tenant_id", tenantId).in("food_id", part),
    ]);
    rows.push(...((r.data as FoodLite[] | null) ?? []));
    forks.push(...((f.data as FoodLite[] | null) ?? []));
    hiddenIds.push(...(((h.data as Array<{ food_id: string }> | null) ?? []).map((x) => x.food_id)));
  }
  return computeEffectiveMap({ tenantId, systemTenantId: SYSTEM_NUTRITION_TENANT_ID, requestedIds: ids, rows, forks, hiddenIds });
}

/**
 * Bu tenant için "gölgelenmiş" SYSTEM besin id'leri: uzmanın kişisel kopyası olan (kopya kendi
 * satırı olarak listelenir) veya çalışma alanından kaldırdığı sistem besinleri. Aday/seçici
 * havuzlarında bu id'ler gösterilmez (çift kayıt / kaldırılmış besin YOK).
 */
export async function loadShadowedSystemIds(db: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (isSystemNutritionTenant(tenantId)) return out;
  const [forks, hidden] = await Promise.all([
    fetchAllPaged<{ id: string; origin_food_id: string | null }>((from, to) =>
      db
        .from("nutrition_foods")
        .select("id, origin_food_id")
        .eq("tenant_id", tenantId)
        .not("origin_food_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPaged<{ food_id: string }>((from, to) =>
      db
        .from("nutrition_food_tenant_hidden")
        .select("food_id")
        .eq("tenant_id", tenantId)
        .order("food_id", { ascending: true })
        .range(from, to),
    ),
  ]);
  for (const f of forks) if (f.origin_food_id) out.add(f.origin_food_id);
  for (const h of hidden) out.add(h.food_id);
  return out;
}

type NutrientJoinRow = {
  food_id: string;
  amount: number | string;
  nutrient: { code: string } | { code: string }[] | null;
  unit: { code: string } | { code: string }[] | null;
};
const pick = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Effective besinlerin /100 g nutrient setleri + dış-kaynak provenance (snapshot üretimi için). */
export async function loadSnapshotSources(
  db: SupabaseClient,
  foods: FoodLite[],
): Promise<Map<string, { nutrients: SnapNutrient[]; externalProvider: string | null; externalVersion: string | null }>> {
  const out = new Map<string, { nutrients: SnapNutrient[]; externalProvider: string | null; externalVersion: string | null }>();
  for (const f of foods) out.set(f.id, { nutrients: [], externalProvider: null, externalVersion: null });
  const byTenant = new Map<string, string[]>();
  for (const f of foods) {
    if (!byTenant.has(f.tenant_id)) byTenant.set(f.tenant_id, []);
    byTenant.get(f.tenant_id)!.push(f.id);
  }
  for (const [tenant, foodIds] of byTenant) {
    for (const part of chunkIds(foodIds, 100)) {
      const [nutRows, ext] = await Promise.all([
        fetchAllPaged<NutrientJoinRow>((from, to) =>
          db
            .from("nutrition_food_nutrients")
            .select("id, food_id, amount, nutrient:nutrition_nutrients(code), unit:nutrition_units(code)")
            .eq("tenant_id", tenant)
            .in("food_id", part)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        db
          .from("nutrition_food_external_refs")
          .select("food_id, provider, external_version")
          .eq("tenant_id", tenant)
          .in("food_id", part)
          .order("provider", { ascending: true }),
      ]);
      for (const r of nutRows) {
        const n = pick(r.nutrient);
        const u = pick(r.unit);
        const amount = Number(r.amount);
        if (!n?.code || !u?.code || !Number.isFinite(amount) || amount < 0) continue;
        out.get(r.food_id)?.nutrients.push({ nutrient_code: n.code, amount, unit_code: u.code });
      }
      for (const e of (ext.data as Array<{ food_id: string; provider: string; external_version: string | null }> | null) ?? []) {
        const slot = out.get(e.food_id);
        if (slot && !slot.externalProvider) {
          slot.externalProvider = e.provider;
          slot.externalVersion = e.external_version;
        }
      }
    }
  }
  return out;
}
