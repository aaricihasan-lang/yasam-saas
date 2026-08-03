"use client";

// ============================================================
// YEBS A8 — Merkezî, typed admin API client (client-safe)
//
// Mevcut admin auth modelini kullanır: x-admin-id + x-session-token başlıkları.
// service_role ASLA istemciye çıkmaz; guard sunucuda (verifyAdminRequest) çalışır.
// Generic keyfi endpoint çağrısı YOK — yalnız entity-specific typed fonksiyonlar.
// ============================================================

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  ApiResult, ListEnvelope,
  TraditionRow, SchoolRow, ConceptRow, ConceptLabelRow, SourceRow,
  ClaimRow, ClaimSourceRow, ConceptRelationRow, ConceptRelationSourceRow,
} from "@/lib/yebs/ui/types";

const BASE = "/api/admin/yebs";

function adminHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": readYasamUser()?.id ?? "" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

type RawErr = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

async function toResult<T>(res: Response, pick: (b: RawErr) => T): Promise<ApiResult<T>> {
  let body: RawErr = {};
  try { body = (await res.json()) as RawErr; } catch { /* boş/again gövde */ }
  if (res.ok && body.ok) return { ok: true, data: pick(body) };
  return {
    ok: false,
    status: res.status,
    code: typeof body.code === "string" ? body.code : `HTTP_${res.status}`,
    error: typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
  };
}

async function doFetch(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: adminHeaders(body !== undefined),
    cache: "no-store",
    signal,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---- Ortak jenerik yardımcılar (yalnız bu dosya içinde kullanılır) ----
async function getList<T>(path: string, signal?: AbortSignal): Promise<ApiResult<ListEnvelope<T>>> {
  const res = await doFetch("GET", path, undefined, signal);
  return toResult<ListEnvelope<T>>(res, (b) => ({
    rows: (b.rows as T[]) ?? [],
    count: (b.count as number | null) ?? null,
    limit: (b.limit as number) ?? 0,
    offset: (b.offset as number) ?? 0,
  }));
}
async function getRow<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  const res = await doFetch("GET", path, undefined, signal);
  return toResult<T>(res, (b) => b.row as T);
}
async function sendRow<T>(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  const res = await doFetch(method, path, body, signal);
  return toResult<T>(res, (b) => b.row as T);
}

// ---- Eligibility ----
export type Eligibility = {
  allowed: boolean;
  current_status: string;
  target_status: string;
  blocker_codes: string[];
  warnings: string[];
  evaluated_at: string;
  expected_updated_at: string;
};
async function getEligibility(coll: string, id: string, target: string, signal?: AbortSignal): Promise<ApiResult<Eligibility>> {
  const res = await doFetch("GET", `/${coll}/${id}/eligibility?target_status=${encodeURIComponent(target)}`, undefined, signal);
  return toResult<Eligibility>(res, (b) => b.eligibility as Eligibility);
}

// ---- querystring yardımcı ----
export type QueryParams = Record<string, string | number | boolean | undefined | null>;
function qs(params: QueryParams): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

// Ortak transition/eligibility gövdeleri
export type TransitionBody = { target_status: string; expected_updated_at: string; reason: string };
export type VerificationBody = { verification_status: string; expected_updated_at: string; reason: string };

