import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnowledgeAuditEvent,
  KnowledgePassageLink,
  KnowledgePopulationItem,
  KnowledgeRecordDetail,
  KnowledgeRecordListItem,
  KnowledgeRelationLink,
  KnowledgeRouteItem,
  KnowledgeSourceLink,
  PreparationListItem,
} from "@/lib/aromaterapi/readTypes";
import {
  buildSearchNormIlike,
  UUID_RE,
  type ParsedListParams,
} from "@/lib/aromaterapi/service/readValidation";

/**
 * Aromaterapi V2 — C3C Bilgi Kayıtları (claims) okuma servisi.
 *
 * server-only + tenant-scoped SELECT. C2T mutation yolu (create/update RPC)
 * bu dosyada YOKTUR; yalnız okuma. Detay ilişkileri (rotalar/popülasyonlar/
 * kaynaklar/pasajlar/ilişkiler) API çıktısında AYRI anahtarlarla döner. Bağlı
 * kaynak ve pasajların aynı tenant kapsamında olduğu FK + tenant filtresiyle
 * garanti edilir. Kullanıcıya "claim" terimi gösterilmez (UI: "Bilgi Kayıtları").
 */

const CLAIMS_TABLE = "aromatherapy_claims";
const ROUTES_TABLE = "aromatherapy_claim_routes";
const POPULATIONS_TABLE = "aromatherapy_claim_populations";
const CLAIM_SOURCES_TABLE = "aromatherapy_claim_sources";
const CLAIM_PASSAGES_TABLE = "aromatherapy_claim_passages";
const RELATIONS_TABLE = "aromatherapy_claim_relations";
const AUDIT_TABLE = "aromatherapy_claim_audit_events";
const PREP_TABLE = "aromatherapy_preparations";
const TAXA_TABLE = "aromatherapy_plant_taxa";
const SOURCES_TABLE = "aromatherapy_sources";
const PASSAGES_TABLE = "aromatherapy_source_passages";

export const CLAIM_TYPES = ["safety", "use", "identity", "chemistry"] as const;
export const CLAIM_STATUS = ["draft", "under_review", "needs_verification"] as const;
export const EVIDENCE_LAYERS = [
  "regulatory",
  "scientific_review",
  "clinical",
  "experimental",
  "traditional",
  "experiential",
  "energetic",
] as const;
export const RATIONALE_STATUS = ["from_source", "source_gives_no_rationale"] as const;

// Arama: generated `search_norm` = normalize(conclusion, rationale, preparation_context)
// — migration 20261003000000. Eski çok-kolon .ilike kapsamı korunur.
const CLAIM_LIST_COLS =
  "id, claim_type, conclusion, conclusion_provenance, evidence_layer, rationale_status, status, safety_topic, outcome_type, preparation_id, preparation_context, updated_at";
const CLAIM_DETAIL_COLS =
  "id, claim_type, safety_topic, route, preparation_context, conclusion, conclusion_provenance, outcome_type, evidence_layer, rationale, rationale_status, status, preparation_id, created_at, updated_at";

const SAFETY_TOPIC_RE = /^[a-z][a-z0-9_]*$/;

export function isSafetyTopic(value: string): boolean {
  return SAFETY_TOPIC_RE.test(value);
}

// ------------------------------------------------------------------
// Bilgi Kayıtları listesi (+ preparat özeti)
// ------------------------------------------------------------------

