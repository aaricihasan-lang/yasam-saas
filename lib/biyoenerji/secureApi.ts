/**
 * Biyoenerji güvenli API — istemci yardımcıları.
 * İstemciden doğrudan Supabase tablo erişimi yerine /api/biyoenerji/[resource]
 * üzerinden gider (verifyUserRequest + tenant binding).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export type BioRow = Record<string, unknown>;

const BASE = "/api/biyoenerji";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function bioApiList(
  resource: string,
  opts: { offset?: number; limit?: number; search?: string } = {},
): Promise<{ rows: BioRow[]; error: string | null }> {
  const p = new URLSearchParams();
  if (opts.offset) p.set("offset", String(opts.offset));
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.search?.trim()) p.set("search", opts.search.trim());
  const qs = p.toString();
  const res = await fetch(`${BASE}/${resource}${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { rows: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { rows: (j.rows as BioRow[]) ?? [], error: null };
}

export async function bioApiCount(
  resource: string,
  search?: string,
): Promise<{ count: number; error: string | null }> {
  const p = new URLSearchParams({ count: "1" });
  if (search?.trim()) p.set("search", search.trim());
  const res = await fetch(`${BASE}/${resource}?${p.toString()}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { count: 0, error: String(j.error ?? `HTTP ${res.status}`) };
  return { count: Number(j.count ?? 0), error: null };
}

export async function bioApiLastCreated(
  resource: string,
): Promise<{ lastCreatedAt: string | null; error: string | null }> {
  const res = await fetch(`${BASE}/${resource}?lastCreated=1`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { lastCreatedAt: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { lastCreatedAt: (j.lastCreatedAt as string | null) ?? null, error: null };
}

export async function bioApiGetOne(
  resource: string,
  id: string,
): Promise<{ row: BioRow | null; error: string | null }> {
  const res = await fetch(`${BASE}/${resource}/${id}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (res.status === 404) return { row: null, error: null };
  if (!res.ok || j.ok !== true) return { row: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { row: (j.row as BioRow) ?? null, error: null };
}

export async function bioApiCreate(
  resource: string,
  fields: BioRow,
): Promise<{ row: BioRow | null; error: string | null }> {
  const res = await fetch(`${BASE}/${resource}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { row: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { row: (j.row as BioRow) ?? null, error: null };
}

export async function bioApiUpdate(
  resource: string,
  id: string,
  fields: BioRow,
): Promise<{ error: string | null }> {
  const res = await fetch(`${BASE}/${resource}/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

export async function bioApiDelete(
  resource: string,
  id: string,
): Promise<{ error: string | null }> {
  const res = await fetch(`${BASE}/${resource}/${id}`, { method: "DELETE", headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}
