/**
 * Klasik Numeroloji — veri erişim katmanı (YALNIZ SUNUCU, service-role istemcisiyle).
 *
 * Kurallar:
 *   • HER sorgu `.eq("tenant_id", tenantId)` taşır; tenantId yalnız oturum guard'ından gelir.
 *   • Silme YUMUŞAKTIR (deleted_at); silinmiş satır okunmaz/güncellenmez.
 *   • Güncelleme row_version CAS ile (trigger sürümü +1 yapar); eşleşmezse "conflict".
 *   • Mevcut Numeroloji (`numerology_records`) YALNIZ OKUNUR — bu dosyada o tabloya yazma YOKTUR
 *     (scripts/numeroloji-klasik/guard/boundary.harness.ts statik olarak tarar).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassicKind } from "../input";

assertServerOnly("lib/numeroloji-klasik/server/repository");

const ANALYSES = "numerology_classic_analyses";
const NOTES = "numerology_comparative_notes";
const LEGACY = "numerology_records";

export const CLASSIC_LIST_LIMIT = 20;

export type ClassicAnalysisRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  created_by: string | null;
  kind: ClassicKind;
  title: string;
  input: unknown;
  techniques: string[];
  result: unknown;
  verification: unknown;
  provider_meta: unknown;
  methodology_version: string;
  api_schema_version: string;
  status: "complete" | "partial";
  row_version: number;
  created_at: string;
  updated_at: string;
};

export type ClassicAnalysisSummary = Pick<
  ClassicAnalysisRow,
  "id" | "client_id" | "kind" | "title" | "techniques" | "status" | "row_version" | "created_at" | "updated_at"
>;

const FULL_COLUMNS =
  "id, tenant_id, client_id, created_by, kind, title, input, techniques, result, verification, provider_meta, methodology_version, api_schema_version, status, row_version, created_at, updated_at";
const SUMMARY_COLUMNS = "id, client_id, kind, title, techniques, status, row_version, created_at, updated_at";

export type RepoError = { ok: false; reason: "db_error" | "not_found" | "conflict" };
export type RepoOk<T> = { ok: true; value: T };

export type NewAnalysis = {
  clientId: string | null;
  createdBy: string;
  kind: ClassicKind;
  title: string;
  input: unknown;
  techniques: string[];
  result: unknown;
  verification: unknown;
  providerMeta: unknown;
  methodologyVersion: string;
  apiSchemaVersion: string;
  status: "complete" | "partial";
};

export async function insertAnalysis(db: SupabaseClient, tenantId: string, a: NewAnalysis): Promise<RepoOk<ClassicAnalysisSummary> | RepoError> {
  const { data, error } = await db
    .from(ANALYSES)
    .insert({
      tenant_id: tenantId,
      client_id: a.clientId,
      created_by: a.createdBy,
      kind: a.kind,
      title: a.title,
      input: a.input,
      techniques: a.techniques,
      result: a.result,
      verification: a.verification,
      provider_meta: a.providerMeta,
      methodology_version: a.methodologyVersion,
      api_schema_version: a.apiSchemaVersion,
      status: a.status,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error || !data) return { ok: false, reason: "db_error" };
  return { ok: true, value: data as unknown as ClassicAnalysisSummary };
}

export async function listAnalyses(
  db: SupabaseClient,
  tenantId: string,
  opts: { offset?: number; limit?: number; clientId?: string | null } = {},
): Promise<RepoOk<{ rows: ClassicAnalysisSummary[]; hasMore: boolean }> | RepoError> {
  const limit = Math.min(Math.max(opts.limit ?? CLASSIC_LIST_LIMIT, 1), CLASSIC_LIST_LIMIT);
  const offset = Math.max(0, Math.min(opts.offset ?? 0, 100_000));
  let q = db.from(ANALYSES).select(SUMMARY_COLUMNS).eq("tenant_id", tenantId).is("deleted_at", null);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit); // limit+1 satır → hasMore
  if (error || !Array.isArray(data)) return { ok: false, reason: "db_error" };
  const rows = data as unknown as ClassicAnalysisSummary[];
  return { ok: true, value: { rows: rows.slice(0, limit), hasMore: rows.length > limit } };
}

export async function getAnalysis(db: SupabaseClient, tenantId: string, id: string): Promise<RepoOk<ClassicAnalysisRow> | RepoError> {
  const { data, error } = await db.from(ANALYSES).select(FULL_COLUMNS).eq("tenant_id", tenantId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) return { ok: false, reason: "db_error" };
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, value: data as unknown as ClassicAnalysisRow };
}

/** CAS güncelleme: yalnız title / client_id. Eşleşmezse satırın var olup olmadığına bakılarak not_found|conflict. */
export async function updateAnalysis(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  expectedRowVersion: number,
  patch: { title?: string; clientId?: string | null },
): Promise<RepoOk<ClassicAnalysisSummary> | RepoError> {
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.clientId !== undefined) upd.client_id = patch.clientId;
  const { data, error } = await db
    .from(ANALYSES)
    .update(upd)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("row_version", expectedRowVersion)
    .is("deleted_at", null)
    .select(SUMMARY_COLUMNS);
  if (error) return { ok: false, reason: "db_error" };
  if (Array.isArray(data) && data.length === 1) return { ok: true, value: data[0] as unknown as ClassicAnalysisSummary };
  return classifyMiss(db, ANALYSES, tenantId, id);
}