export async function listKnowledgeRecords(
  db: SupabaseClient,
  tenantId: string,
  p: ParsedListParams,
  extra: { preparationId?: string; safetyTopic?: string },
): Promise<{ rows: KnowledgeRecordListItem[]; total: number }> {
  let query = db
    .from(CLAIMS_TABLE)
    .select(CLAIM_LIST_COLS, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (p.q) query = query.or(buildSearchNormIlike(p.q));
  for (const [col, val] of Object.entries(p.equals)) query = query.eq(col, val);
  if (extra.preparationId) query = query.eq("preparation_id", extra.preparationId);
  if (extra.safetyTopic) query = query.eq("safety_topic", extra.safetyTopic);

  const { data, error, count } = await query
    .order(p.sort.column, { ascending: p.sort.ascending })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) throw error;

  const base = (data ?? []) as unknown as Omit<
    KnowledgeRecordListItem,
    "preparation_type" | "taxon_canonical_name"
  >[];
  const prep = await preparationSummaryMap(
    db,
    tenantId,
    base.map((r) => r.preparation_id),
  );
  const rows = base.map((r) => {
    const s = prep.get(r.preparation_id);
    return {
      ...r,
      preparation_type: s?.preparation_type ?? null,
      taxon_canonical_name: s?.taxon_canonical_name ?? null,
    };
  });
  return { rows, total: count ?? 0 };
}

// ------------------------------------------------------------------
// Bilgi Kaydı detay (+ ayrı ilişki dizileri)
// ------------------------------------------------------------------

