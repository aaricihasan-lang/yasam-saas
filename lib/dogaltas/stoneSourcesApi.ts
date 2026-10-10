/**
 * Doğaltaş çoklu kaynak (WT9) — tarayıcı istemcisi. Kimlik başlıkları dogaltasApi ile aynı;
 * tenant İSTEMCİDEN GÖNDERİLMEZ (sunucu oturumdan çözer).
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";
import { invalidateStonesList } from "@/lib/dogaltas/stonesListCache";
import type { SourceField, StoneSourceView } from "@/lib/dogaltas/stoneSources";

const base = (stoneId: string) => `/api/dogaltas/stones/${encodeURIComponent(stoneId)}/sources`;

export async function fetchStoneSources(stoneId: string): Promise<{ ok: boolean; sources?: StoneSourceView[]; schemaMissing?: boolean; error?: string }> {
  const r = await dogaltasApiGet<{ sources?: StoneSourceView[]; schemaMissing?: boolean }>(base(stoneId));
  return { ok: r.ok, sources: r.data?.sources, schemaMissing: r.data?.schemaMissing, error: r.error };
}

export type SourceWriteResult = { ok: boolean; error?: string; code?: string; demo?: boolean; row?: Record<string, unknown> };

export async function createStoneSource(stoneId: string, name: string): Promise<SourceWriteResult> {
  const r = await dogaltasApiSend<{ source?: Record<string, unknown> }>(base(stoneId), "POST", { source_name: name });
  if (r.ok) invalidateStonesList();
  return { ok: r.ok, error: r.error, code: r.code, demo: r.demo, row: r.data?.source };
}

export async function updateStoneSource(
  stoneId: string,
  sourceId: string,
  patch: Partial<Record<SourceField | "source_name", string | string[] | null>> & { expectedUpdatedAt?: string | null },
): Promise<SourceWriteResult> {
  const r = await dogaltasApiSend<{ source?: Record<string, unknown>; row?: Record<string, unknown> }>(
    `${base(stoneId)}/${encodeURIComponent(sourceId)}`, "PATCH", patch);
  if (r.ok) invalidateStonesList();
  return { ok: r.ok, error: r.error, code: r.code, demo: r.demo, row: r.data?.row ?? r.data?.source };
}

export async function deleteStoneSource(stoneId: string, sourceId: string): Promise<SourceWriteResult & { promoted?: string }> {
  const r = await dogaltasApiSend<{ promoted?: string }>(`${base(stoneId)}/${encodeURIComponent(sourceId)}`, "DELETE");
  if (r.ok) invalidateStonesList();
  return { ok: r.ok, error: r.error, code: r.code, demo: r.demo, promoted: r.data?.promoted };
}

/** Uzmanın KENDİ kaynak adları (autocomplete). */
export async function fetchMySourceNames(): Promise<string[]> {
  const r = await dogaltasApiGet<{ names?: string[] }>("/api/dogaltas/stone-sources/names");
  return r.ok && Array.isArray(r.data?.names) ? r.data!.names! : [];
}
