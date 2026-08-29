"use client";
/**
 * Beslenme FAZ 6 — client fetch köprüsü (templates / analytics / alternatives / recents / Word).
 * Tüm çağrılar owner-gated API'lere gider (x-user-id + x-session-token). Tenant/snapshot
 * body'de GÖNDERİLMEZ (server üretir/doğrular).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { TemplateType } from "./templateContracts";

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

// ── Templates ──
export type TemplateListRow = {
  id: string; template_type: TemplateType; title: string; note: string | null; is_active: boolean; updated_at: string;
};
export function listTemplates(type?: TemplateType) {
  const u = new URLSearchParams();
  if (type) u.set("type", type);
  return req<{ templates: TemplateListRow[] }>(`/api/beslenme/templates?${u.toString()}`, { headers: authHeaders() });
}
export function getTemplateDetail(id: string) {
  return req<{ template: TemplateListRow; meals: unknown[] }>(`/api/beslenme/templates/${id}`, { headers: authHeaders() });
}
export function createTemplate(body: { from: "meal" | "day"; source_id: string; title: string; note?: string | null }) {
  return req<{ template: TemplateListRow }>(`/api/beslenme/templates`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function renameTemplate(id: string, body: { title?: string; note?: string | null; is_active?: boolean }) {
  return req<{ template: TemplateListRow }>(`/api/beslenme/templates/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteTemplate(id: string) {
  return req<Record<string, unknown>>(`/api/beslenme/templates/${id}`, { method: "DELETE", headers: authHeaders() });
}
export function duplicateTemplate(id: string, title?: string) {
  return req<{ template: TemplateListRow }>(`/api/beslenme/templates/${id}/duplicate`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ title }) });
}
/** mode 'meal' → hedef güne EKLER; 'day' → hedef BOŞ olmalı (409 TARGET_NOT_EMPTY). */
export function applyTemplate(id: string, body: { mode: "meal" | "day"; target_plan_id: string; target_day_id: string }) {
  return req<Record<string, unknown>>(`/api/beslenme/templates/${id}/apply`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}

// ── Analytics ──
export function getPlanAnalytics(planId: string) {
  return req<{ analytics: unknown }>(`/api/beslenme/plans/${planId}/analytics`, { headers: authHeaders() });
}

// ── Alternatives ──
export type AlternativeRow = { food_id: string; name_tr: string; ownership: string; energyPer100: number; distance: number; grams: number };
export function getItemAlternatives(planId: string, itemId: string, opts?: { sameGroupOnly?: boolean; all?: boolean }) {
  const u = new URLSearchParams();
  if (opts?.sameGroupOnly) u.set("sameGroupOnly", "1");
  if (opts?.all) u.set("all", "1");
  return req<{ target: { name: string; grams: number; energyTotal: number }; band: string; alternatives: AlternativeRow[] }>(
    `/api/beslenme/plans/${planId}/items/${itemId}/alternatives?${u.toString()}`,
    { headers: authHeaders() },
  );
}

// ── Recent foods ──
export type RecentFood = { food_id: string; name: string; ownership: string; available: boolean };
export function getRecentFoods() {
  return req<{ recent: RecentFood[] }>(`/api/beslenme/foods/recent`, { headers: authHeaders() });
}

// ── Word export (POST → docx blob download) ──
export async function downloadPlanWord(planId: string): Promise<{ ok: boolean; code?: string; status: number }> {
  try {
    const res = await fetch(`/api/beslenme/plans/${planId}/word`, { method: "POST", cache: "no-store", headers: authHeaders() });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, code: (j.code as string) ?? "EXPORT_FAILED", status: res.status };
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m = /filename="([^"]+)"/.exec(cd);
    const filename = m?.[1] ?? "Beslenme-Plani.docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, code: "NETWORK", status: 0 };
  }
}