export async function getKnowledgeRecord(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<KnowledgeRecordDetail | null> {
  const { data, error } = await db
    .from(CLAIMS_TABLE)
    .select(CLAIM_DETAIL_COLS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const core = data as unknown as Omit<
    KnowledgeRecordDetail,
    "preparation" | "routes" | "populations" | "sources" | "passages" | "relations"
  >;

  const [routes, populations, sources, passages, relations, preparation] = await Promise.all([
    listRoutes(db, tenantId, id),
    listPopulations(db, tenantId, id),
    listClaimSources(db, tenantId, id),
    listClaimPassages(db, tenantId, id),
    listRelations(db, tenantId, id),
    preparationListItem(db, tenantId, core.preparation_id),
  ]);

  return { ...core, preparation, routes, populations, sources, passages, relations };
}

// ------------------------------------------------------------------
// Değişiklik Geçmişi (audit) — salt-okunur; out-of-tenant claim → null (404)
// ------------------------------------------------------------------

export async function listKnowledgeAudit(
  db: SupabaseClient,
  tenantId: string,
  claimId: string,
  p: ParsedListParams,
): Promise<{ rows: KnowledgeAuditEvent[]; total: number } | null> {
  const { data: claim, error: cErr } = await db
    .from(CLAIMS_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", claimId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!claim) return null;

  const { data, error, count } = await db
    .from(AUDIT_TABLE)
    .select(
      "id, occurred_at, operation, actor_label_snapshot, reason, previous_state, new_state, warnings",
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .eq("claim_id", claimId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) throw error;

  return { rows: (data ?? []) as unknown as KnowledgeAuditEvent[], total: count ?? 0 };
}

// ------------------------------------------------------------------
// İlişki yükleyicileri (hepsi tenant-scoped)
// ------------------------------------------------------------------

async function listRoutes(
  db: SupabaseClient,
  tenantId: string,
  claimId: string,
): Promise<KnowledgeRouteItem[]> {
  const { data, error } = await db
    .from(ROUTES_TABLE)
    .select("id, route_code")
    .eq("tenant_id", tenantId)
    .eq("claim_id", claimId)
    .order("route_code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as KnowledgeRouteItem[];
}

async function listPopulations(
  db: SupabaseClient,
  tenantId: string,
  claimId: string,
): Promise<KnowledgePopulationItem[]> {
  const { data, error } = await db
    .from(POPULATIONS_TABLE)
    .select("id, population_code, age_min, age_max")
    .eq("tenant_id", tenantId)
    .eq("claim_id", claimId)
    .order("population_code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as KnowledgePopulationItem[];
}

async function listClaimSources(
  db: SupabaseClient,
  tenantId: string,
  claimId: string,
): Promise<KnowledgeSourceLink[]> {
  const { data, error } = await db
    .from(CLAIM_SOURCES_TABLE)
    .select(
      "id, source_id, source_role, verification_status, locator_text, source_original_excerpt, faithful_translation",
    )
    .eq("tenant_id", tenantId)
    .eq("claim_id", claimId)
    .order("source_role", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  const base = (data ?? []) as unknown as Omit<KnowledgeSourceLink, "source_title">[];
  const titles = await titleMap(db, tenantId, SOURCES_TABLE, "title", base.map((r) => r.source_id));
  return base.map((r) => ({ ...r, source_title: titles.get(r.source_id) ?? null }));
}

async function listClaimPassages(
  db: SupabaseClient,
  tenantId: string,
  claimId: string,
): Promise<KnowledgePassageLink[]> {
  const { data, error } = await db
    .from(CLAIM_PASSAGES_TABLE)
    .select("id, passage_id, passage_kind, evidence_relation, verification_status")
    .eq("tenant_id", tenantId)
    .eq("claim_id", claimId)
    .order("evidence_relation", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  const base = (data ?? []) as unknown as Omit<KnowledgePassageLink, "passage_locator_label">[];
  const labels = await titleMap(
    db,
    tenantId,
    PASSAGES_TABLE,
    "locator_label",
    base.map((r) => r.passage_id),
  );
  return base.map((r) => ({
    ...r,
    passage_locator_label: labels.get(r.passage_id) ?? null,
  }));
}

async function listRelations(
  db: SupabaseClient,
  tenantId: string,
  claimId: string,
): Promise<KnowledgeRelationLink[]> {
  // claimId doğrulanmış UUID → .or() enjeksiyonu mümkün değil.
  const { data, error } = await db
    .from(RELATIONS_TABLE)
    .select("id, a_claim_id, b_claim_id, relation_type, explanation_tr")
    .eq("tenant_id", tenantId)
    .or(`a_claim_id.eq.${claimId},b_claim_id.eq.${claimId}`)
    .order("relation_type", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as KnowledgeRelationLink[];
}

// ------------------------------------------------------------------
// Preparat özeti yardımcıları
// ------------------------------------------------------------------

async function preparationListItem(
  db: SupabaseClient,
  tenantId: string,
  preparationId: string,
): Promise<PreparationListItem | null> {
  const { data, error } = await db
    .from(PREP_TABLE)
    .select("id, taxon_id, preparation_type, plant_part, chemotype, status, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", preparationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const prep = data as unknown as Omit<PreparationListItem, "taxon_canonical_name">;
  const names = await titleMap(db, tenantId, TAXA_TABLE, "canonical_name", [prep.taxon_id]);
  return { ...prep, taxon_canonical_name: names.get(prep.taxon_id) ?? null };
}

async function preparationSummaryMap(
  db: SupabaseClient,
  tenantId: string,
  preparationIds: string[],
): Promise<Map<string, { preparation_type: string; taxon_canonical_name: string | null }>> {
  const unique = Array.from(new Set(preparationIds.filter(Boolean)));
  const map = new Map<string, { preparation_type: string; taxon_canonical_name: string | null }>();
  if (unique.length === 0) return map;

  const { data, error } = await db
    .from(PREP_TABLE)
    .select("id, preparation_type, taxon_id")
    .eq("tenant_id", tenantId)
    .in("id", unique);
  if (error) throw error;

  const preps = (data ?? []) as { id: string; preparation_type: string; taxon_id: string }[];
  const names = await titleMap(
    db,
    tenantId,
    TAXA_TABLE,
    "canonical_name",
    preps.map((r) => r.taxon_id),
  );
  for (const r of preps) {
    map.set(r.id, {
      preparation_type: r.preparation_type,
      taxon_canonical_name: names.get(r.taxon_id) ?? null,
    });
  }
  return map;
}

/** Genel amaçlı id → tek metin kolonu haritası (tenant-scoped, tek sorgu). */
async function titleMap(
  db: SupabaseClient,
  tenantId: string,
  table: string,
  column: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x) => typeof x === "string" && UUID_RE.test(x))));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .eq("tenant_id", tenantId)
    .in("id", unique);
  if (error) throw error;

  for (const r of (data ?? []) as unknown as Record<string, string>[]) {
    map.set(r.id, r[column]);
  }
  return map;
}
