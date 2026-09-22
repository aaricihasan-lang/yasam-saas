import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PlantTaxonDetail,
  PlantTaxonListItem,
  PreparationDetail,
  PreparationListItem,
} from "@/lib/aromaterapi/readTypes";
import {
  buildSearchNormIlike,
  type ParsedListParams,
} from "@/lib/aromaterapi/service/readValidation";

/**
 * Aromaterapi V2 — C3C Katalog (Bitki/takson + Preparat) okuma servisi.
 *
 * server-only: service_role Supabase istemcisi (guard.db) YALNIZ burada kullanılır.
 * Her sorgu doğrulanmış oturum tenantId'siyle `.eq("tenant_id", tenantId)` filtrelenir;
 * tenant istemciden ASLA gelmez. Mutation YOKTUR (yalnız SELECT). Ham hata fırlatılır
 * ve route katmanında güvenli 500'e çevrilir.
 */

const TAXA_TABLE = "aromatherapy_plant_taxa";
const PREP_TABLE = "aromatherapy_preparations";
const CLAIMS_TABLE = "aromatherapy_claims";

export const PLANT_TAXA_STATUS = ["draft", "verified", "approved"] as const;
export const PREPARATION_STATUS = ["draft", "verified", "approved"] as const;
export const PREPARATION_TYPES = [
  "essential_oil",
  "hydrosol",
  "dried_plant_material",
  "tincture",
  "infusion",
  "decoction",
  "extract",
  "infused_oil",
  "absolute",
  "concrete",
  "resinoid",
  "oleoresin",
  "fixed_oil",
  "powder",
  "other",
] as const;

// Arama: generated `search_norm` = normalize(genus, species, infraspecific_epithet,
// family, author_citation) — canonical_name'in tüm token'larını kapsar. Migration
// 20261003000000. Eski çok-kolon .ilike kapsamı korunur.

const TAXA_LIST_COLS =
  "id, canonical_name, genus, species, taxon_rank, family, author_citation, is_hybrid, status, updated_at";
const TAXA_DETAIL_COLS = `${TAXA_LIST_COLS}, infraspecific_epithet, primary_common_name_tr, created_at`;
const PREP_LIST_COLS =
  "id, taxon_id, preparation_type, plant_part, chemotype, status, updated_at";

// ------------------------------------------------------------------
// Bitki (takson) listesi
// ------------------------------------------------------------------

export async function listPlantTaxa(
  db: SupabaseClient,
  tenantId: string,
  p: ParsedListParams,
): Promise<{ rows: PlantTaxonListItem[]; total: number }> {
  let query = db
    .from(TAXA_TABLE)
    .select(TAXA_LIST_COLS, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (p.q) query = query.or(buildSearchNormIlike(p.q));
  for (const [col, val] of Object.entries(p.equals)) query = query.eq(col, val);

  const { data, error, count } = await query
    .order(p.sort.column, { ascending: p.sort.ascending })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);

  if (error) throw error;
  return { rows: (data ?? []) as unknown as PlantTaxonListItem[], total: count ?? 0 };
}

// ------------------------------------------------------------------
// Bitki (takson) detay + bağlı preparat özeti
// ------------------------------------------------------------------

export async function getPlantTaxon(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ taxon: PlantTaxonDetail; preparations: PreparationListItem[] } | null> {
  const { data, error } = await db
    .from(TAXA_TABLE)
    .select(TAXA_DETAIL_COLS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: preps, error: prepErr } = await db
    .from(PREP_TABLE)
    .select(PREP_LIST_COLS)
    .eq("tenant_id", tenantId)
    .eq("taxon_id", id)
    .order("preparation_type", { ascending: true })
    .order("id", { ascending: true })
    .range(0, 199);

  if (prepErr) throw prepErr;

  const canonicalName = (data as { canonical_name: string }).canonical_name;
  const preparations: PreparationListItem[] = ((preps ?? []) as unknown as PreparationListItem[]).map(
    (r) => ({ ...r, taxon_canonical_name: canonicalName }),
  );

  return { taxon: data as unknown as PlantTaxonDetail, preparations };
}

// ------------------------------------------------------------------
// Preparat listesi (+ bağlı takson kanonik adı)
// ------------------------------------------------------------------

export async function listPreparations(
  db: SupabaseClient,
  tenantId: string,
  p: ParsedListParams,
  taxonId?: string,
): Promise<{ rows: PreparationListItem[]; total: number }> {
  let query = db
    .from(PREP_TABLE)
    .select(PREP_LIST_COLS, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (taxonId) query = query.eq("taxon_id", taxonId);
  // search_norm = normalize(preparation_type, plant_part, chemotype) — migration 20261003000000
  if (p.q) query = query.or(buildSearchNormIlike(p.q));
  for (const [col, val] of Object.entries(p.equals)) query = query.eq(col, val);

  const { data, error, count } = await query
    .order(p.sort.column, { ascending: p.sort.ascending })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);

  if (error) throw error;

  const base = (data ?? []) as unknown as PreparationListItem[];
  const nameByTaxon = await taxonNameMap(
    db,
    tenantId,
    base.map((r) => r.taxon_id),
  );
  const rows = base.map((r) => ({
    ...r,
    taxon_canonical_name: nameByTaxon.get(r.taxon_id) ?? null,
  }));
  return { rows, total: count ?? 0 };
}

// ------------------------------------------------------------------
// Preparat detay + bağlı takson + bilgi kaydı sayısı
// ------------------------------------------------------------------

