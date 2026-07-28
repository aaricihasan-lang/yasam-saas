/**
 * NKB-V2 — Kaynak notları (numerology_knowledge_source_entries) API istemci sarmalayıcıları.
 * /api/numeroloji/source-entries uçlarını çağırır. tenant_id GÖNDERİLMEZ (sunucuda session'dan).
 * Hata metinleri API'nin güvenli mesajlarıdır (ham DB ayrıntısı yok).
 */
import { numApi, numApiError } from "../../helpers/numApiClient";
import type { SourceEntryRow } from "./sourceEntryUiLogic";

const SOURCE_ENTRIES_API = "/api/numeroloji/source-entries";

export type SourceEntryInput = {
  source_id?: string | null;
  body?: string;
  display_order?: number;
  include_in_analysis?: boolean;
};

export async function listSourceEntries(
  knowledgeRecordId: string,
): Promise<{ rows: SourceEntryRow[]; error: string | null }> {
  const res = await numApi(`${SOURCE_ENTRIES_API}?knowledge_record_id=${encodeURIComponent(knowledgeRecordId)}`);
  const err = numApiError(res);
  if (err) return { rows: [], error: err };
  return { rows: (Array.isArray(res.json.rows) ? res.json.rows : []) as SourceEntryRow[], error: null };
}

/** Analiz için: tenant'ın include_in_analysis=true notlarının tamamı (tek bounded sorgu; N+1 yok). */
export async function listAnalysisSourceEntries(): Promise<{ rows: SourceEntryRow[]; error: string | null }> {
  const res = await numApi(`${SOURCE_ENTRIES_API}?include_in_analysis=true`);
  const err = numApiError(res);
  if (err) return { rows: [], error: err };
  return { rows: (Array.isArray(res.json.rows) ? res.json.rows : []) as SourceEntryRow[], error: null };
}

export async function createSourceEntry(
  knowledgeRecordId: string,
  input: SourceEntryInput,
): Promise<{ id: string | null; error: string | null; demo: boolean }> {
  const res = await numApi(SOURCE_ENTRIES_API, {
    method: "POST",
    body: JSON.stringify({ knowledge_record_id: knowledgeRecordId, ...input }),
  });
  const err = numApiError(res);
  const demo = res.json.demo === true;
  if (err) return { id: null, error: err, demo };
  return { id: demo ? null : typeof res.json.id === "string" ? res.json.id : null, error: null, demo };
}

export async function updateSourceEntryById(
  id: string,
  input: SourceEntryInput,
): Promise<{ error: string | null; demo: boolean }> {
  const res = await numApi(SOURCE_ENTRIES_API, { method: "PATCH", body: JSON.stringify({ id, ...input }) });
  return { error: numApiError(res), demo: res.json.demo === true };
}

export async function deleteSourceEntry(id: string): Promise<{ error: string | null; demo: boolean }> {
  const res = await numApi(SOURCE_ENTRIES_API, { method: "DELETE", body: JSON.stringify({ id }) });
  return { error: numApiError(res), demo: res.json.demo === true };
}
