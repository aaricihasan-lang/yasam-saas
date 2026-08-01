import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MethodRevisionDetail,
  MethodRevisionListItem,
  MethodSeriesDetail,
  MethodSeriesListItem,
  MethodStepView,
} from "@/lib/aromaterapi/readTypes";

/**
 * Aromaterapi V2 — C3D-B2B Üretim/Elde Ediliş Yöntemi (method series & revision)
 * okuma servisi.
 *
 * server-only: service_role Supabase istemcisi (guard.db) YALNIZ burada kullanılır.
 * Her sorgu doğrulanmış oturum tenantId'siyle `.eq("tenant_id", tenantId)` filtrelenir;
 * tenant istemciden ASLA gelmez. Mutation YOKTUR (yalnız SELECT). Ham hata fırlatılır
 * ve route katmanında güvenli 500'e çevrilir.
 *
 * Not: method serisi kimliği (method_kind/source/passage/method_lang) immutable'dır;
 * içerik revizyonlarda taşınır. `latest_*` en yüksek revizyonu, `verified_*` (varsa) tek
 * verified revizyonu özetler (DB tarafında partial-unique: seri başına en çok bir verified).
 */

const SERIES_TABLE = "aromatherapy_preparation_method_series";
const REV_TABLE = "aromatherapy_preparation_method_revisions";
const SOURCES_TABLE = "aromatherapy_sources";
const PASSAGES_TABLE = "aromatherapy_source_passages";
const PREP_TABLE = "aromatherapy_preparations";

const SERIES_COLS =
  "id, preparation_id, method_kind, method_lang, source_id, passage_id, created_at";
const REV_META_COLS = "id, series_id, revision, status, created_at, updated_at";
const REV_DETAIL_COLS =
  "id, series_id, revision, status, created_at, updated_at, plant_part_used, material_state, " +
  "method_text, equipment, amount_ratio, solvent_carrier, duration_text, temperature_text, steps, " +
  "filtration, resting, storage, quality_notes, safety_notes, note_hash";

type SeriesRow = {
  id: string;
  preparation_id: string;
  method_kind: string;
  method_lang: string;
  source_id: string | null;
  passage_id: string | null;
  created_at: string;
};

type RevMetaRow = {
  id: string;
  series_id: string;
  revision: number;
  status: string;
  created_at: string;
  updated_at: string;
};

// ------------------------------------------------------------------
// Ortak yardımcılar
// ------------------------------------------------------------------

function normalizeSteps(raw: unknown): MethodStepView[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MethodStepView[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const order = rec.order;
    const text = rec.text;
    if (typeof order !== "number" || typeof text !== "string") continue;
    out.push({ order, text });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

/** id → tek metin-kolon haritası (tenant-scoped, tek sorgu). */
async function labelMap(
  db: SupabaseClient,
  tenantId: string,
  table: string,
  ids: (string | null)[],
  column: string,
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => Boolean(v))));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .eq("tenant_id", tenantId)
    .in("id", unique);
  if (error) throw error;

  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = r.id;
    const val = r[column];
    if (typeof id === "string" && typeof val === "string") map.set(id, val);
  }
  return map;
}

/** Revizyon meta satırlarından seri özetini (latest/verified/count) türetir. */
function summarizeRevisions(rows: RevMetaRow[]): {
  revision_count: number;
  latest: RevMetaRow;
  verified: RevMetaRow | null;
} | null {
  if (rows.length === 0) return null;
  let latest = rows[0];
  let verified: RevMetaRow | null = null;
  for (const r of rows) {
    if (r.revision > latest.revision) latest = r;
    if (r.status === "verified") verified = r;
  }
  return { revision_count: rows.length, latest, verified };
}

function toSeriesListItem(
  s: SeriesRow,
  revs: RevMetaRow[],
  sourceTitles: Map<string, string>,
  passageLocators: Map<string, string>,
): MethodSeriesListItem | null {
  const summary = summarizeRevisions(revs);
  if (!summary) return null; // seri her zaman ≥1 revizyona sahiptir (atomik create); savunmacı
  return {
    id: s.id,
    preparation_id: s.preparation_id,
    method_kind: s.method_kind,
    method_lang: s.method_lang,
    source_id: s.source_id,
    passage_id: s.passage_id,
    source_title: s.source_id ? sourceTitles.get(s.source_id) ?? null : null,
    passage_locator: s.passage_id ? passageLocators.get(s.passage_id) ?? null : null,
    created_at: s.created_at,
    revision_count: summary.revision_count,
    latest_revision: summary.latest.revision,
    latest_revision_id: summary.latest.id,
    latest_status: summary.latest.status,
    latest_updated_at: summary.latest.updated_at,
    verified_revision: summary.verified?.revision ?? null,
    verified_revision_id: summary.verified?.id ?? null,
  };
}

// ------------------------------------------------------------------
// Preparata bağlı seri listesi (+ her seri için özet)
// ------------------------------------------------------------------

