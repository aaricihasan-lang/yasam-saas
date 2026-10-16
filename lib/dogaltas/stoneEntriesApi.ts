/**
 * Doğaltaş bilgi kayıtları — tarayıcı istemcisi. Kimlik başlıkları dogaltasApi ile aynı;
 * tenant İSTEMCİDEN GÖNDERİLMEZ (sunucu oturumdan çözer).
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";
import { invalidateStonesList } from "@/lib/dogaltas/stonesListCache";
import type { EntryField, StoneEntryView } from "@/lib/dogaltas/stoneEntries";

const base = (stoneId: string) => `/api/dogaltas/stones/${encodeURIComponent(stoneId)}/entries`;
const one = (stoneId: string, entryId: string) => `${base(stoneId)}/${encodeURIComponent(entryId)}`;

export type EntryWriteResult = { ok: boolean; error?: string; code?: string; demo?: boolean; entry?: Record<string, unknown> };

export async function fetchStoneEntryRows(stoneId: string): Promise<{ ok: boolean; rows?: Record<string, unknown>[]; schemaMissing?: boolean; error?: string }> {
  const r = await dogaltasApiGet<{ entries?: Record<string, unknown>[]; schemaMissing?: boolean }>(base(stoneId));
  return { ok: r.ok, rows: r.data?.entries, schemaMissing: r.data?.schemaMissing, error: r.error };
}

export async function createStoneEntry(stoneId: string, field: EntryField, content: string, sourceName: string): Promise<EntryWriteResult> {
  const r = await dogaltasApiSend<{ entry?: Record<string, unknown> }>(base(stoneId), "POST", { field_key: field, content, source_name: sourceName });
  if (r.ok) invalidateStonesList();
  return { ok: r.ok, error: r.error, code: r.code, demo: r.demo, entry: r.data?.entry };
}

/** Yalnız bu kaydın metni/kaynağı. Eski kayıtta `expected` = gösterilen eski metin (çakışma koruması). */
export async function updateStoneEntry(stoneId: string, entry: StoneEntryView, patch: { content: string; sourceName: string }): Promise<EntryWriteResult> {
  const body: Record<string, unknown> = { content: patch.content, source_name: patch.sourceName };
  if (entry.legacy) body.expected = entry.content;
  const r = await dogaltasApiSend<{ entry?: Record<string, unknown> }>(one(stoneId, entry.id), "PATCH", body);
  if (r.ok) invalidateStonesList();
  return { ok: r.ok, error: r.error, code: r.code, demo: r.demo, entry: r.data?.entry };
}

export async function deleteStoneEntry(stoneId: string, entry: StoneEntryView): Promise<EntryWriteResult> {
  const r = await dogaltasApiSend(one(stoneId, entry.id), "DELETE", entry.legacy ? { expected: entry.content } : {});
  if (r.ok) invalidateStonesList();
  return { ok: r.ok, error: r.error, code: r.code, demo: r.demo };
}