// ============================================================
// TRADITION
// ============================================================
export const traditionsApi = {
  list: (p: QueryParams, s?: AbortSignal) => getList<TraditionRow>(`/traditions${qs(p)}`, s),
  detail: (id: string, s?: AbortSignal) => getRow<TraditionRow>(`/traditions/${id}`, s),
  create: (body: Record<string, unknown>, s?: AbortSignal) => sendRow<TraditionRow>("POST", `/traditions`, body, s),
  update: (id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<TraditionRow>("PATCH", `/traditions/${id}`, body, s),
  transition: (id: string, body: TransitionBody, s?: AbortSignal) => sendRow<TraditionRow>("POST", `/traditions/${id}/transition`, body, s),
  eligibility: (id: string, target: string, s?: AbortSignal) => getEligibility("traditions", id, target, s),
};

// ============================================================
// SCHOOL
// ============================================================
export const schoolsApi = {
  list: (p: QueryParams, s?: AbortSignal) => getList<SchoolRow>(`/schools${qs(p)}`, s),
  detail: (id: string, s?: AbortSignal) => getRow<SchoolRow>(`/schools/${id}`, s),
  create: (body: Record<string, unknown>, s?: AbortSignal) => sendRow<SchoolRow>("POST", `/schools`, body, s),
  update: (id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<SchoolRow>("PATCH", `/schools/${id}`, body, s),
  transition: (id: string, body: TransitionBody, s?: AbortSignal) => sendRow<SchoolRow>("POST", `/schools/${id}/transition`, body, s),
  eligibility: (id: string, target: string, s?: AbortSignal) => getEligibility("schools", id, target, s),
};

// ============================================================
// CONCEPT (+ label-aware arama q; + Labels alt-koleksiyonu)
// ============================================================
export const conceptsApi = {
  list: (p: QueryParams, s?: AbortSignal) => getList<ConceptRow>(`/concepts${qs(p)}`, s),
  detail: (id: string, s?: AbortSignal) => getRow<ConceptRow>(`/concepts/${id}`, s),
  create: (body: Record<string, unknown>, s?: AbortSignal) => sendRow<ConceptRow>("POST", `/concepts`, body, s),
  update: (id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ConceptRow>("PATCH", `/concepts/${id}`, body, s),
  transition: (id: string, body: TransitionBody, s?: AbortSignal) => sendRow<ConceptRow>("POST", `/concepts/${id}/transition`, body, s),
  eligibility: (id: string, target: string, s?: AbortSignal) => getEligibility("concepts", id, target, s),
  // Labels
  listLabels: (conceptId: string, s?: AbortSignal) =>
    // labels: {ok,rows} (count/limit/offset YOK) — getList yine güvenli döner
    getList<ConceptLabelRow>(`/concepts/${conceptId}/labels`, s),
  createLabel: (conceptId: string, body: Record<string, unknown>, s?: AbortSignal) =>
    sendRow<ConceptLabelRow>("POST", `/concepts/${conceptId}/labels`, body, s),
  updateLabel: (conceptId: string, labelId: string, body: Record<string, unknown>, s?: AbortSignal) =>
    sendRow<ConceptLabelRow>("PATCH", `/concepts/${conceptId}/labels/${labelId}`, body, s),
  deleteLabel: (conceptId: string, labelId: string, body: { expected_updated_at: string; reason: string }, s?: AbortSignal) =>
    sendRow<ConceptLabelRow>("DELETE", `/concepts/${conceptId}/labels/${labelId}`, body, s),
};

// ============================================================
// SOURCE
// ============================================================
export const sourcesApi = {
  list: (p: QueryParams, s?: AbortSignal) => getList<SourceRow>(`/sources${qs(p)}`, s),
  detail: (id: string, s?: AbortSignal) => getRow<SourceRow>(`/sources/${id}`, s),
  create: (body: Record<string, unknown>, s?: AbortSignal) => sendRow<SourceRow>("POST", `/sources`, body, s),
  update: (id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<SourceRow>("PATCH", `/sources/${id}`, body, s),
  transition: (id: string, body: TransitionBody, s?: AbortSignal) => sendRow<SourceRow>("POST", `/sources/${id}/transition`, body, s),
  eligibility: (id: string, target: string, s?: AbortSignal) => getEligibility("sources", id, target, s),
};

// ============================================================
// CLAIM (+ Claim Sources evidence + verify)
// ============================================================
export const claimsApi = {
  list: (p: QueryParams, s?: AbortSignal) => getList<ClaimRow>(`/claims${qs(p)}`, s),
  detail: (id: string, s?: AbortSignal) => getRow<ClaimRow>(`/claims/${id}`, s),
  create: (body: Record<string, unknown>, s?: AbortSignal) => sendRow<ClaimRow>("POST", `/claims`, body, s),
  update: (id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ClaimRow>("PATCH", `/claims/${id}`, body, s),
  transition: (id: string, body: TransitionBody, s?: AbortSignal) => sendRow<ClaimRow>("POST", `/claims/${id}/transition`, body, s),
  eligibility: (id: string, target: string, s?: AbortSignal) => getEligibility("claims", id, target, s),
  // Evidence (claim sources)
  listSources: (claimId: string, p: QueryParams, s?: AbortSignal) => getList<ClaimSourceRow>(`/claims/${claimId}/sources${qs(p)}`, s),
  attachSource: (claimId: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ClaimSourceRow>("POST", `/claims/${claimId}/sources`, body, s),
  updateSource: (claimId: string, id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ClaimSourceRow>("PATCH", `/claims/${claimId}/sources/${id}`, body, s),
  detachSource: (claimId: string, id: string, body: { expected_updated_at: string; reason: string }, s?: AbortSignal) => sendRow<ClaimSourceRow>("DELETE", `/claims/${claimId}/sources/${id}`, body, s),
  verifySource: (claimId: string, id: string, body: VerificationBody, s?: AbortSignal) => sendRow<ClaimSourceRow>("POST", `/claims/${claimId}/sources/${id}/verify`, body, s),
};

// ============================================================
// CONCEPT RELATION (+ Relation Sources evidence + verify)
// ============================================================
export const relationsApi = {
  list: (p: QueryParams, s?: AbortSignal) => getList<ConceptRelationRow>(`/relations${qs(p)}`, s),
  detail: (id: string, s?: AbortSignal) => getRow<ConceptRelationRow>(`/relations/${id}`, s),
  create: (body: Record<string, unknown>, s?: AbortSignal) => sendRow<ConceptRelationRow>("POST", `/relations`, body, s),
  update: (id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ConceptRelationRow>("PATCH", `/relations/${id}`, body, s),
  transition: (id: string, body: TransitionBody, s?: AbortSignal) => sendRow<ConceptRelationRow>("POST", `/relations/${id}/transition`, body, s),
  eligibility: (id: string, target: string, s?: AbortSignal) => getEligibility("relations", id, target, s),
  // Evidence (relation sources)
  listSources: (relationId: string, p: QueryParams, s?: AbortSignal) => getList<ConceptRelationSourceRow>(`/relations/${relationId}/sources${qs(p)}`, s),
  attachSource: (relationId: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ConceptRelationSourceRow>("POST", `/relations/${relationId}/sources`, body, s),
  updateSource: (relationId: string, id: string, body: Record<string, unknown>, s?: AbortSignal) => sendRow<ConceptRelationSourceRow>("PATCH", `/relations/${relationId}/sources/${id}`, body, s),
  detachSource: (relationId: string, id: string, body: { expected_updated_at: string; reason: string }, s?: AbortSignal) => sendRow<ConceptRelationSourceRow>("DELETE", `/relations/${relationId}/sources/${id}`, body, s),
  verifySource: (relationId: string, id: string, body: VerificationBody, s?: AbortSignal) => sendRow<ConceptRelationSourceRow>("POST", `/relations/${relationId}/sources/${id}/verify`, body, s),
};
