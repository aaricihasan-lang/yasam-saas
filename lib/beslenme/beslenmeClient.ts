"use client";
/**
 * Beslenme (normal grantable modül: admin VEYA module_permissions.beslenme=true) — client fetch
 * köprüsü. Tüm çağrılar server-gated API'lere gider (x-user-id + x-session-token). Tenant client
 * body'de GÖNDERİLMEZ (server session'dan). Food READ: clients|beslenme; food WRITE: tam Beslenme.
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
  is_system?: boolean;
  /** Sistem besininden türemiş kişisel kopya (yalnız "Sistem değerine dön" için; UI'da teknik etiket YOK). */
  origin_food_id?: string | null;
  is_personalized?: boolean;
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

/** Beslenme MODÜL erişim probe'u (server-authoritative) — 200 ise erişim var (admin veya beslenme izinli uzman). */
export async function checkBeslenmeAccess(): Promise<boolean> {
  const r = await req<{ access?: boolean }>("/api/beslenme/access", { headers: authHeaders() });
  return r.ok && r.data?.access === true;
}

/**
 * Beslenme YETENEK probe'u (server-authoritative). Aynı /access ucundan modül erişimi +
 * `clients` (Danışan Yolculuğu) yeteneğini döner. /beslenme hub "Danışan Planları" kartını
 * yalnız clients yeteneği olanlara gösterir (dead-control önle). Yetkisiz → {access:false}.
 */
export async function fetchBeslenmeCapabilities(): Promise<{ access: boolean; clients: boolean }> {
  const r = await req<{ access?: boolean; clients?: boolean }>("/api/beslenme/access", { headers: authHeaders() });
  const access = r.ok && r.data?.access === true;
  return { access, clients: access && r.data?.clients === true };
}

// NOT: checkBeslenmeFoodAccess (ayrı manuel-besin KATKI probe'u) KALDIRILDI. CUSTOM besin
// yönetimi artık tam Beslenme modülünün parçası (/beslenme/besinler); erişim checkBeslenmeAccess
// ile belirlenir. Eski /api/beslenme/foods/access ucu ve beslenme_manual_food yeteneği yok.

export function fetchCounts() {
  return req<{ counts: { foods: number; guides: number; mizac: number; bloodType: number; sources: number } }>(
    "/api/beslenme/counts", { headers: authHeaders() },
  );
}
export function fetchReference() {
  return req<{ foodGroups: FoodGroupRef[]; frameworks: FrameworkRef[] }>("/api/beslenme/reference", { headers: authHeaders() });
}

// ── Foods ──
// Sayfalama: limit/offset opsiyoneldir (geriye uyumlu). API `total`'ı da döndürür → "daha fazla yükle".
export function listFoods(params?: { q?: string; group?: string; all?: boolean; limit?: number; offset?: number }) {
  const u = new URLSearchParams();
  if (params?.q) u.set("q", params.q);
  if (params?.group) u.set("group", params.group);
  if (params?.all) u.set("all", "1");
  if (params?.limit != null) u.set("limit", String(params.limit));
  if (params?.offset != null) u.set("offset", String(params.offset));
  return req<{ foods: Food[]; total: number; limit: number; offset: number }>(
    `/api/beslenme/foods?${u.toString()}`,
    { headers: authHeaders() },
  );
}
export function getFood(id: string) {
  return req<{
    food: Food;
    nutrients: FoodNutrientView[];
    portions: FoodPortionView[];
    traditional: FoodTraditional | null;
    sources: Array<{ id: string; source: Source | null; locator: string | null }>;
    externalRefs: FoodExternalRef[];
  }>(`/api/beslenme/foods/${id}`, { headers: authHeaders() });
}
export function createFood(body: Partial<Food>) {
  return req<{ food: Food }>("/api/beslenme/foods", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
// Manuel "Hızlı Besin Ekle": food + (opsiyonel) nutrient(100g) + (opsiyonel) porsiyon tek çağrıda.
export type QuickAddPayload = {
  name_tr: string;
  name_en?: string | null;
  food_group_id?: string | null;
  prep_state?: string | null;
  description?: string | null;
  nutrients?: Array<{ nutrient_code: string; amount: number; unit_code: string }>;
  portion?: { label_tr: string; gram_weight: number; measure_unit_code?: string; quantity?: number } | null;
};
export function quickCreateFood(body: QuickAddPayload) {
  return req<{ food: Food; nutrientCount: number; portionCreated: boolean }>(
    "/api/beslenme/foods/quick",
    { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) },
  );
}
/** Kaydet: sistem besininde ilk kayıt uzmanın kişisel kopyasını oluşturur → food_id (effective) döner. */
export function updateFood(id: string, body: Partial<Food>) {
  return req<{ food: Food; food_id: string; personalized: boolean }>(`/api/beslenme/foods/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
/**
 * "Sil" — çalışma alanından kaldır: uzmanın kendi besini kalıcı silinir; sistem besini yalnız bu
 * uzmanda görünmez olur. Rehberde kullanılıyorsa 409 IN_USE + topics (rehber başlıkları).
 */
export function deleteFood(id: string) {
  return req<{ action?: string; topics?: string[] }>(`/api/beslenme/foods/${id}`, { method: "DELETE", headers: authHeaders() });
}

// ── "Sistem değerine dön" (3 aşama + sunucu doğrulamalı 4 haneli kod) ──
export type FoodResetScope = "one" | "all";
export function getPersonalizedFoodCount() {
  return req<{ count: number }>("/api/beslenme/foods/reset", { headers: authHeaders() });
}
export function requestFoodResetChallenge(scope: FoodResetScope, foodId?: string) {
  return req<{
    challenge_id: string; code: string; expires_at: string; count: number; names: string[]; more: number;
    blocked: Array<{ name: string; topics: string[] }>;
  }>("/api/beslenme/foods/reset/challenge", {
    method: "POST", headers: authHeaders(true), body: JSON.stringify(scope === "one" ? { scope, food_id: foodId } : { scope }),
  });
}
export function confirmFoodReset(scope: FoodResetScope, foodId: string | undefined, challengeId: string, code: string) {
  return req<{ reset: number }>("/api/beslenme/foods/reset", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(scope === "one" ? { scope, food_id: foodId, challenge_id: challengeId, code } : { scope, challenge_id: challengeId, code }),
  });
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
export function updateTopic(id: string, body: Partial<Pick<Topic, "title" | "summary" | "sort_order">>) {
  return req<{ topic: Topic }>(`/api/beslenme/topics/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
/** "Sil": rehber + bölümleri + besin/kaynak bağları kalıcı silinir (besinler ve kaynak kataloğu kalır). */
export function deleteTopic(id: string) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${id}`, { method: "DELETE", headers: authHeaders() });
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
export function updateSource(id: string, body: Partial<Omit<Source, "is_active">>) {
  return req<{ source: Source }>(`/api/beslenme/sources/${id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) });
}
/** "Sil": kaynak kalıcı silinir; bir kayda bağlıysa 409 IN_USE + usage sayıları. */
export function deleteSource(id: string) {
  return req<{ usage?: { topics: number; foods: number; foodValues: number } }>(`/api/beslenme/sources/${id}`, { method: "DELETE", headers: authHeaders() });
}
/** Yeni kaynak + bağ TEK istekte (bağ başarısızsa kaynak sunucuda geri silinir → orphan yok). */
export type NewSourceInput = Partial<Omit<Source, "id" | "tenant_id" | "is_active" | "created_at" | "updated_at">> & { title: string };
export type SourceLinkBody =
  | { source_id: string; locator?: string | null; note?: string | null }
  | { new_source: NewSourceInput; locator?: string | null; note?: string | null };
