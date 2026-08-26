"use client";
/**
 * Beslenme owner-only modülü — client fetch köprüsü. Tüm çağrılar owner-gated API'lere
 * gider (x-user-id + x-session-token). Tenant client body'de GÖNDERİLMEZ (server session'dan).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { TopicType, RelationType } from "@/lib/beslenme/contracts";

function authHeaders(json = false): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export type Food = {
  id: string; tenant_id: string; name_tr: string; name_en: string | null; aliases: string[];
  food_group_id: string | null; prep_state: string | null; description: string | null;
  notes: string | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string;
};
export type Topic = {
  id: string; tenant_id: string; topic_type: TopicType; framework_id: string | null; title: string;
  summary: string | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string;
};
export type Section = {
  id: string; tenant_id: string; topic_id: string; section_key: string | null; heading: string | null;
  content: string | null; sort_order: number; created_at: string; updated_at: string;
};
export type Source = {
  id: string; tenant_id: string; title: string; authors: string | null; organization: string | null;
  source_type: string | null; publication_year: number | null; edition: string | null;
  page_range: string | null; chapter: string | null; url: string | null; reference_code: string | null;
  note: string | null; is_active: boolean; created_at: string; updated_at: string;
};
export type FoodGroupRef = { id: string; code: string; name_tr: string; name_en: string; parent_id: string | null; sort_order: number };
export type FrameworkRef = { id: string; code: string; name_tr: string; name_en: string; sort_order: number };

async function req<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; code?: string }> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && json.ok === true, status: res.status, data: json as T, code: json.code as string | undefined };
  } catch {
    return { ok: false, status: 0, data: null, code: "NETWORK" };
  }
}

/** Owner erişim probe'u — 200 ise owner. */
export async function checkBeslenmeAccess(): Promise<boolean> {
  const r = await req<{ owner?: boolean }>("/api/beslenme/access", { headers: authHeaders() });
  return r.ok && r.data?.owner === true;
}

export function fetchCounts() {
  return req<{ counts: { foods: number; guides: number; mizac: number; bloodType: number; sources: number } }>(
    "/api/beslenme/counts", { headers: authHeaders() },
  );
}
export function fetchReference() {
  return req<{ foodGroups: FoodGroupRef[]; frameworks: FrameworkRef[] }>("/api/beslenme/reference", { headers: authHeaders() });
}

// ── Foods ──
export function listFoods(params?: { q?: string; group?: string; all?: boolean }) {
  const u = new URLSearchParams();
  if (params?.q) u.set("q", params.q);
  if (params?.group) u.set("group", params.group);
  if (params?.all) u.set("all", "1");
  return req<{ foods: Food[] }>(`/api/beslenme/foods?${u.toString()}`, { headers: authHeaders() });
}
export function getFood(id: string) {
  return req<{ food: Food; sources: Array<{ id: string; source: Source | null; locator: string | null }> }>(
    `/api/beslenme/foods/${id}`, { headers: authHeaders() });
}
export function createFood(body: Partial<Food>) {
  return req<{ food: Food }>("/api/beslenme/foods", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function updateFood(id: string, body: Partial<Food>) {
  return req<{ food: Food }>(`/api/beslenme/foods/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteFood(id: string, hard = false) {
  return req<Record<string, unknown>>(`/api/beslenme/foods/${id}${hard ? "?hard=1" : ""}`, { method: "DELETE", headers: authHeaders() });
}

// ── Topics ──
export function listTopics(params?: { type?: TopicType; framework_id?: string; q?: string; all?: boolean }) {
  const u = new URLSearchParams();
  if (params?.type) u.set("type", params.type);
  if (params?.framework_id) u.set("framework_id", params.framework_id);
  if (params?.q) u.set("q", params.q);
  if (params?.all) u.set("all", "1");
  return req<{ topics: Topic[] }>(`/api/beslenme/topics?${u.toString()}`, { headers: authHeaders() });
}
export function getTopic(id: string) {
  return req<{
    topic: Topic; sections: Section[];
    foods: Array<{ id: string; food_id: string; relation_type: RelationType; rationale: string | null; food: { id: string; name_tr: string } | null }>;
    sources: Array<{ id: string; source: Source | null; locator: string | null }>;
  }>(`/api/beslenme/topics/${id}`, { headers: authHeaders() });
}
export function createTopic(body: { topic_type: TopicType; framework_id?: string | null; title: string; summary?: string | null; sort_order?: number }) {
  return req<{ topic: Topic }>("/api/beslenme/topics", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function updateTopic(id: string, body: Partial<Pick<Topic, "title" | "summary" | "sort_order" | "is_active">>) {
  return req<{ topic: Topic }>(`/api/beslenme/topics/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteTopic(id: string, hard = false) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${id}${hard ? "?hard=1" : ""}`, { method: "DELETE", headers: authHeaders() });
}

// ── Sections ──
export function addSection(topicId: string, body: { section_key?: string | null; heading?: string | null; content?: string | null; sort_order?: number }) {
  return req<{ section: Section }>(`/api/beslenme/topics/${topicId}/sections`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function updateSection(topicId: string, sectionId: string, body: Partial<Pick<Section, "section_key" | "heading" | "content" | "sort_order">>) {
  return req<{ section: Section }>(`/api/beslenme/topics/${topicId}/sections/${sectionId}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteSection(topicId: string, sectionId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/sections/${sectionId}`, { method: "DELETE", headers: authHeaders() });
}

// ── Topic ↔ Food ──
export function addTopicFood(topicId: string, body: { food_id: string; relation_type: RelationType; rationale?: string | null; sort_order?: number }) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/foods`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function updateTopicFood(topicId: string, relId: string, body: { relation_type?: RelationType; rationale?: string | null; sort_order?: number }) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/foods/${relId}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function removeTopicFood(topicId: string, relId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/foods/${relId}`, { method: "DELETE", headers: authHeaders() });
}

// ── Sources ──
export function listSources(q?: string) {
  const u = new URLSearchParams();
  if (q) u.set("q", q);
  return req<{ sources: Source[] }>(`/api/beslenme/sources?${u.toString()}`, { headers: authHeaders() });
}
export function createSource(body: Partial<Source>) {
  return req<{ source: Source }>("/api/beslenme/sources", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function updateSource(id: string, body: Partial<Source>) {
  return req<{ source: Source }>(`/api/beslenme/sources/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function deleteSource(id: string) {
  return req<Record<string, unknown>>(`/api/beslenme/sources/${id}`, { method: "DELETE", headers: authHeaders() });
}
export function linkTopicSource(topicId: string, body: { source_id: string; locator?: string | null; note?: string | null }) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/sources`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function unlinkTopicSource(topicId: string, linkId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/sources/${linkId}`, { method: "DELETE", headers: authHeaders() });
}
export function linkFoodSource(foodId: string, body: { source_id: string; locator?: string | null; note?: string | null }) {
  return req<Record<string, unknown>>(`/api/beslenme/foods/${foodId}/sources`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function unlinkFoodSource(foodId: string, linkId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/foods/${foodId}/sources/${linkId}`, { method: "DELETE", headers: authHeaders() });
}