/**
 * CAS içerik değiştirme (yalnız açık "Kaydı Güncelle"): başlık, danışan, girdi, teknikler, sonuç ve meta birlikte.
 * Tür DEĞİŞMEZ (kind eşleşmesi koşul). Eşleşmezse not_found|conflict.
 */
export async function replaceAnalysisContent(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  expectedRowVersion: number,
  a: Omit<NewAnalysis, "createdBy">,
): Promise<RepoOk<ClassicAnalysisRow> | RepoError> {
  const { data, error } = await db
    .from(ANALYSES)
    .update({
      title: a.title,
      client_id: a.clientId,
      input: a.input,
      techniques: a.techniques,
      result: a.result,
      verification: a.verification,
      provider_meta: a.providerMeta,
      methodology_version: a.methodologyVersion,
      api_schema_version: a.apiSchemaVersion,
      status: a.status,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("kind", a.kind)
    .eq("row_version", expectedRowVersion)
    .is("deleted_at", null)
    .select(FULL_COLUMNS);
  if (error) return { ok: false, reason: "db_error" };
  if (Array.isArray(data) && data.length === 1) return { ok: true, value: data[0] as unknown as ClassicAnalysisRow };
  return classifyMiss(db, ANALYSES, tenantId, id);
}

export async function softDeleteAnalysis(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  expectedRowVersion: number | null,
): Promise<RepoOk<{ id: string }> | RepoError> {
  let q = db.from(ANALYSES).update({ deleted_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id).is("deleted_at", null);
  if (expectedRowVersion !== null) q = q.eq("row_version", expectedRowVersion);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, reason: "db_error" };
  if (Array.isArray(data) && data.length === 1) return { ok: true, value: { id } };
  return classifyMiss(db, ANALYSES, tenantId, id);
}

async function classifyMiss(db: SupabaseClient, table: string, tenantId: string, id: string): Promise<RepoError> {
  const { data, error } = await db.from(table).select("id").eq("tenant_id", tenantId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) return { ok: false, reason: "db_error" };
  return { ok: false, reason: data ? "conflict" : "not_found" };
}

/** Danışan bu tenant'a mı ait? (bağlama öncesi; FK ayrıca DB'de zorlar.) */
export async function clientBelongsToTenant(db: SupabaseClient, tenantId: string, clientId: string): Promise<boolean | null> {
  const { data, error } = await db.from("clients").select("id").eq("tenant_id", tenantId).eq("id", clientId).maybeSingle();
  if (error) return null;
  return !!data;
}

// ─── Karşılaştırma notları ──────────────────────────────────────────────────

export type ComparativeNoteRow = {
  id: string;
  client_id: string | null;
  legacy_record_id: string | null;
  classic_analysis_id: string | null;
  snapshot: unknown;
  body: string;
  created_by: string | null;
  row_version: number;
  created_at: string;
  updated_at: string;
};
const NOTE_COLUMNS = "id, client_id, legacy_record_id, classic_analysis_id, snapshot, body, created_by, row_version, created_at, updated_at";

export async function insertNote(
  db: SupabaseClient,
  tenantId: string,
  n: { clientId: string | null; legacyRecordId: string | null; classicAnalysisId: string | null; snapshot: unknown; body: string; createdBy: string },
): Promise<RepoOk<ComparativeNoteRow> | RepoError> {
  const { data, error } = await db
    .from(NOTES)
    .insert({
      tenant_id: tenantId,
      client_id: n.clientId,
      legacy_record_id: n.legacyRecordId,
      classic_analysis_id: n.classicAnalysisId,
      snapshot: n.snapshot,
      body: n.body,
      created_by: n.createdBy,
    })
    .select(NOTE_COLUMNS)
    .single();
  if (error || !data) return { ok: false, reason: "db_error" };
  return { ok: true, value: data as unknown as ComparativeNoteRow };
}

export async function listNotes(
  db: SupabaseClient,
  tenantId: string,
  filter: { clientId?: string; classicAnalysisId?: string; legacyRecordId?: string },
): Promise<RepoOk<ComparativeNoteRow[]> | RepoError> {
  let q = db.from(NOTES).select(NOTE_COLUMNS).eq("tenant_id", tenantId).is("deleted_at", null);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.classicAnalysisId) q = q.eq("classic_analysis_id", filter.classicAnalysisId);
  if (filter.legacyRecordId) q = q.eq("legacy_record_id", filter.legacyRecordId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error || !Array.isArray(data)) return { ok: false, reason: "db_error" };
  return { ok: true, value: data as unknown as ComparativeNoteRow[] };
}

export async function getNote(db: SupabaseClient, tenantId: string, id: string): Promise<RepoOk<ComparativeNoteRow> | RepoError> {
  const { data, error } = await db.from(NOTES).select(NOTE_COLUMNS).eq("tenant_id", tenantId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) return { ok: false, reason: "db_error" };
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, value: data as unknown as ComparativeNoteRow };
}