export function linkTopicSource(topicId: string, body: SourceLinkBody) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/sources`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function unlinkTopicSource(topicId: string, linkId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/topics/${topicId}/sources/${linkId}`, { method: "DELETE", headers: authHeaders() });
}
export function linkFoodSource(foodId: string, body: SourceLinkBody) {
  return req<{ food_id?: string; personalized?: boolean }>(`/api/beslenme/foods/${foodId}/sources`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
}
export function unlinkFoodSource(foodId: string, linkId: string) {
  return req<Record<string, unknown>>(`/api/beslenme/foods/${foodId}/sources/${linkId}`, { method: "DELETE", headers: authHeaders() });
}

// ── FAZ 4 — Besin Motoru (nutrients / portions / traditional) ──
export type FoodNutrientView = {
  id: string; nutrient_id: string; amount: number; unit_id: string; basis_grams: number;
  nutrient: { code: string; name_tr: string; name_en: string; category: string; sort_order: number } | null;
  unit: { code: string; symbol: string } | null;
};
export type FoodPortionView = {
  id: string; label_tr: string; label_en: string | null; quantity: number; measure_unit_id: string;
  gram_weight: number; is_default: boolean; sort_order: number;
  unit: { code: string; symbol: string; name_tr: string } | null;
};
export type FoodTraditional = {
  id: string; tenant_id: string; food_id: string; framework_id: string | null;
  thermal_quality: string | null; moisture_quality: string | null; notes: string | null;
  source_id: string | null; created_at: string; updated_at: string;
};
export type FoodExternalRef = {
  id: string; provider: string; external_id: string; external_dataset: string | null;
  external_version: string | null; source_url: string | null; retrieved_at: string | null;
};

/** /100 g nutrient setini tümüyle değiştir (atomik; sistem besininde kişisel kopya → food_id döner). */
export function putFoodNutrients(
  foodId: string,
  items: Array<{ nutrient_code: string; amount: number; unit_code: string; source_id?: string | null }>,
) {
  return req<{ count: number; food_id: string; personalized: boolean }>(`/api/beslenme/foods/${foodId}/nutrients`, {
    method: "PUT", headers: authHeaders(true), body: JSON.stringify({ items }),
  });
}
/** Porsiyon setini tümüyle değiştir (atomik; id → mevcut porsiyon korunur, quantity korunur). */
export function putFoodPortions(
  foodId: string,
  items: Array<{ id?: string; label_tr: string; label_en?: string | null; quantity?: number; measure_unit_code: string; gram_weight: number; is_default?: boolean; sort_order?: number }>,
) {
  return req<{ count: number; food_id: string; personalized: boolean }>(`/api/beslenme/foods/${foodId}/portions`, {
    method: "PUT", headers: authHeaders(true), body: JSON.stringify({ items }),
  });
}
/** Geleneksel niteliği upsert et (atomik; source_id gönderilmezse korunur). Boş gövde = sil. */
export function putFoodTraditional(
  foodId: string,
  body: { framework_id?: string | null; thermal_quality?: string | null; moisture_quality?: string | null; notes?: string | null; source_id?: string | null },
) {
  return req<{ traditional: FoodTraditional | null; food_id: string; personalized: boolean }>(`/api/beslenme/foods/${foodId}/traditional`, {
    method: "PUT", headers: authHeaders(true), body: JSON.stringify(body),
  });
}
