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

// ==================================================================
// ARO-010 — Rapor TOPLU okuma (N+1 fan-out azaltma).
//
// getKnowledgeRecord ile AYNI veri/sıra/tenant sözleşmesini korur; yalnız tek-kayıt
// başına ayrı sorgular yerine çoklu-id KÜME sorguları çalıştırıp parent→child
// gruplamayı bellek içinde yapar. Tek-kayıt fonksiyonları (API detay route'ları
// tarafından kullanılan) DEĞİŞTİRİLMEZ; bu yalnız EK bir okuma yoludur.
// Her sorgu `.eq("tenant_id", tenantId)`; child'lar yalnız var olan (tenant'a ait)
// claim id'lerine bağlanır → çapraz-tenant/çapraz-kayıt sızıntı yok. Herhangi bir
// hata THROW eder → çağıran kontrollü {error}'a indirger (fail-closed korunur).
// ==================================================================

/** `.in(...)` küme boyutu — EXPORT_READ_CHUNK ile hizalı; oversized query/URL taşmasını önler. */
const REPORT_IN_CHUNK = 500;
/** Aralık sayfası — child `.in` okumalarında sessiz 1000-satır kesmesini önler (fail-closed). */
const REPORT_READ_PAGE = 1000;

type ClaimCore = Omit<
  KnowledgeRecordDetail,
  "preparation" | "routes" | "populations" | "sources" | "passages" | "relations"
>;
type OrderCol = { col: string; asc: boolean };

function chunkIds<T>(arr: T[], size = REPORT_IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = r[key] as string;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

/**
 * Parent-id kümesine göre TÜM child satırlarını (tenant-scoped, chunk'lı + sayfalı)
 * çeker. Sayfa boyutu dolduğu sürece ilerler → sessiz kesme YOK. `order` her sorguya
 * uygulanır; `id` tiebreak sayfalama tutarlılığını garanti eder (tanımlı asıl sıralama
 * değişmez, yalnız eşitlik durumları determinize olur).
 */
async function fetchChildrenIn(
  db: SupabaseClient,
  tenantId: string,
  table: string,
  cols: string,
  parentCol: string,
  parentIds: string[],
  order: OrderCol[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const ch of chunkIds(parentIds)) {
    if (ch.length === 0) continue;
    let from = 0;
    for (;;) {
      let q = db.from(table).select(cols).eq("tenant_id", tenantId).in(parentCol, ch);
      for (const o of order) q = q.order(o.col, { ascending: o.asc });
      const { data, error } = await q.range(from, from + REPORT_READ_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      out.push(...rows);
      if (rows.length < REPORT_READ_PAGE) break;
      from += REPORT_READ_PAGE;
    }
  }
  return out;
}

/** Chunk'lı id → tek metin kolonu haritası (titleMap'in çoklu-küme, sayfasız eşi). */
async function titleMapMany(
  db: SupabaseClient,
  tenantId: string,
  table: string,
  column: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x) => typeof x === "string" && UUID_RE.test(x))));
  const map = new Map<string, string>();
  for (const ch of chunkIds(unique)) {
    if (ch.length === 0) continue;
    const { data, error } = await db.from(table).select(`id, ${column}`).eq("tenant_id", tenantId).in("id", ch);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as Record<string, string>[]) map.set(r.id, r[column]);
  }
  return map;
}

