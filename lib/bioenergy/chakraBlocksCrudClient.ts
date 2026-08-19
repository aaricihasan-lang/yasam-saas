/**
 * BİYOENERJİ FAZ 2 — Çakra visible block CRUD istemci yardımcıları.
 * /api/biyoenerji/chakra-blocks (+ /[id], /reorder). authHeaders (verifyUser binding).
 */
import { authHeaders } from "@/lib/biyoenerji/secureApi";

const BASE = "/api/biyoenerji/chakra-blocks";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export type ChakraBlockCreateInput = {
  chakraId: string;
  section_key: string;
  block_type: string;
  block_title?: string | null;
  editorial_explanation: string;
  sort_order?: number;
};

export async function createChakraBlock(
  input: ChakraBlockCreateInput,
): Promise<{ id: string | null; demo?: boolean; error: string | null }> {
  const res = await fetch(BASE, { method: "POST", headers: authHeaders(), body: JSON.stringify(input) });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { id: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { id: (j.id as string | undefined) ?? null, demo: j.demo === true, error: null };
}

export type ChakraBlockUpdateInput = Partial<{
  section_key: string;
  block_type: string;
  block_title: string | null;
  editorial_explanation: string;
  sort_order: number;
}>;

export async function updateChakraBlock(
  id: string,
  fields: ChakraBlockUpdateInput,
): Promise<{ error: string | null }> {
  const res = await fetch(`${BASE}/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(fields) });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

export async function deleteChakraBlock(id: string): Promise<{ error: string | null }> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

export async function reorderChakraBlocks(
  chakraId: string,
  items: { id: string; sort_order: number }[],
): Promise<{ updated: number; failed: string[]; error: string | null }> {
  if (items.length === 0) return { updated: 0, failed: [], error: null };
  const res = await fetch(`${BASE}/reorder`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ chakraId, items }),
  });
  const j = await readJson(res);
  if (!res.ok) return { updated: 0, failed: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { updated: Number(j.updated ?? 0), failed: (j.failed as string[]) ?? [], error: j.ok === true ? null : "Bazı bloklar taşınamadı." };
}

/** Silme güvenliği için tek çakranın child block sayıları. */
export async function fetchChakraBlockCounts(
  chakraId: string,
): Promise<{ total: number; visible: number; evidence: number; error: string | null }> {
  const res = await fetch(`${BASE}?chakraId=${encodeURIComponent(chakraId)}&count=1`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { total: 0, visible: 0, evidence: 0, error: String(j.error ?? `HTTP ${res.status}`) };
  return { total: Number(j.total ?? 0), visible: Number(j.visible ?? 0), evidence: Number(j.evidence ?? 0), error: null };
}

/** Toplu silme cascade uyarısı — seçili çakralar (chakraIds) veya tüm tenant (all). */
export async function fetchChakraBlockCountsBulk(
  arg: { chakraIds: string[] } | { all: true },
): Promise<{ parents: number; total: number; visible: number; evidence: number; error: string | null }> {
  const res = await fetch(`${BASE}/count`, { method: "POST", headers: authHeaders(), body: JSON.stringify(arg) });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { parents: 0, total: 0, visible: 0, evidence: 0, error: String(j.error ?? `HTTP ${res.status}`) };
  return {
    parents: Number(j.parents ?? 0), total: Number(j.total ?? 0),
    visible: Number(j.visible ?? 0), evidence: Number(j.evidence ?? 0), error: null,
  };
}