export async function getPreparation(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<PreparationDetail | null> {
  const { data, error } = await db
    .from(PREP_TABLE)
    .select(`${PREP_LIST_COLS}, created_at`)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const prep = data as unknown as PreparationListItem & { created_at: string };

  const { data: taxon, error: taxonErr } = await db
    .from(TAXA_TABLE)
    .select(TAXA_LIST_COLS)
    .eq("tenant_id", tenantId)
    .eq("id", prep.taxon_id)
    .maybeSingle();
  if (taxonErr) throw taxonErr;

  const { count, error: countErr } = await db
    .from(CLAIMS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("preparation_id", id);
  if (countErr) throw countErr;

  const taxonItem = (taxon ?? null) as unknown as PlantTaxonListItem | null;
  return {
    ...prep,
    taxon_canonical_name: taxonItem?.canonical_name ?? null,
    taxon: taxonItem,
    knowledge_record_count: count ?? 0,
  };
}

// ------------------------------------------------------------------
// Yardımcı — takson id → kanonik ad haritası (tenant-scoped, tek sorgu)
// ------------------------------------------------------------------

async function taxonNameMap(
  db: SupabaseClient,
  tenantId: string,
  taxonIds: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(taxonIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await db
    .from(TAXA_TABLE)
    .select("id, canonical_name")
    .eq("tenant_id", tenantId)
    .in("id", unique);
  if (error) throw error;

  for (const r of (data ?? []) as { id: string; canonical_name: string }[]) {
    map.set(r.id, r.canonical_name);
  }
  return map;
}

// ------------------------------------------------------------------
// TOPLU (batch) okuyucular — Word raporu N+1 azaltımı (ARO-010).
// Tekil getPlantTaxon/getPreparation'ın DAVRANIŞINI KORUR ama çok id için
// set-tabanlı .in(...) sorguları kullanır (tenant-scoped). Tekil fonksiyonlar
// API detay route'ları için DEĞİŞMEDEN kalır. Girdi id sırası korunur; eksik
// (tenant-dışı/silinmiş) id'ler atlanır (mapBounded+filter-null ile aynı).
// ------------------------------------------------------------------

const CATALOG_IN_CHUNK = 500;

function chunkCatalogIds(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += CATALOG_IN_CHUNK) out.push(ids.slice(i, i + CATALOG_IN_CHUNK));
  return out;
}

/** Çok takson id → PlantTaxonDetail[] (yalnız takson detayı; rapor preparat alt-listesini
 *  KULLANMAZ — tekil getPlantTaxon'daki preparat sorgusu bilinçli atlanır). */
export async function getPlantTaxaByIds(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<PlantTaxonDetail[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const byId = new Map<string, PlantTaxonDetail>();
  for (const chunk of chunkCatalogIds(unique)) {
    const { data, error } = await db
      .from(TAXA_TABLE)
      .select(TAXA_DETAIL_COLS)
      .eq("tenant_id", tenantId)
      .in("id", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as PlantTaxonDetail[]) byId.set(r.id, r);
  }
  return ids.map((id) => byId.get(id)).filter((t): t is PlantTaxonDetail => !!t);
}

/** Çok preparat id → PreparationDetail[] (prep + bağlı takson + bilgi kaydı sayısı),
 *  tekil getPreparation ile birebir aynı içerik; tenant-scoped; sıra korunur. */
export async function getPreparationsByIds(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<PreparationDetail[]> {
  const uniquePrepIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniquePrepIds.length === 0) return [];

  // 1) Preparat satırları
  const prepById = new Map<string, PreparationListItem & { created_at: string }>();
  for (const chunk of chunkCatalogIds(uniquePrepIds)) {
    const { data, error } = await db
      .from(PREP_TABLE)
      .select(`${PREP_LIST_COLS}, created_at`)
      .eq("tenant_id", tenantId)
      .in("id", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as (PreparationListItem & { created_at: string })[]) {
      prepById.set(r.id, r);
    }
  }

  // 2) Bağlı taksonlar (tek harita)
  const taxonIds = Array.from(
    new Set(Array.from(prepById.values()).map((p) => p.taxon_id).filter(Boolean)),
  );
  const taxonById = new Map<string, PlantTaxonListItem>();
  for (const chunk of chunkCatalogIds(taxonIds)) {
    const { data, error } = await db
      .from(TAXA_TABLE)
      .select(TAXA_LIST_COLS)
      .eq("tenant_id", tenantId)
      .in("id", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as PlantTaxonListItem[]) taxonById.set(r.id, r);
  }

  // 3) Preparat başına bilgi kaydı sayısı (claims → preparation_id gruplu, sayfalı;
  //    N adet HEAD count yerine sayfalı tek akış — 1000-satır sessiz kesme yok).
  const countByPrep = new Map<string, number>();
  const PAGE = 1000;
  for (const chunk of chunkCatalogIds([...prepById.keys()])) {
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from(CLAIMS_TABLE)
        .select("id, preparation_id")
        .eq("tenant_id", tenantId)
        .in("preparation_id", chunk)
        .order("id", { ascending: true }) // sayfalama kararlılığı (order'sız range tekrar/atlama üretebilir)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { preparation_id: string }[];
      for (const r of rows) {
        countByPrep.set(r.preparation_id, (countByPrep.get(r.preparation_id) ?? 0) + 1);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  // 4) Girdi sırasında birleştir (eksik id atlanır)
  const out: PreparationDetail[] = [];
  for (const id of ids) {
    const prep = prepById.get(id);
    if (!prep) continue;
    const taxonItem = prep.taxon_id ? taxonById.get(prep.taxon_id) ?? null : null;
    out.push({
      ...prep,
      taxon_canonical_name: taxonItem?.canonical_name ?? null,
      taxon: taxonItem,
      knowledge_record_count: countByPrep.get(id) ?? 0,
    });
  }
  return out;
}