export async function listMethodSeries(
  db: SupabaseClient,
  tenantId: string,
  preparationId: string,
): Promise<MethodSeriesListItem[]> {
  const { data: seriesData, error } = await db
    .from(SERIES_TABLE)
    .select(SERIES_COLS)
    .eq("tenant_id", tenantId)
    .eq("preparation_id", preparationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  const series = (seriesData ?? []) as unknown as SeriesRow[];
  if (series.length === 0) return [];

  const seriesIds = series.map((s) => s.id);
  const { data: revData, error: revErr } = await db
    .from(REV_TABLE)
    .select(REV_META_COLS)
    .eq("tenant_id", tenantId)
    .in("series_id", seriesIds);
  if (revErr) throw revErr;
  const revs = (revData ?? []) as unknown as RevMetaRow[];

  const revsBySeries = new Map<string, RevMetaRow[]>();
  for (const r of revs) {
    const list = revsBySeries.get(r.series_id) ?? [];
    list.push(r);
    revsBySeries.set(r.series_id, list);
  }

  const sourceTitles = await labelMap(
    db,
    tenantId,
    SOURCES_TABLE,
    series.map((s) => s.source_id),
    "title",
  );
  const passageLocators = await labelMap(
    db,
    tenantId,
    PASSAGES_TABLE,
    series.map((s) => s.passage_id),
    "locator_label",
  );

  const items: MethodSeriesListItem[] = [];
  for (const s of series) {
    const item = toSeriesListItem(s, revsBySeries.get(s.id) ?? [], sourceTitles, passageLocators);
    if (item) items.push(item);
  }
  return items;
}

// ------------------------------------------------------------------
// Seri detay + revizyon geçmişi (yeni → eski)
// ------------------------------------------------------------------

export async function getMethodSeries(
  db: SupabaseClient,
  tenantId: string,
  seriesId: string,
): Promise<MethodSeriesDetail | null> {
  const { data: seriesData, error } = await db
    .from(SERIES_TABLE)
    .select(SERIES_COLS)
    .eq("tenant_id", tenantId)
    .eq("id", seriesId)
    .maybeSingle();
  if (error) throw error;
  if (!seriesData) return null;
  const s = seriesData as unknown as SeriesRow;

  const { data: revData, error: revErr } = await db
    .from(REV_TABLE)
    .select(REV_META_COLS)
    .eq("tenant_id", tenantId)
    .eq("series_id", seriesId)
    .order("revision", { ascending: false });
  if (revErr) throw revErr;
  const revs = (revData ?? []) as unknown as RevMetaRow[];

  const sourceTitles = await labelMap(db, tenantId, SOURCES_TABLE, [s.source_id], "title");
  const passageLocators = await labelMap(db, tenantId, PASSAGES_TABLE, [s.passage_id], "locator_label");

  const base = toSeriesListItem(s, revs, sourceTitles, passageLocators);
  if (!base) return null;

  const revisions: MethodRevisionListItem[] = revs.map((r) => ({
    id: r.id,
    series_id: r.series_id,
    revision: r.revision,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return { ...base, revisions };
}

// ------------------------------------------------------------------
// Revizyon geçmişi (yalnız meta) — seri yoksa null (404)
// ------------------------------------------------------------------

export async function listMethodRevisions(
  db: SupabaseClient,
  tenantId: string,
  seriesId: string,
): Promise<MethodRevisionListItem[] | null> {
  const { data: seriesData, error: sErr } = await db
    .from(SERIES_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", seriesId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!seriesData) return null;

  const { data, error } = await db
    .from(REV_TABLE)
    .select(REV_META_COLS)
    .eq("tenant_id", tenantId)
    .eq("series_id", seriesId)
    .order("revision", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as RevMetaRow[]).map((r) => ({
    id: r.id,
    series_id: r.series_id,
    revision: r.revision,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

// ------------------------------------------------------------------
// Tek revizyon tam içeriği — seri+tenant+revizyon eşleşmezse null (404)
// ------------------------------------------------------------------

export async function getMethodRevision(
  db: SupabaseClient,
  tenantId: string,
  seriesId: string,
  revisionId: string,
): Promise<MethodRevisionDetail | null> {
  const { data, error } = await db
    .from(REV_TABLE)
    .select(REV_DETAIL_COLS)
    .eq("tenant_id", tenantId)
    .eq("series_id", seriesId)
    .eq("id", revisionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const r = data as unknown as Record<string, unknown>;
  return {
    id: r.id as string,
    series_id: r.series_id as string,
    revision: r.revision as number,
    status: r.status as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    plant_part_used: (r.plant_part_used as string | null) ?? null,
    material_state: (r.material_state as string | null) ?? null,
    method_text: r.method_text as string,
    equipment: (r.equipment as string | null) ?? null,
    amount_ratio: (r.amount_ratio as string | null) ?? null,
    solvent_carrier: (r.solvent_carrier as string | null) ?? null,
    duration_text: (r.duration_text as string | null) ?? null,
    temperature_text: (r.temperature_text as string | null) ?? null,
    steps: normalizeSteps(r.steps),
    filtration: (r.filtration as string | null) ?? null,
    resting: (r.resting as string | null) ?? null,
    storage: (r.storage as string | null) ?? null,
    quality_notes: (r.quality_notes as string | null) ?? null,
    safety_notes: (r.safety_notes as string | null) ?? null,
    note_hash: r.note_hash as string,
  };
}

/** Preparat varlık/tenant kontrolü (methods GET route'unun 404 kararı için). */
export async function preparationExists(
  db: SupabaseClient,
  tenantId: string,
  preparationId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from(PREP_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", preparationId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