/** claimId kümesine bağlı ilişkileri (a/b iki uçtan) toplar; dedup + (relation_type,id) sıralı gruplar. */
async function relationsByClaim(
  db: SupabaseClient,
  tenantId: string,
  claimIds: string[],
): Promise<Map<string, KnowledgeRelationLink[]>> {
  // claimIds DB'den gelen doğrulanmış UUID'lerdir → .or() içine güvenli interpolasyon.
  const dedup = new Map<string, KnowledgeRelationLink>();
  for (const ch of chunkIds(claimIds)) {
    if (ch.length === 0) continue;
    const list = ch.join(",");
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from(RELATIONS_TABLE)
        .select("id, a_claim_id, b_claim_id, relation_type, explanation_tr")
        .eq("tenant_id", tenantId)
        .or(`a_claim_id.in.(${list}),b_claim_id.in.(${list})`)
        .order("relation_type", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + REPORT_READ_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as KnowledgeRelationLink[];
      for (const r of rows) dedup.set(r.id, r);
      if (rows.length < REPORT_READ_PAGE) break;
      from += REPORT_READ_PAGE;
    }
  }
  const sorted = Array.from(dedup.values()).sort((a, b) =>
    a.relation_type < b.relation_type ? -1 : a.relation_type > b.relation_type ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const map = new Map<string, KnowledgeRelationLink[]>();
  const present = new Set(claimIds);
  const push = (cid: string, r: KnowledgeRelationLink) => {
    const l = map.get(cid);
    if (l) l.push(r);
    else map.set(cid, [r]);
  };
  for (const r of sorted) {
    if (present.has(r.a_claim_id)) push(r.a_claim_id, r);
    if (r.b_claim_id !== r.a_claim_id && present.has(r.b_claim_id)) push(r.b_claim_id, r);
  }
  return map;
}

/** preparation_id kümesi → PreparationListItem haritası (preparationListItem'in toplu eşi). */
async function preparationListItemsByIds(
  db: SupabaseClient,
  tenantId: string,
  preparationIds: string[],
): Promise<Map<string, PreparationListItem>> {
  const unique = Array.from(new Set(preparationIds.filter((x) => typeof x === "string" && UUID_RE.test(x))));
  const map = new Map<string, PreparationListItem>();
  if (unique.length === 0) return map;

  const rows: (Omit<PreparationListItem, "taxon_canonical_name">)[] = [];
  for (const ch of chunkIds(unique)) {
    const { data, error } = await db
      .from(PREP_TABLE)
      .select("id, taxon_id, preparation_type, plant_part, chemotype, status, updated_at")
      .eq("tenant_id", tenantId)
      .in("id", ch);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Omit<PreparationListItem, "taxon_canonical_name">[]));
  }
  const names = await titleMapMany(db, tenantId, TAXA_TABLE, "canonical_name", rows.map((r) => r.taxon_id));
  for (const r of rows) map.set(r.id, { ...r, taxon_canonical_name: names.get(r.taxon_id) ?? null });
  return map;
}

/**
 * TOPLU Bilgi Kaydı detayları — getKnowledgeRecord ile eşdeğer çıktı, `ids` sırasını
 * korur ve bulunamayan (tenant dışı/silinmiş) id'leri atlar (mapBounded+filter davranışı).
 */
