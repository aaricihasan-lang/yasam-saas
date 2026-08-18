/**
 * Aromaterapi Word — zengin kaynaklar için detay orkestrasyonu.
 * MEVCUT service detay-okumalarını (get*) REUSE eder (tenant-safe, RLS-doğru, drift yok);
 * id'ler tenant-scoped toplanır, detaylar SINIRLI-eşzamanlı çekilir (N+1 HTTP yok).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlantTaxon, getPreparation } from "@/lib/aromaterapi/service/catalogReads";
import { getMethodSeries, getMethodRevision } from "@/lib/aromaterapi/service/methodReads";
import { getKnowledgeRecord } from "@/lib/aromaterapi/service/claimReads";
import { getSource, getPassage } from "@/lib/aromaterapi/service/sourceReads";
import type { PlantTaxonDetail, PreparationDetail, KnowledgeRecordDetail, SourceDetail, PassageDetail } from "@/lib/aromaterapi/readTypes";
import { collectIds, readStatusTable, mapBounded, type ExportSelector } from "./reads";
import type { MethodSeriesExport } from "./render/methods";
import type { SourceExport } from "./render/sources";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";

const NAME_ID = (col: string) => [{ column: col, ascending: true }, { column: "id", ascending: true }];

/** Tenant-scoped, opsiyonel eşitlik filtreli ham id sorgusu (passages/series için). */
async function idsBy(db: SupabaseClient, table: string, tenantId: string, eqCol: string, eqVal: string, orderCol: string): Promise<string[]> {
  const { data } = await db.from(table).select("id").eq("tenant_id", tenantId).eq(eqCol, eqVal).order(orderCol, { ascending: true });
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function selectorIds(db: SupabaseClient, table: string, tenantId: string, sel: ExportSelector, orderCol: string): Promise<{ ids: string[]; error: string | null }> {
  if (sel.mode === "selected") return { ids: sel.ids, error: null };
  return collectIds(db, table, tenantId, sel, NAME_ID(orderCol), { activeOnly: false });
}

export async function fetchTaxaDetails(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: PlantTaxonDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_plant_taxa", tenantId, sel, "canonical_name");
  if (error) return { items: [], error };
  const res = await mapBounded(ids, (id) => getPlantTaxon(db, tenantId, id));
  return { items: res.map((r) => r?.taxon).filter((t): t is PlantTaxonDetail => !!t), error: null };
}

export async function fetchPreparationDetails(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: PreparationDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_preparations", tenantId, sel, "preparation_type");
  if (error) return { items: [], error };
  const res = await mapBounded(ids, (id) => getPreparation(db, tenantId, id));
  return { items: res.filter((r): r is PreparationDetail => !!r), error: null };
}

export async function fetchKnowledgeDetails(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: KnowledgeRecordDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_claims", tenantId, sel, "created_at");
  if (error) return { items: [], error };
  const res = await mapBounded(ids, (id) => getKnowledgeRecord(db, tenantId, id));
  return { items: res.filter((r): r is KnowledgeRecordDetail => !!r), error: null };
}

export async function fetchSourceExports(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: SourceExport[]; sources: SourceDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_sources", tenantId, sel, "title");
  if (error) return { items: [], sources: [], error };
  const res = await mapBounded(ids, async (id) => {
    const source = await getSource(db, tenantId, id);
    if (!source) return null;
    const passIds = await idsBy(db, "aromatherapy_source_passages", tenantId, "source_id", id, "sort_key");
    const passages = (await mapBounded(passIds, (pid) => getPassage(db, tenantId, pid))).filter((p): p is PassageDetail => !!p);
    return { source, passages };
  });
  const items = res.filter((r): r is SourceExport => !!r);
  return { items, sources: items.map((i) => i.source), error: null };
}

export async function fetchMethodExports(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: MethodSeriesExport[]; error: string | null }> {
  let seriesIds: string[];
  if (sel.mode === "selected") {
    seriesIds = sel.ids;
  } else {
    // all: preparation → series ids
    const prep = await collectIds(db, "aromatherapy_preparations", tenantId, { mode: "all" }, NAME_ID("preparation_type"), { activeOnly: false });
    if (prep.error) return { items: [], error: prep.error };
    const nested = await mapBounded(prep.ids, (pid) => idsBy(db, "aromatherapy_preparation_method_series", tenantId, "preparation_id", pid, "created_at"));
    seriesIds = nested.flat();
  }
  const res = await mapBounded(seriesIds, async (sid): Promise<MethodSeriesExport | null> => {
    const series = await getMethodSeries(db, tenantId, sid);
    if (!series) return null;
    const revId = series.verified_revision_id ?? series.latest_revision_id;
    const content = revId ? await getMethodRevision(db, tenantId, sid, revId) : null;
    return { series, content, prepLabel: null };
  });
  return { items: res.filter((r): r is MethodSeriesExport => !!r), error: null };
}

export async function fetchGlossary(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: GlossaryTermListItem[]; error: string | null }> {
  const { rows, error } = await readStatusTable<GlossaryTermListItem>(db, "aromatherapy_glossary_terms", tenantId, sel, NAME_ID("canonical_term_tr"));
  return { items: rows, error };
}
