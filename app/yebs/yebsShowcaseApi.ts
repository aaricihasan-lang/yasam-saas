"use client";

// ============================================================
// YEBS — Admin-only READ-ONLY uzman vitrini: client GET API'si.
//
// Mevcut admin auth modelini kullanır: x-admin-id + x-session-token başlıkları.
// service_role ASLA istemciye çıkmaz; guard sunucuda (verifyAdminRequest) çalışır.
// Yalnız SALT-OKUNUR, entity-specific, whitelist GET fonksiyonları vardır —
// keyfi endpoint/dispatcher YOK, mutation (POST/PATCH/PUT/DELETE) YOK.
// ============================================================

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

const BASE = "/api/yebs";

function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": readYasamUser()?.id ?? "" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  return h;
}

export type ShowcaseView = "published" | "preview";

// ---- DTO tipleri (server DTO'larının client aynası; server-only import edilmez) ----
export type PreviewMeta = { preview: boolean; statusLabel: string };

export type TraditionDTO = {
  id: string;
  nameTr: string;
  nativeName: string | null;
  nativeLanguageTag: string | null;
  nativeScriptCode: string | null;
  traditionTypeLabel: string;
} & PreviewMeta;

export type ConceptDTO = {
  id: string;
  title: string;
  slug: string;
  conceptTypeLabel: string;
  traditionId: string;
  schoolId: string | null;
} & PreviewMeta;

export type ConceptLabelDTO = {
  id: string;
  label: string;
  languageTag: string;
  scriptCode: string;
  labelKind: string;
  labelKindLabel: string;
  transliterationScheme: string | null;
  isPrimary: boolean;
};

export type ClaimDTO = {
  id: string;
  claimText: string;
  claimTypeLabel: string;
  evidenceLayerLabel: string;
  provenanceLabel: string;
  conceptId: string;
  safetyTopic: string | null;
} & PreviewMeta;

export type SourceDTO = {
  id: string;
  title: string;
  sourceTypeLabel: string;
  authors: string | null;
  organization: string | null;
  publisher: string | null;
  publicationYear: number | null;
  edition: string | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  languageTag: string;
  datingNote: string | null;
  documentNo: string | null;
  accessedOn: string | null;
  notes: string | null;
} & PreviewMeta;

export type RelationDTO = {
  id: string;
  relationType: string;
  relationTypeLabel: string;
  sourceConceptId: string;
  targetConceptId: string;
  sourceConceptTitle: string;
  targetConceptTitle: string;
} & PreviewMeta;

export type EvidenceDTO = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceRoleLabel: string;
  isContradiction: boolean;
  evidenceLayerLabel: string | null;
  locatorText: string | null;
  urlFragment: string | null;
  sourceOriginalExcerpt: string | null;
  originalLanguageTag: string | null;
  transliteration: string | null;
  transliterationScheme: string | null;
  faithfulTranslation: string | null;
  translationLanguageTag: string | null;
  rationale: string | null;
};

export type SchoolDTO = { id: string; nameTr: string; nativeName: string | null } & PreviewMeta;

export type ListEnvelope<T> = { rows: T[]; count: number; view: ShowcaseView };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; error: string };

type RawBody = { ok?: boolean } & Record<string, unknown>;

async function getJson<T>(path: string, pick: (b: RawBody) => T, signal?: AbortSignal): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "GET", headers: adminHeaders(), cache: "no-store", signal });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: "Bağlantı hatası." };
  }
  let body: RawBody = {};
  try {
    body = (await res.json()) as RawBody;
  } catch {
    /* boş gövde */
  }
  if (res.ok && body.ok) return { ok: true, data: pick(body) };
  return {
    ok: false,
    status: res.status,
    code: typeof body.code === "string" ? body.code : `HTTP_${res.status}`,
    error: typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
  };
}