export async function getKnowledgeRecordsByIds(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<KnowledgeRecordDetail[]> {
  if (ids.length === 0) return [];

  // 1) Çekirdek claim satırları (küme, chunk'lı).
  const coreById = new Map<string, ClaimCore>();
  for (const ch of chunkIds(ids)) {
    if (ch.length === 0) continue;
    const { data, error } = await db.from(CLAIMS_TABLE).select(CLAIM_DETAIL_COLS).eq("tenant_id", tenantId).in("id", ch);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as ClaimCore[]) coreById.set(row.id, row);
  }
  const presentIds = Array.from(coreById.keys());
  if (presentIds.length === 0) return [];

  // 2) Child kümeleri (parent = yalnız var olan claim id'leri) — her biri tek küme sorgusu.
  const routesByClaim = groupBy(
    await fetchChildrenIn(db, tenantId, ROUTES_TABLE, "id, claim_id, route_code", "claim_id", presentIds, [
      { col: "route_code", asc: true },
      { col: "id", asc: true },
    ]),
    "claim_id",
  );
  const popsByClaim = groupBy(
    await fetchChildrenIn(
      db,
      tenantId,
      POPULATIONS_TABLE,
      "id, claim_id, population_code, age_min, age_max",
      "claim_id",
      presentIds,
      [
        { col: "population_code", asc: true },
        { col: "id", asc: true },
      ],
    ),
    "claim_id",
  );
  const claimSourceRows = await fetchChildrenIn(
    db,
    tenantId,
    CLAIM_SOURCES_TABLE,
    "id, claim_id, source_id, source_role, verification_status, locator_text, source_original_excerpt, faithful_translation",
    "claim_id",
    presentIds,
    [
      { col: "source_role", asc: true },
      { col: "id", asc: true },
    ],
  );
  const claimPassageRows = await fetchChildrenIn(
    db,
    tenantId,
    CLAIM_PASSAGES_TABLE,
    "id, claim_id, passage_id, passage_kind, evidence_relation, verification_status",
    "claim_id",
    presentIds,
    [
      { col: "evidence_relation", asc: true },
      { col: "id", asc: true },
    ],
  );

  // 3) Bağlı etiketler + preparat + ilişkiler (hepsi tek küme sorgusu).
  const sourceTitles = await titleMapMany(db, tenantId, SOURCES_TABLE, "title", claimSourceRows.map((r) => r.source_id as string));
  const passageLabels = await titleMapMany(db, tenantId, PASSAGES_TABLE, "locator_label", claimPassageRows.map((r) => r.passage_id as string));
  const relByClaim = await relationsByClaim(db, tenantId, presentIds);
  const prepMap = await preparationListItemsByIds(
    db,
    tenantId,
    Array.from(coreById.values()).map((c) => c.preparation_id),
  );

  // Child satırlarını claim'e göre tipli link'lere indir (grup içi sıra korunur).
  const sourcesByClaim = new Map<string, KnowledgeSourceLink[]>();
  for (const r of claimSourceRows) {
    const link: KnowledgeSourceLink = {
      id: r.id as string,
      source_id: r.source_id as string,
      source_role: r.source_role as string,
      verification_status: r.verification_status as string,
      locator_text: (r.locator_text as string | null) ?? null,
      source_original_excerpt: (r.source_original_excerpt as string | null) ?? null,
      faithful_translation: (r.faithful_translation as string | null) ?? null,
      source_title: sourceTitles.get(r.source_id as string) ?? null,
    };
    const cid = r.claim_id as string;
    const l = sourcesByClaim.get(cid);
    if (l) l.push(link);
    else sourcesByClaim.set(cid, [link]);
  }
  const passagesByClaim = new Map<string, KnowledgePassageLink[]>();
  for (const r of claimPassageRows) {
    const link: KnowledgePassageLink = {
      id: r.id as string,
      passage_id: r.passage_id as string,
      passage_kind: r.passage_kind as string,
      evidence_relation: r.evidence_relation as string,
      verification_status: r.verification_status as string,
      passage_locator_label: passageLabels.get(r.passage_id as string) ?? null,
    };
    const cid = r.claim_id as string;
    const l = passagesByClaim.get(cid);
    if (l) l.push(link);
    else passagesByClaim.set(cid, [link]);
  }

  // 4) `ids` sırasında birleştir (bulunamayan id → atla).
  const out: KnowledgeRecordDetail[] = [];
  for (const id of ids) {
    const core = coreById.get(id);
    if (!core) continue;
    out.push({
      ...core,
      preparation: prepMap.get(core.preparation_id) ?? null,
      routes: (routesByClaim.get(id) ?? []).map((r) => ({ id: r.id as string, route_code: r.route_code as string })),
      populations: (popsByClaim.get(id) ?? []).map((r) => ({
        id: r.id as string,
        population_code: r.population_code as string,
        age_min: (r.age_min as number | null) ?? null,
        age_max: (r.age_max as number | null) ?? null,
      })),
      sources: sourcesByClaim.get(id) ?? [],
      passages: passagesByClaim.get(id) ?? [],
      relations: relByClaim.get(id) ?? [],
    });
  }
  return out;
}
