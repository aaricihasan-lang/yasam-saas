import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_NUTRITION_TENANT_ID, isSystemNutritionTenant } from "./systemTenant";

/**
 * Beslenme FAZ 4 — besin motoru server yardımcıları (TEK erişim noktası).
 *
 * READ  = { SYSTEM, caller } kapsamı (üçüncü tenant ASLA görünmez).
 * WRITE = yalnız caller-owned CUSTOM food. SYSTEM food normal attribute API'siyle
 *         DEĞİŞTİRİLEMEZ (403 SYSTEM_READONLY) — SYSTEM katalog yalnız importer/script
 *         (service_role) yoluyla küratörlenir. tenant_id ASLA client body'den gelmez.
 */

export type FoodOwnerRow = { id: string; tenant_id: string };

const readableScope = (callerTenantId: string): string[] =>
  callerTenantId === SYSTEM_NUTRITION_TENANT_ID
    ? [SYSTEM_NUTRITION_TENANT_ID]
    : [SYSTEM_NUTRITION_TENANT_ID, callerTenantId];

/** Okuma: food'u { SYSTEM, caller } kapsamında getir (yoksa null → 404). */
export async function resolveFoodForRead(
  db: SupabaseClient,
  callerTenantId: string,
  foodId: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("nutrition_foods")
    .select(columns)
    .in("tenant_id", readableScope(callerTenantId))
    .eq("id", foodId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export type WriteGuard =
  | { ok: true; food: FoodOwnerRow }
  | { ok: false; code: string; status: number };

/** Yazma kapısı: food caller'a ait CUSTOM olmalı. SYSTEM → 403; bulunamazsa → 404. */
export async function resolveFoodForWrite(
  db: SupabaseClient,
  callerTenantId: string,
  foodId: string,
): Promise<WriteGuard> {
  const food = (await resolveFoodForRead(db, callerTenantId, foodId, "id, tenant_id")) as FoodOwnerRow | null;
  if (!food) return { ok: false, code: "NOT_FOUND", status: 404 };
  if (isSystemNutritionTenant(food.tenant_id)) return { ok: false, code: "SYSTEM_READONLY", status: 403 };
  return { ok: true, food };
}

export type NutrientRef = { id: string; code: string; category: string };
export type UnitRef = { id: string; code: string; unit_type: string };

export async function loadNutrientDict(db: SupabaseClient): Promise<Map<string, NutrientRef>> {
  const { data } = await db.from("nutrition_nutrients").select("id, code, category").eq("is_active", true);
  const m = new Map<string, NutrientRef>();
  for (const r of (data as NutrientRef[] | null) ?? []) m.set(r.code, r);
  return m;
}

export async function loadUnitDict(db: SupabaseClient): Promise<Map<string, UnitRef>> {
  const { data } = await db.from("nutrition_units").select("id, code, unit_type").eq("is_active", true);
  const m = new Map<string, UnitRef>();
  for (const r of (data as UnitRef[] | null) ?? []) m.set(r.code, r);
  return m;
}
