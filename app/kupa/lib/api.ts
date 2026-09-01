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

/** Kullanıcı/uzman notu (formal kaynak/atıf DEĞİL; tenant-local not katmanı). */
export type CuppingTopicNote = {
  id: string;
  topic_id: string;
  note: string;
  source_label?: string | null;
  sort_order?: number;
  is_active?: boolean;
  point_ids?: string[];
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
  /** FAZ 4 — "Uzman Notum" (kişisel not; source_note/safety_note'tan AYRI). */
  practitioner_note?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

/** FAZ 4 — "Kullanıldığı Protokoller" read-only sade metadata. */
export type CuppingTechniqueProtocolRef = {
  id: string;
  title: string;
  category?: string | null;
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
export const getTechnique = (id: string) =>
  call<CuppingTechnique>(`${BASE}/techniques/${id}`, { method: "GET" }, "technique");
export const createTechnique = (body: Partial<CuppingTechnique>) =>
  call<CuppingTechnique>(`${BASE}/techniques`, { method: "POST", body: JSON.stringify(body) }, "technique");
export const updateTechnique = (id: string, body: Partial<CuppingTechnique>) =>
  call<CuppingTechnique>(`${BASE}/techniques/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "technique");
export const deleteTechnique = (id: string) =>
  call<number>(`${BASE}/techniques/${id}`, { method: "DELETE" }, "deleted");

// Technique "Kullanıldığı Protokoller" (read-only, FAZ 4)
export const listTechniqueProtocols = (techniqueId: string) =>
  call<CuppingTechniqueProtocolRef[]>(`${BASE}/techniques/${techniqueId}/protocols`, { method: "GET" }, "protocols");

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

// Topic notes (kullanıcı/uzman notu — formal citation'dan ayrı)
export const listTopicNotes = (topicId: string) =>
  call<CuppingTopicNote[]>(
    `${BASE}/topic-notes?topicId=${encodeURIComponent(topicId)}`,
    { method: "GET" },
    "notes",
  );
export const createTopicNote = (body: {
  topic_id: string;
  note: string;
  source_label?: string | null;
  point_ids?: string[];
}) => call<CuppingTopicNote>(`${BASE}/topic-notes`, { method: "POST", body: JSON.stringify(body) }, "note");
export const updateTopicNote = (
  id: string,
  body: Partial<{ note: string; source_label: string | null; point_ids: string[]; sort_order: number; is_active: boolean }>,
) => call<CuppingTopicNote>(`${BASE}/topic-notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "note");
export const deleteTopicNote = (id: string) =>
  call<number>(`${BASE}/topic-notes/${id}`, { method: "DELETE" }, "deleted");

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

// ═══════════════════════════════════════════════════════════════════════════
// V2 CLEAN CORE — Hacamat Protokolleri (yalnız ADDITIVE; legacy wrapper'lar üstte
// AYNEN korunur). Response key'leri /api/kupa/protocol* route'larıyla birebir.
// ═══════════════════════════════════════════════════════════════════════════

export type CuppingProtocol = {
  id: string;
  title: string;
  category?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  preparation_note?: string | null;
  aftercare_note?: string | null;
  follow_up_note?: string | null;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CuppingProtocolPoint = {
  id: string;
  protocol_id: string;
  point_id: string;
  protocol_note?: string | null;
  sort_order?: number;
};

export type CuppingProtocolTechnique = {
  id: string;
  protocol_id: string;
  technique_id: string;
  protocol_note?: string | null;
  sort_order?: number;
};

export type CuppingProtocolSafety = {
  id: string;
  protocol_id: string;
  safety_id: string;
  protocol_note?: string | null;
  sort_order?: number;
};

export type CuppingProtocolStep = {
  id: string;
  protocol_id: string;
  title?: string | null;
  body: string;
  stage_label?: string | null;
  ref_point_id?: string | null;
  ref_technique_id?: string | null;
  sort_order?: number;
};

/** UNIFIED "Bilgiler" — kaynaklı/kaynaksız TEK sınıf. */
export type CuppingProtocolEntry = {
  id: string;
  protocol_id: string;
  title?: string | null;
  content: string;
  source_id?: string | null;
  source_label?: string | null;
  locator?: string | null;
  sort_order?: number;
  is_active?: boolean;
  point_ids?: string[];
};

export type CuppingProtocolSourceLink = {
  id: string;
  protocol_id: string;
  source_id: string;
  locator?: string | null;
  note?: string | null;
  sort_order?: number;
};

// Protocols
export const listProtocols = () =>
  call<CuppingProtocol[]>(`${BASE}/protocols`, { method: "GET" }, "protocols");
export const createProtocol = (body: Partial<CuppingProtocol>) =>
  call<CuppingProtocol>(`${BASE}/protocols`, { method: "POST", body: JSON.stringify(body) }, "protocol");
export const getProtocol = (id: string) =>
  call<CuppingProtocol>(`${BASE}/protocols/${id}`, { method: "GET" }, "protocol");
export const updateProtocol = (id: string, body: Partial<CuppingProtocol>) =>
  call<CuppingProtocol>(`${BASE}/protocols/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "protocol");
export const deleteProtocol = (id: string) =>
  call<number>(`${BASE}/protocols/${id}`, { method: "DELETE" }, "deleted");

// Protocol points
export const listProtocolPoints = (protocolId: string) =>
  call<CuppingProtocolPoint[]>(`${BASE}/protocol-points?protocolId=${encodeURIComponent(protocolId)}`, { method: "GET" }, "relations");
export const addProtocolPoint = (body: { protocol_id: string; point_id: string; protocol_note?: string | null; sort_order?: number }) =>
  call<CuppingProtocolPoint>(`${BASE}/protocol-points`, { method: "POST", body: JSON.stringify(body) }, "relation");
export const updateProtocolPoint = (id: string, body: Partial<Pick<CuppingProtocolPoint, "protocol_note" | "sort_order">>) =>
  call<CuppingProtocolPoint>(`${BASE}/protocol-points/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "relation");
export const deleteProtocolPoint = (id: string) =>
  call<number>(`${BASE}/protocol-points/${id}`, { method: "DELETE" }, "deleted");

// Protocol techniques
export const listProtocolTechniques = (protocolId: string) =>
  call<CuppingProtocolTechnique[]>(`${BASE}/protocol-techniques?protocolId=${encodeURIComponent(protocolId)}`, { method: "GET" }, "relations");
export const addProtocolTechnique = (body: { protocol_id: string; technique_id: string; protocol_note?: string | null; sort_order?: number }) =>
  call<CuppingProtocolTechnique>(`${BASE}/protocol-techniques`, { method: "POST", body: JSON.stringify(body) }, "relation");
export const updateProtocolTechnique = (id: string, body: Partial<Pick<CuppingProtocolTechnique, "protocol_note" | "sort_order">>) =>
  call<CuppingProtocolTechnique>(`${BASE}/protocol-techniques/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "relation");
export const deleteProtocolTechnique = (id: string) =>
  call<number>(`${BASE}/protocol-techniques/${id}`, { method: "DELETE" }, "deleted");

// Protocol safety
export const listProtocolSafety = (protocolId: string) =>
  call<CuppingProtocolSafety[]>(`${BASE}/protocol-safety?protocolId=${encodeURIComponent(protocolId)}`, { method: "GET" }, "relations");
export const addProtocolSafety = (body: { protocol_id: string; safety_id: string; protocol_note?: string | null; sort_order?: number }) =>
  call<CuppingProtocolSafety>(`${BASE}/protocol-safety`, { method: "POST", body: JSON.stringify(body) }, "relation");
export const updateProtocolSafety = (id: string, body: Partial<Pick<CuppingProtocolSafety, "protocol_note" | "sort_order">>) =>
  call<CuppingProtocolSafety>(`${BASE}/protocol-safety/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "relation");
export const deleteProtocolSafety = (id: string) =>
  call<number>(`${BASE}/protocol-safety/${id}`, { method: "DELETE" }, "deleted");

// Protocol steps
export const listProtocolSteps = (protocolId: string) =>
  call<CuppingProtocolStep[]>(`${BASE}/protocol-steps?protocolId=${encodeURIComponent(protocolId)}`, { method: "GET" }, "steps");
export const addProtocolStep = (body: { protocol_id: string; title?: string | null; body: string; stage_label?: string | null; ref_point_id?: string | null; ref_technique_id?: string | null; sort_order?: number }) =>
  call<CuppingProtocolStep>(`${BASE}/protocol-steps`, { method: "POST", body: JSON.stringify(body) }, "step");
export const updateProtocolStep = (id: string, body: Partial<Omit<CuppingProtocolStep, "id" | "protocol_id">>) =>
  call<CuppingProtocolStep>(`${BASE}/protocol-steps/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "step");
export const deleteProtocolStep = (id: string) =>
  call<number>(`${BASE}/protocol-steps/${id}`, { method: "DELETE" }, "deleted");

// Protocol entries (UNIFIED "Bilgiler"; create/update atomik RPC route'una gider)
export const listProtocolEntries = (protocolId: string) =>
  call<CuppingProtocolEntry[]>(`${BASE}/protocol-entries?protocolId=${encodeURIComponent(protocolId)}`, { method: "GET" }, "entries");
export const createProtocolEntry = (body: {
  protocol_id: string;
  title?: string | null;
  content: string;
  source_id?: string | null;
  source_label?: string | null;
  locator?: string | null;
  point_ids?: string[];
}) => call<CuppingProtocolEntry>(`${BASE}/protocol-entries`, { method: "POST", body: JSON.stringify(body) }, "entry");
export const updateProtocolEntry = (
  id: string,
  body: Partial<{ title: string | null; content: string; source_id: string | null; source_label: string | null; locator: string | null; sort_order: number; is_active: boolean; point_ids: string[] }>,
) => call<CuppingProtocolEntry>(`${BASE}/protocol-entries/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "entry");
export const deleteProtocolEntry = (id: string) =>
  call<number>(`${BASE}/protocol-entries/${id}`, { method: "DELETE" }, "deleted");

// Protocol sources (protokol-seviye künye)
export const listProtocolSources = (protocolId: string) =>
  call<CuppingProtocolSourceLink[]>(`${BASE}/protocol-sources?protocolId=${encodeURIComponent(protocolId)}`, { method: "GET" }, "sources");
export const addProtocolSource = (body: { protocol_id: string; source_id: string; locator?: string | null; note?: string | null; sort_order?: number }) =>
  call<CuppingProtocolSourceLink>(`${BASE}/protocol-sources`, { method: "POST", body: JSON.stringify(body) }, "source");
export const updateProtocolSource = (id: string, body: Partial<Pick<CuppingProtocolSourceLink, "locator" | "note" | "sort_order">>) =>
  call<CuppingProtocolSourceLink>(`${BASE}/protocol-sources/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "source");
export const deleteProtocolSource = (id: string) =>
  call<number>(`${BASE}/protocol-sources/${id}`, { method: "DELETE" }, "deleted");