export async function updateNote(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  expectedRowVersion: number,
  patch: { body?: string; snapshot?: unknown },
): Promise<RepoOk<ComparativeNoteRow> | RepoError> {
  const upd: Record<string, unknown> = {};
  if (patch.body !== undefined) upd.body = patch.body;
  if (patch.snapshot !== undefined) upd.snapshot = patch.snapshot;
  const { data, error } = await db
    .from(NOTES)
    .update(upd)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("row_version", expectedRowVersion)
    .is("deleted_at", null)
    .select(NOTE_COLUMNS);
  if (error) return { ok: false, reason: "db_error" };
  if (Array.isArray(data) && data.length === 1) return { ok: true, value: data[0] as unknown as ComparativeNoteRow };
  return classifyMiss(db, NOTES, tenantId, id);
}

export async function softDeleteNote(db: SupabaseClient, tenantId: string, id: string, expectedRowVersion: number): Promise<RepoOk<{ id: string }> | RepoError> {
  const { data, error } = await db
    .from(NOTES)
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("row_version", expectedRowVersion)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, reason: "db_error" };
  if (Array.isArray(data) && data.length === 1) return { ok: true, value: { id } };
  return classifyMiss(db, NOTES, tenantId, id);
}

// ─── Mevcut Numeroloji — YALNIZ OKUMA ───────────────────────────────────────

export type LegacyNumerologyRecord = Record<string, unknown> & { id: string };

/** Mevcut Numeroloji kaydını yalnız okur (karşılaştırma). Başka tenant → null. */
export async function readLegacyNumerologyRecord(db: SupabaseClient, tenantId: string, id: string): Promise<RepoOk<LegacyNumerologyRecord> | RepoError> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return { ok: false, reason: "not_found" };
  const { data, error } = await db.from(LEGACY).select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return { ok: false, reason: "db_error" };
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, value: data as LegacyNumerologyRecord };
}

/** Danışana bağlı mevcut Numeroloji kayıtlarının özeti (yalnız okuma; analysis_data taşınmaz). */
export async function listLegacyRecordsForClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<RepoOk<Array<{ id: string; name: string | null; surname: string | null; birth_date: string | null; created_at: string | null }>> | RepoError> {
  const { data, error } = await db
    .from(LEGACY)
    .select("id, name, surname, birth_date, created_at")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return { ok: false, reason: "db_error" };
  return { ok: true, value: data as Array<{ id: string; name: string | null; surname: string | null; birth_date: string | null; created_at: string | null }> };
}

// ─── Global katalog (sabit anlam metinleri; tenant'sız, kişisel veri yok) ────

export type ClassicCatalogKind = "pythagorean_meaning" | "chaldean_compound" | "lucky_association";
export const CLASSIC_CATALOG_KINDS: readonly ClassicCatalogKind[] = ["pythagorean_meaning", "chaldean_compound", "lucky_association"];
export type ClassicCatalogRow = { kind: ClassicCatalogKind; number: number; lang: string; payload: unknown; spec_version: string; imported_at: string };
const CATALOG = "numerology_classic_catalog";
const CATALOG_COLUMNS = "kind, number, lang, payload, spec_version, imported_at";

/**
 * Tek katalog girdisi (ör. lucky_association + Life Path + "en" → EN taş adları; ikinci sağlayıcı çağrısı YOK).
 * Yoksa not_found.
 */
export async function getCatalogEntry(
  db: SupabaseClient,
  kind: ClassicCatalogKind,
  number: number,
  lang: string,
): Promise<RepoOk<ClassicCatalogRow> | RepoError> {
  if (!CLASSIC_CATALOG_KINDS.includes(kind) || !Number.isInteger(number) || !/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang)) return { ok: false, reason: "not_found" };
  const { data, error } = await db.from(CATALOG).select(CATALOG_COLUMNS).eq("kind", kind).eq("number", number).eq("lang", lang).maybeSingle();
  if (error) return { ok: false, reason: "db_error" };
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, value: data as unknown as ClassicCatalogRow };
}

export async function listCatalog(db: SupabaseClient, kind: ClassicCatalogKind, lang: string): Promise<RepoOk<ClassicCatalogRow[]> | RepoError> {
  const { data, error } = await db.from(CATALOG).select(CATALOG_COLUMNS).eq("kind", kind).eq("lang", lang).order("number", { ascending: true }).limit(100);
  if (error || !Array.isArray(data)) return { ok: false, reason: "db_error" };
  return { ok: true, value: data as unknown as ClassicCatalogRow[] };
}
