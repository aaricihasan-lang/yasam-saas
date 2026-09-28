import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_NUTRITION_TENANT_ID, isSystemNutritionTenant } from "./systemTenant";

/**
 * Beslenme — besin motoru server yardımcıları (TEK erişim noktası).
 *
 * EFFECTIVE BESİN (2026-09-27 owner kararı): uzman sistem besinini kendi çalışma alanında
 *   kişiselleştirebilir. Global SYSTEM satırı ASLA UPDATE/DELETE edilmez; ilk yazmada
 *   uzmanın tenant'ına tam kopya (origin_food_id → SYSTEM) oluşur (nutrition_food_fork_system).
 *   Tenant için effective besin (nutrition_food_resolve_effective):
 *     kendi satırı → kendisi · SYSTEM satırı → gizlenmişse YOK, kopyası varsa KOPYA, yoksa SYSTEM.
 *
 * READ  = effective kapsam (üçüncü tenant ASLA görünmez; gizlenen SYSTEM besini görünmez).
 * WRITE = yalnız caller-owned satır; SYSTEM besinine yazma isteği önce KOPYAYA yönlenir.
 *         tenant_id ASLA client body'den gelmez.
 */

export type FoodOwnerRow = { id: string; tenant_id: string; origin_food_id?: string | null };

export type EffectiveFood = { id: string; tenant_id: string; origin_food_id: string | null; redirected: boolean };

/** Tenant için effective besini çöz (yoksa null → 404). */
export async function resolveEffectiveFood(
  db: SupabaseClient,
  callerTenantId: string,
  foodId: string,
): Promise<EffectiveFood | null> {
  const { data, error } = await db.rpc("nutrition_food_resolve_effective", {
    p_tenant_id: callerTenantId,
    p_system_tenant_id: SYSTEM_NUTRITION_TENANT_ID,
    p_food_id: foodId,
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as EffectiveFood | undefined;
  return row?.id ? row : null;
}

/** Okuma: effective besini getir (kolonlar effective satırdan; yoksa null → 404). */
export async function resolveFoodForRead(
  db: SupabaseClient,
  callerTenantId: string,
  foodId: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  const eff = await resolveEffectiveFood(db, callerTenantId, foodId);
  if (!eff) return null;
  const { data } = await db
    .from("nutrition_foods")
    .select(columns)
    .eq("tenant_id", eff.tenant_id)
    .eq("id", eff.id)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export type WriteGuard =
  | { ok: true; food: FoodOwnerRow; forked: boolean }
  | { ok: false; code: string; status: number };

/** SQLSTATE → API kodu (besin RPC'leri). */
export function mapFoodRpcError(pgCode: string | undefined): { code: string; status: number } {
  switch (pgCode) {
    case "45014": return { code: "NOT_FOUND", status: 404 };
    case "45015": return { code: "BAD_INPUT", status: 400 };
    case "45030": return { code: "SYSTEM_READONLY", status: 403 };
    case "45031": return { code: "FORK_NAME_CONFLICT", status: 409 };
    case "23503": return { code: "IN_USE", status: 409 };
    case "23505": return { code: "DUPLICATE", status: 409 };
    case "23514": return { code: "BAD_INPUT", status: 400 };
    default: return { code: "WRITE_FAILED", status: 500 };
  }
}

/**
 * Yazma kapısı: effective besin caller'a aitse onu döndürür. Effective besin SYSTEM satırıysa
 * uzmanın KİŞİSEL KOPYASI oluşturulur (idempotent, atomik) ve kopya döndürülür (forked=true).
 * SYSTEM tenant bağlamı (sentinel) sistem satırını değiştiremez → 403. Bulunamazsa 404.
 */
export async function resolveFoodForWrite(
  db: SupabaseClient,
  callerTenantId: string,
  foodId: string,
): Promise<WriteGuard> {
  const eff = await resolveEffectiveFood(db, callerTenantId, foodId);
  if (!eff) return { ok: false, code: "NOT_FOUND", status: 404 };
  if (!isSystemNutritionTenant(eff.tenant_id)) {
    return { ok: true, food: { id: eff.id, tenant_id: eff.tenant_id, origin_food_id: eff.origin_food_id }, forked: false };
  }
  if (isSystemNutritionTenant(callerTenantId)) return { ok: false, code: "SYSTEM_READONLY", status: 403 };
  const { data, error } = await db.rpc("nutrition_food_fork_system", {
    p_tenant_id: callerTenantId,
    p_system_tenant_id: SYSTEM_NUTRITION_TENANT_ID,
    p_food_id: eff.id,
  });
  if (error || typeof data !== "string") {
    const m = mapFoodRpcError(error?.code);
    return { ok: false, code: m.code, status: m.status };
  }
  return { ok: true, food: { id: data, tenant_id: callerTenantId, origin_food_id: eff.id }, forked: true };
}

/** Besini kullanan rehberlerin başlıkları (tenant-scoped) — "Sil"/"Sistem değerine dön" 409 mesajı için. */
export async function listFoodTopicUsage(
  db: SupabaseClient,
  tenantId: string,
  foodIds: string[],
): Promise<Array<{ food_id: string; topic_id: string; title: string }>> {
  if (foodIds.length === 0) return [];
  const { data } = await db
    .from("nutrition_topic_foods")
    .select("food_id, topic_id, topic:nutrition_topics(title)")
    .eq("tenant_id", tenantId)
    .in("food_id", foodIds);
  const out: Array<{ food_id: string; topic_id: string; title: string }> = [];
  for (const r of (data as Array<{ food_id: string; topic_id: string; topic: { title: string } | { title: string }[] | null }> | null) ?? []) {
    const t = Array.isArray(r.topic) ? r.topic[0] : r.topic;
    out.push({ food_id: r.food_id, topic_id: r.topic_id, title: t?.title ?? "Rehber" });
  }
  return out;
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
