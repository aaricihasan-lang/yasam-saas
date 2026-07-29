import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PlantTaxonDetail,
  PlantTaxonListItem,
  PreparationDetail,
  PreparationListItem,
} from "@/lib/aromaterapi/readTypes";
import {
  buildOrIlike,
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

const TAXA_SEARCH_COLS = [
  "canonical_name",
  "genus",
  "species",
  "family",
  "author_citation",
] as const;

const TAXA_LIST_COLS =
  "id, canonical_name, genus, species, taxon_rank, family, author_citation, is_hybrid, status, updated_at";
const TAXA_DETAIL_COLS = `${TAXA_LIST_COLS}, infraspecific_epithet, created_at`;
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

  if (p.q) query = query.or(buildOrIlike(TAXA_SEARCH_COLS, p.q));
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
  if (p.q) query = query.or(buildOrIlike(["preparation_type", "plant_part", "chemotype"], p.q));
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