function q(params: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function previewParam(preview: boolean): string | undefined {
  return preview ? "1" : undefined;
}

// ---------------------------- Traditions ----------------------------
export function listTraditions(
  opts: { q?: string; preview?: boolean; signal?: AbortSignal } = {},
): Promise<ApiResult<ListEnvelope<TraditionDTO>>> {
  return getJson(
    `/traditions${q({ q: opts.q, preview: previewParam(opts.preview ?? false) })}`,
    (b) => ({ rows: (b.rows as TraditionDTO[]) ?? [], count: (b.count as number) ?? 0, view: b.view as ShowcaseView }),
    opts.signal,
  );
}
export function getTradition(id: string, preview: boolean, signal?: AbortSignal): Promise<ApiResult<TraditionDTO>> {
  return getJson(`/traditions/${id}${q({ preview: previewParam(preview) })}`, (b) => b.row as TraditionDTO, signal);
}

// ---------------------------- Concepts ----------------------------
export function listConcepts(
  opts: { traditionId?: string; q?: string; preview?: boolean; signal?: AbortSignal } = {},
): Promise<ApiResult<ListEnvelope<ConceptDTO>>> {
  return getJson(
    `/concepts${q({ traditionId: opts.traditionId, q: opts.q, preview: previewParam(opts.preview ?? false) })}`,
    (b) => ({ rows: (b.rows as ConceptDTO[]) ?? [], count: (b.count as number) ?? 0, view: b.view as ShowcaseView }),
    opts.signal,
  );
}
export type ConceptDetail = {
  row: ConceptDTO;
  labels: ConceptLabelDTO[];
  tradition: { id: string; nameTr: string } | null;
  school: SchoolDTO | null;
};
export function getConcept(id: string, preview: boolean, signal?: AbortSignal): Promise<ApiResult<ConceptDetail>> {
  return getJson(
    `/concepts/${id}${q({ preview: previewParam(preview) })}`,
    (b) => ({
      row: b.row as ConceptDTO,
      labels: (b.labels as ConceptLabelDTO[]) ?? [],
      tradition: (b.tradition as { id: string; nameTr: string } | null) ?? null,
      school: (b.school as SchoolDTO | null) ?? null,
    }),
    signal,
  );
}

// ---------------------------- Sources ----------------------------
export function listSources(
  opts: { traditionContextId?: string; q?: string; preview?: boolean; signal?: AbortSignal } = {},
): Promise<ApiResult<ListEnvelope<SourceDTO>>> {
  return getJson(
    `/sources${q({ traditionContextId: opts.traditionContextId, q: opts.q, preview: previewParam(opts.preview ?? false) })}`,
    (b) => ({ rows: (b.rows as SourceDTO[]) ?? [], count: (b.count as number) ?? 0, view: b.view as ShowcaseView }),
    opts.signal,
  );
}
export function getSource(id: string, preview: boolean, signal?: AbortSignal): Promise<ApiResult<SourceDTO>> {
  return getJson(`/sources/${id}${q({ preview: previewParam(preview) })}`, (b) => b.row as SourceDTO, signal);
}

// ---------------------------- Claims (Kaynaklı Bilgiler) ----------------------------
export function listClaims(
  opts: { conceptId?: string; q?: string; preview?: boolean; signal?: AbortSignal } = {},
): Promise<ApiResult<ListEnvelope<ClaimDTO>>> {
  return getJson(
    `/claims${q({ conceptId: opts.conceptId, q: opts.q, preview: previewParam(opts.preview ?? false) })}`,
    (b) => ({ rows: (b.rows as ClaimDTO[]) ?? [], count: (b.count as number) ?? 0, view: b.view as ShowcaseView }),
    opts.signal,
  );
}
export type ClaimDetail = {
  row: ClaimDTO;
  concept: { id: string; title: string } | null;
  evidence: EvidenceDTO[];
};
export function getClaim(id: string, preview: boolean, signal?: AbortSignal): Promise<ApiResult<ClaimDetail>> {
  return getJson(
    `/claims/${id}${q({ preview: previewParam(preview) })}`,
    (b) => ({
      row: b.row as ClaimDTO,
      concept: (b.concept as { id: string; title: string } | null) ?? null,
      evidence: (b.evidence as EvidenceDTO[]) ?? [],
    }),
    signal,
  );
}

// ---------------------------- Relations ----------------------------
export function listRelations(
  opts: { conceptId?: string; preview?: boolean; signal?: AbortSignal } = {},
): Promise<ApiResult<ListEnvelope<RelationDTO>>> {
  return getJson(
    `/relations${q({ conceptId: opts.conceptId, preview: previewParam(opts.preview ?? false) })}`,
    (b) => ({ rows: (b.rows as RelationDTO[]) ?? [], count: (b.count as number) ?? 0, view: b.view as ShowcaseView }),
    opts.signal,
  );
}
export type RelationDetail = { row: RelationDTO; evidence: EvidenceDTO[] };
export function getRelation(id: string, preview: boolean, signal?: AbortSignal): Promise<ApiResult<RelationDetail>> {
  return getJson(
    `/relations/${id}${q({ preview: previewParam(preview) })}`,
    (b) => ({ row: b.row as RelationDTO, evidence: (b.evidence as EvidenceDTO[]) ?? [] }),
    signal,
  );
}
