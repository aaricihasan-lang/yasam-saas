"use client";
/**
 * Beslenme FAZ 7 — Danışan beslenme sekmesi client fetch köprüsü.
 * Owner-gated + client-scoped API'lere gider (x-user-id + x-session-token).
 * tenant_id/client_id body'de GÖNDERİLMEZ (server + path). Snapshot client'tan gelmez.
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

export type ApiResult<T> = { ok: boolean; status: number; data: T | null; code?: string };

async function req<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && json.ok === true, status: res.status, data: json as T, code: json.code as string | undefined };
  } catch {
    return { ok: false, status: 0, data: null, code: "NETWORK" };
  }
}

// ── Types ──
export type ClientProfile = {
  id: string; goal_type: string | null; goal_note: string | null; activity_level: string | null;
  dietary_pattern: string | null; daily_meal_count: number | null; target_weight_kg: number | null;
  water_note: string | null; lifestyle_note: string | null; general_note: string | null; updated_at: string;
};
export type ClientContext = { id: string; display_name: string; kan: string | null; mizac: string | null };
export type Measurement = {
  id: string; measured_at: string; weight_kg: number; height_cm: number | null;
  waist_cm: number | null; hip_cm: number | null; note: string | null;
};
export type ClientAllergen = {
  id: string; allergen_id: string; note: string | null;
  nutrition_allergens: { code: string; name_tr: string | null; name_en: string | null; is_major: boolean } | null;
};
export type FoodPreference = {
  id: string; stance: "preferred" | "avoided"; food_id: string | null; food_label: string; note: string | null;
};
export type PlanFamily = {
  plan_family_id: string;
  latest: { id: string; title: string; status: string; revision_number: number; start_date: string; end_date: string; updated_at: string } | null;
  revisions: Array<{ id: string; title: string; status: string; revision_number: number; start_date: string; end_date: string; updated_at: string }>;
};

const base = (clientId: string) => `/api/beslenme/clients/${clientId}`;

// ── Profile ──
export const getProfile = (c: string) => req<{ profile: ClientProfile | null; client: ClientContext }>(`${base(c)}/profile`, { headers: authHeaders() });
export const saveProfile = (c: string, body: Partial<ClientProfile>) =>
  req<{ profile: ClientProfile }>(`${base(c)}/profile`, { method: "PUT", headers: authHeaders(true), body: JSON.stringify(body) });

// ── Measurements ──
export const listMeasurements = (c: string) => req<{ measurements: Measurement[] }>(`${base(c)}/measurements`, { headers: authHeaders() });
export const addMeasurement = (c: string, body: Record<string, unknown>) =>
  req<{ measurement: Measurement }>(`${base(c)}/measurements`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
export const deleteMeasurement = (c: string, id: string) =>
  req<Record<string, never>>(`${base(c)}/measurements/${id}`, { method: "DELETE", headers: authHeaders() });

// ── Allergens ──
export const getAllergens = (c: string) => req<{ allergens: ClientAllergen[] }>(`${base(c)}/allergens`, { headers: authHeaders() });
export const setAllergens = (c: string, allergens: Array<{ allergen_id: string; note?: string | null }>) =>
  req<{ count: number }>(`${base(c)}/allergens`, { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ allergens }) });

// ── Preferences ──
export const listPreferences = (c: string) => req<{ preferences: FoodPreference[] }>(`${base(c)}/preferences`, { headers: authHeaders() });
export const addPreference = (c: string, body: Record<string, unknown>) =>
  req<{ preference: FoodPreference }>(`${base(c)}/preferences`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
export const deletePreference = (c: string, id: string) =>
  req<Record<string, never>>(`${base(c)}/preferences/${id}`, { method: "DELETE", headers: authHeaders() });

// ── Plans ──
export const listClientPlans = (c: string) => req<{ families: PlanFamily[] }>(`${base(c)}/plans`, { headers: authHeaders() });

// ── Reference (allergen vocab for multi-select) ──
export type AllergenVocab = { id: string; code: string; name_tr: string | null; name_en: string | null; is_major: boolean };
export const getAllergenVocab = () => req<{ allergens: AllergenVocab[] }>(`/api/beslenme/reference`, { headers: authHeaders() });

// ── Assign / binding ──
export type PlanClientSummary = {
  goal_type: string | null;
  goal_note: string | null;
  allergens: Array<{ code: string; name_tr: string | null; name_en: string | null }>;
  avoided: Array<{ food_id: string | null; food_label: string }>;
  kan: string | null;
  mizac: string | null;
};
export type PlanBinding = {
  bound: boolean;
  canBind?: boolean;
  client?: { id: string; display_name: string } | null;
  context?: PlanClientSummary;
};
export const getPlanBinding = (planId: string) =>
  req<PlanBinding>(`/api/beslenme/plans/${planId}/assign-client`, { headers: authHeaders() });
export const assignPlanClient = (planId: string, clientId: string) =>
  req<{ binding: unknown; client: { id: string; display_name: string } }>(`/api/beslenme/plans/${planId}/assign-client`, {
    method: "POST", headers: authHeaders(true), body: JSON.stringify({ client_id: clientId }),
  });
