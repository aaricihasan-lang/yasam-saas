/**
 * NKB-V2-D2 — Kaynak + bağlantı API istemci sarmalayıcıları.
 * /api/numeroloji/sources ve /api/numeroloji/record-sources (NKB-V2-C) uçlarını çağırır.
 * tenant_id GÖNDERİLMEZ (sunucuda session'dan alınır). Hata metinleri API'nin güvenli
 * mesajlarıdır (ham DB ayrıntısı yok). 409 durumları `conflict` ile ayrıştırılır.
 */
import { numApi, numApiError } from "../../helpers/numApiClient";
import type { KulvarSectionKey } from "./knowledgeSections";
import type { SourcePayload } from "./sourcesValidation";

const SOURCES_API = "/api/numeroloji/sources";
const RECORD_SOURCES_API = "/api/numeroloji/record-sources";

export type NumerologySourceRow = {
  id: string;
  tenant_id: string;
  display_label: string;
  title: string | null;
  authors: string | null;
  organization: string | null;
  source_type: string | null;
  level_or_edition: string | null;
  publication_year: number | null;
  language: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordSourceRow = {
  id: string;
  tenant_id: string;
  knowledge_record_id: string;
  source_id: string;
  page_start: number | null;
  page_end: number | null;
  locator: string | null;
  is_primary: boolean;
  display_order: number;
  internal_note: string | null;
  section_key: KulvarSectionKey | null;
  created_at: string;
  updated_at: string;
};

export type SourceInput = {
  display_label: string;
  title?: string | null;
  authors?: string | null;
  organization?: string | null;
  source_type?: string | null;
  level_or_edition?: string | null;
  publication_year?: number | null;
  language?: string | null;
  notes?: string | null;
};

export type LinkInput = {
  source_id: string;
  section_key?: KulvarSectionKey | null;
  page_start?: number | null;
  page_end?: number | null;
  locator?: string | null;
  is_primary?: boolean;
  display_order?: number;
  internal_note?: string | null;
};

// ── numerology_sources ───────────────────────────────────────────────────────

export async function listSources(): Promise<{ rows: NumerologySourceRow[]; error: string | null }> {
  const res = await numApi(SOURCES_API);
  const err = numApiError(res);
  if (err) return { rows: [], error: err };
  return { rows: (Array.isArray(res.json.rows) ? res.json.rows : []) as NumerologySourceRow[], error: null };
}

export async function createSource(input: SourcePayload): Promise<{ id: string | null; error: string | null; demo: boolean }> {
  const res = await numApi(SOURCES_API, { method: "POST", body: JSON.stringify(input) });
  const err = numApiError(res);
  const demo = res.json.demo === true;
  // Demo no-op: gerçek yazma yok → sahte id üretilmez.
  if (err) return { id: null, error: err, demo };
  return { id: demo ? null : typeof res.json.id === "string" ? res.json.id : null, error: null, demo };
}

export async function updateSourceById(id: string, input: SourcePayload): Promise<{ error: string | null; demo: boolean }> {
  const res = await numApi(SOURCES_API, { method: "PATCH", body: JSON.stringify({ id, ...input }) });
  return { error: numApiError(res), demo: res.json.demo === true };
}

export async function deleteSource(id: string): Promise<{ error: string | null; conflict: boolean; demo: boolean }> {
  const res = await numApi(SOURCES_API, { method: "DELETE", body: JSON.stringify({ id }) });
  return { error: numApiError(res), conflict: res.status === 409, demo: res.json.demo === true };
}

// ── numerology_record_sources ────────────────────────────────────────────────

export async function listRecordSources(
  knowledgeRecordId: string,
): Promise<{ rows: RecordSourceRow[]; error: string | null }> {
  const res = await numApi(`${RECORD_SOURCES_API}?knowledge_record_id=${encodeURIComponent(knowledgeRecordId)}`);
  const err = numApiError(res);
  if (err) return { rows: [], error: err };
  return { rows: (Array.isArray(res.json.rows) ? res.json.rows : []) as RecordSourceRow[], error: null };
}

export async function createRecordSource(
  knowledgeRecordId: string,
  input: LinkInput,
): Promise<{ id: string | null; error: string | null; conflict: boolean; demo: boolean }> {
  const res = await numApi(RECORD_SOURCES_API, {
    method: "POST",
    body: JSON.stringify({ knowledge_record_id: knowledgeRecordId, ...input }),
  });
  const err = numApiError(res);
  const conflict = res.status === 409;
  const demo = res.json.demo === true;
  // Demo no-op: sahte bağlantı id üretilmez.
  if (err) return { id: null, error: err, conflict, demo };
  return { id: demo ? null : typeof res.json.id === "string" ? res.json.id : null, error: null, conflict: false, demo };
}

export async function updateRecordSourceById(
  id: string,
  input: Partial<Omit<LinkInput, "source_id">>,
): Promise<{ error: string | null; conflict: boolean; demo: boolean }> {
  const res = await numApi(RECORD_SOURCES_API, { method: "PATCH", body: JSON.stringify({ id, ...input }) });
  return { error: numApiError(res), conflict: res.status === 409, demo: res.json.demo === true };
}

export async function deleteRecordSource(id: string): Promise<{ error: string | null; demo: boolean }> {
  const res = await numApi(RECORD_SOURCES_API, { method: "DELETE", body: JSON.stringify({ id }) });
  return { error: numApiError(res), demo: res.json.demo === true };
}
