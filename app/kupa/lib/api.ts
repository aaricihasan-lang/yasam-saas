"use client";

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Uzman API çağrıları için kimlik başlıkları (dashboard deseniyle aynı). */
export function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

export type CuppingPoint = {
  id: string;
  name: string;
  alt_name?: string | null;
  code?: string | null;
  anatomical_region?: string | null;
  description?: string | null;
  traditional_use?: string | null;
  application_info?: string | null;
  related_points?: string[] | null;
  safety_note?: string | null;
  source_note?: string | null;
  professional_note?: string | null;
  synonyms?: string[] | null;
  laterality?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type CuppingPlacement = {
  id: string;
  point_id: string;
  map_key: string;
  shape: "oval" | "rect";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  color?: string | null;
  placement_no?: number;
};

export type CuppingTopic = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  notes?: string | null;
  source_note?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type CuppingPointTopic = {
  id: string;
  point_id: string;
  topic_id: string;
  note?: string | null;
  source_note?: string | null;
  relation_strength?: string | null;
};

export type CuppingTechnique = {
  id: string;
  name: string;
  kind?: string | null;
  technique_type?: string | null;
  movement_style?: string | null;
  description?: string | null;
  application_info?: string | null;
  safety_note?: string | null;
  source_note?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type CuppingKnowledge = {
  id: string;
  title: string;
  content?: string | null;
  category?: string | null;
  tags?: string[] | null;
  source?: string | null;
  source_section?: string | null;
  keyword?: string | null;
  notes?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type CuppingSource = {
  id: string;
  source_name: string;
  source_type?: string | null;
  author_or_organization?: string | null;
  title?: string | null;
  page_or_section?: string | null;
  source_url?: string | null;
  accessed_on?: string | null;
  note?: string | null;
  year?: number | null;
  identifier?: string | null;
  publication?: string | null;
  language?: string | null;
  sort_order?: number;
};

export type CuppingSafetyNote = {
  id: string;
  title: string;
  content?: string | null;
  severity: "info" | "warning" | "contraindication";
  contraindication_class?: string | null;
  scope_tags?: string[] | null;
  source_note?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

/** Tipli citation junction kaydı (6 entity için ortak şekil). */
export type CuppingCitation = {
  id: string;
  source_id: string;
  locator?: string | null;
  evidence_class?: string | null;
  note?: string | null;
  sort_order?: number;
} & Record<string, unknown>;

/** UI'da citation eklenebilen entity anahtarları (route segmentleriyle birebir). */
export type CuppingCitationEntity =
  | "point"
  | "topic"
  | "point-topic"
  | "technique"
  | "knowledge"
  | "safety";

type ApiOk = { ok: true; [k: string]: unknown };

async function call<T>(url: string, init: RequestInit, key: string): Promise<T> {
  const res = await fetch(url, { ...init, headers: userHeaders() });
  const json = (await res.json().catch(() => ({}))) as ApiOk & { error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "İşlem başarısız.");
  }
  return json[key] as T;
}

const BASE = "/api/kupa";

// Points
export const listPoints = () => call<CuppingPoint[]>(`${BASE}/points`, { method: "GET" }, "points");
export const createPoint = (body: Partial<CuppingPoint>) =>
  call<CuppingPoint>(`${BASE}/points`, { method: "POST", body: JSON.stringify(body) }, "point");
export const updatePoint = (id: string, body: Partial<CuppingPoint>) =>
  call<CuppingPoint>(`${BASE}/points/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "point");
export const deletePoint = (id: string) =>
  call<number>(`${BASE}/points/${id}`, { method: "DELETE" }, "deleted");

// Placements
export const listPlacements = (params?: { mapKey?: string; pointId?: string }) => {
  const q = new URLSearchParams();
  if (params?.mapKey) q.set("mapKey", params.mapKey);
  if (params?.pointId) q.set("pointId", params.pointId);
  const qs = q.toString();
  return call<CuppingPlacement[]>(`${BASE}/placements${qs ? `?${qs}` : ""}`, { method: "GET" }, "placements");
};
export const createPlacement = (body: Partial<CuppingPlacement>) =>
  call<CuppingPlacement>(`${BASE}/placements`, { method: "POST", body: JSON.stringify(body) }, "placement");
export const updatePlacement = (id: string, body: Partial<CuppingPlacement>) =>
  call<CuppingPlacement>(`${BASE}/placements/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "placement");
export const deletePlacement = (id: string) =>
  call<number>(`${BASE}/placements/${id}`, { method: "DELETE" }, "deleted");

// Topics
export const listTopics = () => call<CuppingTopic[]>(`${BASE}/topics`, { method: "GET" }, "topics");
export const createTopic = (body: Partial<CuppingTopic>) =>
  call<CuppingTopic>(`${BASE}/topics`, { method: "POST", body: JSON.stringify(body) }, "topic");
export const updateTopic = (id: string, body: Partial<CuppingTopic>) =>
  call<CuppingTopic>(`${BASE}/topics/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "topic");
export const deleteTopic = (id: string) =>
  call<number>(`${BASE}/topics/${id}`, { method: "DELETE" }, "deleted");

// Point-topics (M:N)
export const listPointTopics = (params?: { topicId?: string; pointId?: string }) => {
  const q = new URLSearchParams();
  if (params?.topicId) q.set("topicId", params.topicId);
  if (params?.pointId) q.set("pointId", params.pointId);
  const qs = q.toString();
  return call<CuppingPointTopic[]>(`${BASE}/point-topics${qs ? `?${qs}` : ""}`, { method: "GET" }, "relations");
};
export const createPointTopic = (body: Partial<CuppingPointTopic>) =>
  call<CuppingPointTopic>(`${BASE}/point-topics`, { method: "POST", body: JSON.stringify(body) }, "relation");
/** İlişki meta güncelle (relation_strength / note / source_note). FK'ler PATCH'te değişmez. */
export const updatePointTopic = (id: string, body: Partial<CuppingPointTopic>) =>
  call<CuppingPointTopic>(`${BASE}/point-topics/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "relation");
export const deletePointTopic = (id: string) =>
  call<number>(`${BASE}/point-topics/${id}`, { method: "DELETE" }, "deleted");

// Techniques
export const listTechniques = () =>
  call<CuppingTechnique[]>(`${BASE}/techniques`, { method: "GET" }, "techniques");
export const createTechnique = (body: Partial<CuppingTechnique>) =>
  call<CuppingTechnique>(`${BASE}/techniques`, { method: "POST", body: JSON.stringify(body) }, "technique");
export const updateTechnique = (id: string, body: Partial<CuppingTechnique>) =>
  call<CuppingTechnique>(`${BASE}/techniques/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "technique");
export const deleteTechnique = (id: string) =>
  call<number>(`${BASE}/techniques/${id}`, { method: "DELETE" }, "deleted");

// Knowledge
export const listKnowledge = () =>
  call<CuppingKnowledge[]>(`${BASE}/knowledge`, { method: "GET" }, "records");
export const createKnowledge = (body: Partial<CuppingKnowledge>) =>
  call<CuppingKnowledge>(`${BASE}/knowledge`, { method: "POST", body: JSON.stringify(body) }, "record");
export const updateKnowledge = (id: string, body: Partial<CuppingKnowledge>) =>
  call<CuppingKnowledge>(`${BASE}/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "record");
export const deleteKnowledge = (id: string) =>
  call<number>(`${BASE}/knowledge/${id}`, { method: "DELETE" }, "deleted");

// Sources
export const listSources = () => call<CuppingSource[]>(`${BASE}/sources`, { method: "GET" }, "sources");
export const createSource = (body: Partial<CuppingSource>) =>
  call<CuppingSource>(`${BASE}/sources`, { method: "POST", body: JSON.stringify(body) }, "source");
export const updateSource = (id: string, body: Partial<CuppingSource>) =>
  call<CuppingSource>(`${BASE}/sources/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "source");
export const deleteSource = (id: string) =>
  call<number>(`${BASE}/sources/${id}`, { method: "DELETE" }, "deleted");

// Safety
export const listSafety = () => call<CuppingSafetyNote[]>(`${BASE}/safety`, { method: "GET" }, "notes");
export const createSafety = (body: Partial<CuppingSafetyNote>) =>
  call<CuppingSafetyNote>(`${BASE}/safety`, { method: "POST", body: JSON.stringify(body) }, "note");
export const updateSafety = (id: string, body: Partial<CuppingSafetyNote>) =>
  call<CuppingSafetyNote>(`${BASE}/safety/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "note");
export const deleteSafety = (id: string) =>
  call<number>(`${BASE}/safety/${id}`, { method: "DELETE" }, "deleted");

// ─── Citations (tipli junction; tek generic client adaptörü) ─────────────────
export const listCitations = (entity: CuppingCitationEntity, entityId: string) =>
  call<CuppingCitation[]>(
    `${BASE}/citations/${entity}?entityId=${encodeURIComponent(entityId)}`,
    { method: "GET" },
    "citations",
  );
export const createCitation = (entity: CuppingCitationEntity, body: Record<string, unknown>) =>
  call<CuppingCitation>(
    `${BASE}/citations/${entity}`,
    { method: "POST", body: JSON.stringify(body) },
    "citation",
  );
export const updateCitation = (
  entity: CuppingCitationEntity,
  id: string,
  body: Record<string, unknown>,
) =>
  call<CuppingCitation>(
    `${BASE}/citations/${entity}/${id}`,
    { method: "PATCH", body: JSON.stringify(body) },
    "citation",
  );
export const deleteCitation = (entity: CuppingCitationEntity, id: string) =>
  call<number>(`${BASE}/citations/${entity}/${id}`, { method: "DELETE" }, "deleted");
