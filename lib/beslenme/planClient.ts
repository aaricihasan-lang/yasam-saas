"use client";
/**
 * Beslenme FAZ 5 / Plan Motoru — client fetch köprüsü. Tüm çağrılar owner-gated API'lere
 * gider (x-user-id + x-session-token). Tenant/snapshot client body'de GÖNDERİLMEZ (server üretir).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

function authHeaders(json = false): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; code?: string }> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && json.ok === true, status: res.status, data: json as T, code: json.code as string | undefined };
  } catch {
    return { ok: false, status: 0, data: null, code: "NETWORK" };
  }
}

// ── Tipler ──
export type Plan = {
  id: string; tenant_id: string; title: string; note: string | null;
  start_date: string; end_date: string; daily_energy_target: number | null;
  status: "draft" | "active" | "archived"; plan_family_id: string; revision_number: number;
  created_at: string; updated_at: string;
};
export type PlanDaySummary = {
  id: string; plan_date: string; energy_target_override: number | null; note: string | null;
  meal_count: number; energy_total: number;
};
export type ItemNutrient = { nutrient_code: string; amount: number; unit_code: string };
export type PlanItem = {
  id: string; meal_id: string; food_id: string | null; grams: number; quantity: number | null;
  food_name_snapshot: string; food_ownership_snapshot: "system" | "custom";
  portion_label_snapshot: string | null; portion_gram_snapshot: number | null;
  external_provider_snapshot: string | null; external_version_snapshot: string | null;
  sort_order: number; note: string | null; nutrients: ItemNutrient[];
};
export type PlanMeal = {
  id: string; plan_day_id: string; meal_type: string | null; label: string;
  sort_order: number; energy_target: number | null; note: string | null; items: PlanItem[];
};
export type PlanDayDetail = {
  id: string; plan_id: string; plan_date: string; energy_target_override: number | null;
  note: string | null; meals: PlanMeal[];
};

// ── Plan CRUD ──
export function listPlans(params?: { status?: string }) {
  const u = new URLSearchParams();
  if (params?.status) u.set("status", params.status);
  return req<{ plans: Plan[] }>(`/api/beslenme/plans?${u.toString()}`, { headers: authHeaders() });
}
export function createPlan(body: { title: string; start_date: string; end_date: string; daily_energy_target?: number | null; note?: string | null }) {
  return req<{ plan: Plan }>("/api/beslenme/plans", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function getPlan(id: string) {
  return req<{ plan: Plan; days: PlanDaySummary[] }>(`/api/beslenme/plans/${id}`, { headers: authHeaders() });
}
export function patchPlan(id: string, body: { title?: string; note?: string | null; daily_energy_target?: number | null; status?: string; expectedUpdatedAt?: string }) {
  return req<{ plan: Plan }>(`/api/beslenme/plans/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deletePlan(id: string) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${id}`, { method: "DELETE", headers: authHeaders() });
}
export function copyPlan(id: string, body: { title?: string; start_date?: string | null }) {
  return req<{ plan: Plan }>(`/api/beslenme/plans/${id}/copy`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function revisePlan(id: string) {
  return req<{ plan: Plan }>(`/api/beslenme/plans/${id}/revise`, { method: "POST", headers: authHeaders(true), body: "{}" });
}
export function syncRange(id: string, body: { start_date: string; end_date: string }) {
  return req<{ plan: Plan }>(`/api/beslenme/plans/${id}/range`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}

// ── Day ──
export function getDay(planId: string, dayId: string) {
  return req<{ day: PlanDayDetail }>(`/api/beslenme/plans/${planId}/days/${dayId}`, { headers: authHeaders() });
}
export function patchDay(planId: string, dayId: string, body: { energy_target_override?: number | null; note?: string | null }) {
  return req<{ day: PlanDayDetail }>(`/api/beslenme/plans/${planId}/days/${dayId}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function clearDay(planId: string, dayId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/days/${dayId}/clear`, { method: "POST", headers: authHeaders(true), body: "{}" });
}
export function copyDay(planId: string, dayId: string, targetDayId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/days/${dayId}/copy`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ targetDayId }) });
}

// ── Meal ──
export function createMeal(planId: string, body: { plan_day_id: string; meal_type?: string | null; label: string; energy_target?: number | null; note?: string | null; sort_order?: number }) {
  return req<{ meal: PlanMeal }>(`/api/beslenme/plans/${planId}/days/${body.plan_day_id}/meals`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function patchMeal(planId: string, mealId: string, body: { meal_type?: string | null; label?: string; energy_target?: number | null; note?: string | null; sort_order?: number }) {
  return req<{ meal: PlanMeal }>(`/api/beslenme/plans/${planId}/meals/${mealId}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteMeal(planId: string, mealId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/meals/${mealId}`, { method: "DELETE", headers: authHeaders() });
}
export function reorderMeals(planId: string, dayId: string, order: string[]) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/meals/reorder`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ dayId, order }) });
}
export function copyMeal(planId: string, mealId: string, targetDayId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/meals/${mealId}/copy`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ targetDayId }) });
}

// ── Item ── (SNAPSHOT client'tan GELMEZ; yalnız foodId + grams/portion)
type ItemAmount = { grams?: number | null; portion_id?: string | null; quantity?: number | null; note?: string | null };
export function addItem(planId: string, mealId: string, body: { food_id: string } & ItemAmount) {
  return req<{ item: PlanItem }>(`/api/beslenme/plans/${planId}/meals/${mealId}/items`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
/** Miktar/porsiyon düzenle (frozen nutrient snapshot DEĞİŞMEZ) veya başka öğüne taşı (target_meal_id). */
export function patchItem(planId: string, itemId: string, body: ItemAmount & { target_meal_id?: string }) {
  return req<{ item: PlanItem }>(`/api/beslenme/plans/${planId}/items/${itemId}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
/** Besini değiştir → YENİ snapshot (server food'u yeniden çözer). */
export function replaceItemFood(planId: string, itemId: string, body: { food_id: string } & ItemAmount) {
  return req<{ item: PlanItem }>(`/api/beslenme/plans/${planId}/items/${itemId}`, { method: "PUT", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteItem(planId: string, itemId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/items/${itemId}`, { method: "DELETE", headers: authHeaders() });
}
export function copyItem(planId: string, itemId: string, targetMealId: string) {
  return req<{ item: PlanItem }>(`/api/beslenme/plans/${planId}/items/${itemId}/copy`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ targetMealId }) });
}

// ── Week copy ──
export function weekCopy(planId: string, body: { source_start: string; target_start: string; span_days: number }) {
  return req<Record<string, unknown>>(`/api/beslenme/plans/${planId}/week-copy`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
