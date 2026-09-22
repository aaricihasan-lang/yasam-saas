/**
 * Aromaterapi Word — zengin kaynaklar için detay orkestrasyonu.
 * MEVCUT service detay-okumalarını (get*) REUSE eder (tenant-safe, RLS-doğru, drift yok);
 * id'ler tenant-scoped toplanır, detaylar SINIRLI-eşzamanlı çekilir (N+1 HTTP yok).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlantTaxaByIds, getPreparationsByIds } from "@/lib/aromaterapi/service/catalogReads";
import { getMethodSeriesByIds, getMethodRevisionsByIds } from "@/lib/aromaterapi/service/methodReads";
import { getKnowledgeRecordsByIds } from "@/lib/aromaterapi/service/claimReads";
import { getSourcesByIds, getPassagesBySourceIds } from "@/lib/aromaterapi/service/sourceReads";
import type { PlantTaxonDetail, PreparationDetail, KnowledgeRecordDetail, SourceDetail } from "@/lib/aromaterapi/readTypes";
import { collectIds, readStatusTable, type ExportSelector } from "./reads";
import { EXPORT_READ_CHUNK } from "./theme";
import type { MethodSeriesExport } from "./render/methods";
import type { SourceExport } from "./render/sources";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";

const NAME_ID = (col: string) => [{ column: col, ascending: true }, { column: "id", ascending: true }];

/** Alt-servis get* THROW eder; kontrollü {error} sözleşmesine indirger (ham hata sızmaz). */
const READ_FAIL = "Kayıtlar okunurken bir hata oluştu.";

/**
 * mode=all yöntem raporu için seri id'lerini TOPLU toplar (preparat başına ayrı sorgu YOK).
 * Sıra: preparat sırası (preparation_type,id) → preparat içi created_at asc (eski
 * per-prep sıralı toplamanın flatten'ı ile birebir). chunk'lı + sayfalı → sessiz kesme YOK.
 */
async function collectSeriesIdsForPreparations(db: SupabaseClient, tenantId: string, prepIds: string[]): Promise<string[]> {
  if (prepIds.length === 0) return [];
  const byPrep = new Map<string, string[]>();
  for (let i = 0; i < prepIds.length; i += EXPORT_READ_CHUNK) {
    const ch = prepIds.slice(i, i + EXPORT_READ_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from("aromatherapy_preparation_method_series")
        .select("id, preparation_id, created_at")
        .eq("tenant_id", tenantId)
        .in("preparation_id", ch)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + EXPORT_READ_CHUNK - 1);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; preparation_id: string }[];
      for (const r of rows) {
        const l = byPrep.get(r.preparation_id);
        if (l) l.push(r.id);
        else byPrep.set(r.preparation_id, [r.id]);
      }
      if (rows.length < EXPORT_READ_CHUNK) break;
      from += EXPORT_READ_CHUNK;
    }
  }
  const out: string[] = [];
  for (const pid of prepIds) for (const sid of byPrep.get(pid) ?? []) out.push(sid);
  return out;
}

async function selectorIds(db: SupabaseClient, table: string, tenantId: string, sel: ExportSelector, orderCol: string): Promise<{ ids: string[]; error: string | null }> {
  if (sel.mode === "selected") return { ids: sel.ids, error: null };
  return collectIds(db, table, tenantId, sel, NAME_ID(orderCol), { activeOnly: false });
}

export async function fetchTaxaDetails(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: PlantTaxonDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_plant_taxa", tenantId, sel, "canonical_name");
  if (error) return { items: [], error };
  try {
    const items = await getPlantTaxaByIds(db, tenantId, ids);
    return { items, error: null };
  } catch {
    return { items: [], error: READ_FAIL };
  }
}

export async function fetchPreparationDetails(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: PreparationDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_preparations", tenantId, sel, "preparation_type");
  if (error) return { items: [], error };
  try {
    const items = await getPreparationsByIds(db, tenantId, ids);
    return { items, error: null };
  } catch {
    return { items: [], error: READ_FAIL };
  }
}

export async function fetchKnowledgeDetails(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: KnowledgeRecordDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_claims", tenantId, sel, "created_at");
  if (error) return { items: [], error };
  try {
    const items = await getKnowledgeRecordsByIds(db, tenantId, ids);
    return { items, error: null };
  } catch {
    return { items: [], error: READ_FAIL };
  }
}

export async function fetchSourceExports(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: SourceExport[]; sources: SourceDetail[]; error: string | null }> {
  const { ids, error } = await selectorIds(db, "aromatherapy_sources", tenantId, sel, "title");
  if (error) return { items: [], sources: [], error };
  try {
    const sources = await getSourcesByIds(db, tenantId, ids);
    const passagesBySource = await getPassagesBySourceIds(db, tenantId, sources.map((s) => s.id));
    const items: SourceExport[] = sources.map((source) => ({ source, passages: passagesBySource.get(source.id) ?? [] }));
    return { items, sources: items.map((i) => i.source), error: null };
  } catch {
    return { items: [], sources: [], error: READ_FAIL };
  }
}

export async function fetchMethodExports(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: MethodSeriesExport[]; error: string | null }> {
  try {
    let seriesIds: string[];
    if (sel.mode === "selected") {
      seriesIds = sel.ids;
    } else {
      // all: preparation → series ids (toplu, sıra-korur)
      const prep = await collectIds(db, "aromatherapy_preparations", tenantId, { mode: "all" }, NAME_ID("preparation_type"), { activeOnly: false });
      if (prep.error) return { items: [], error: prep.error };
      seriesIds = await collectSeriesIdsForPreparations(db, tenantId, prep.ids);
    }
    const seriesList = await getMethodSeriesByIds(db, tenantId, seriesIds);
    const revIds = seriesList
      .map((s) => s.verified_revision_id ?? s.latest_revision_id)
      .filter((x): x is string => !!x);
    const revMap = await getMethodRevisionsByIds(db, tenantId, revIds);
    const items: MethodSeriesExport[] = seriesList.map((series) => {
      const revId = series.verified_revision_id ?? series.latest_revision_id;
      return { series, content: revId ? revMap.get(revId) ?? null : null, prepLabel: null };
    });
    return { items, error: null };
  } catch {
    return { items: [], error: READ_FAIL };
  }
}

export async function fetchGlossary(db: SupabaseClient, tenantId: string, sel: ExportSelector): Promise<{ items: GlossaryTermListItem[]; error: string | null }> {
  const { rows, error } = await readStatusTable<GlossaryTermListItem>(db, "aromatherapy_glossary_terms", tenantId, sel, NAME_ID("canonical_term_tr"));
  return { items: rows, error };
}
