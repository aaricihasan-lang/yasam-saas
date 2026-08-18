/**
 * Aromaterapi Word export — TENANT-GÜVENLİ sunucu okumaları.
 * db = guard.db (service_role); tenantId DAİMA guard'dan (istemci override edemez).
 * Tüm sorgular `.eq("tenant_id", tenantId)` + `.eq("is_active", true)` (soft-deleted YOK).
 * "all" okumaları CHUNK'lı → sessiz kesme YOK (gelecekte 1000+ güvenli).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPORT_READ_CHUNK } from "./theme";

export interface OilExportRow {
  id: string; tenant_id: string | null; name: string; latin_name: string | null; english_name: string | null;
  oil_type: string; category: string | null; extraction_method: string | null; plant_part: string | null;
  origin: string | null; shelf_life: string | null; aroma_profile: string | null; aroma_note: string | null;
  color: string | null; consistency: string | null; is_photosensitive: boolean | null; main_components: string | null;
  therapeutic_properties: string[] | null; emotional_benefits: string | null; spiritual_benefits: string | null;
  physical_benefits: string | null; skin_benefits: string | null; benefits: string | null; diffuser_usage: string | null;
  massage_usage: string | null; usage_methods: string | null; dilution_ratio: string | null;
  blends_well_with: string[] | null; target_systems: string[] | null; chakra_connection: string | null;
  element_connection: string | null; safety_notes: string | null; contraindications: string | null;
  notes: string | null; source: string | null; origin_type: string | null; origin_label: string | null;
  created_at: string | null; updated_at: string | null;
}

export interface BlendItemSnapshot {
  oil_id: string | null; oil_name: string; latin_name: string; oil_type: string; drops: number;
  is_photosensitive: boolean; contraindications: string; safety_notes: string;
}
export interface BlendExportRow {
  id: string; tenant_id: string | null; name: string; notes: string | null; carrier_oil_id: string | null;
  carrier_oil_name: string | null; bottle_ml: number; dilution_percent: number; drops_per_ml: number;
  total_drops: number; items: BlendItemSnapshot[]; is_active: boolean; created_at: string | null; updated_at: string | null;
}

export type ExportSelector = { mode: "selected"; ids: string[] } | { mode: "all"; oilType?: string | null };

/**
 * Chunk'lı tenant-scoped okuma. selected → tek `.in` (ids ≤ MAX_SELECTED_IDS); all →
 * name,id sıralı sayfalı okuma tam bitene kadar (deterministik, kesme yok).
 */
async function readAll<T>(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  sel: ExportSelector,
  order: { column: string; ascending: boolean }[],
  opts?: { activeOnly?: boolean; select?: string },
): Promise<{ rows: T[]; error: string | null }> {
  const activeOnly = opts?.activeOnly !== false; // varsayılan true (oils/blends soft-delete)
  const base = () => {
    let q = db.from(table).select(opts?.select ?? "*").eq("tenant_id", tenantId);
    if (activeOnly) q = q.eq("is_active", true);
    if (sel.mode === "all" && sel.oilType) q = q.eq("oil_type", sel.oilType);
    for (const o of order) q = q.order(o.column, { ascending: o.ascending });
    return q;
  };

  if (sel.mode === "selected") {
    const { data, error } = await base().in("id", sel.ids);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as T[], error: null };
  }

  // all → chunked range paging
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await base().range(from, from + EXPORT_READ_CHUNK - 1);
    if (error) return { rows: [], error: error.message };
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < EXPORT_READ_CHUNK) break;
    from += EXPORT_READ_CHUNK;
  }
  return { rows: out, error: null };
}

export function readOilsForExport(db: SupabaseClient, tenantId: string, sel: ExportSelector) {
  return readAll<OilExportRow>(db, "aromatherapy_oils", tenantId, sel, [
    { column: "oil_type", ascending: true },
    { column: "name", ascending: true },
    { column: "id", ascending: true },
  ]);
}

export function readBlendsForExport(db: SupabaseClient, tenantId: string, sel: ExportSelector) {
  return readAll<BlendExportRow>(db, "aromatherapy_blends", tenantId, sel, [
    { column: "name", ascending: true },
    { column: "id", ascending: true },
  ]);
}

/** Tek yağ (detay export) — tam alan, tenant-scoped, IDOR-güvenli. */
export async function readOneOil(db: SupabaseClient, tenantId: string, id: string): Promise<{ row: OilExportRow | null; error: string | null }> {
  const { data, error } = await db.from("aromatherapy_oils").select("*").eq("tenant_id", tenantId).eq("id", id).eq("is_active", true).maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as OilExportRow) ?? null, error: null };
}

export async function readOneBlend(db: SupabaseClient, tenantId: string, id: string): Promise<{ row: BlendExportRow | null; error: string | null }> {
  const { data, error } = await db.from("aromatherapy_blends").select("*").eq("tenant_id", tenantId).eq("id", id).eq("is_active", true).maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as BlendExportRow) ?? null, error: null };
}

// ─── Status-tabanlı kaynaklar (taxa/preparations/methods/knowledge/sources/glossary) ──
// Bu tablolar is_active KULLANMAZ (status lifecycle; soft-delete YOK) → activeOnly:false.

/** Sınırlı-eşzamanlı map (detay okumaları için; N sıralı round-trip yerine kontrollü paralellik). */
export async function mapBounded<T, R>(items: T[], fn: (t: T, i: number) => Promise<R>, concurrency = 8): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Yalnız id listesi (chunk'lı, tenant-scoped) — detayları service getX ile çekmek için. */
export async function collectIds(
  db: SupabaseClient, table: string, tenantId: string, sel: ExportSelector,
  order: { column: string; ascending: boolean }[], opts?: { activeOnly?: boolean },
): Promise<{ ids: string[]; error: string | null }> {
  const { rows, error } = await readAll<{ id: string }>(db, table, tenantId, sel, order, { activeOnly: opts?.activeOnly ?? false, select: "id" });
  if (error) return { ids: [], error };
  return { ids: rows.map((r) => r.id), error: null };
}

/** Tam-kolon status-tablo okuması (taxa/preparations/glossary — detay≈satır). */
export function readStatusTable<T>(
  db: SupabaseClient, table: string, tenantId: string, sel: ExportSelector,
  order: { column: string; ascending: boolean }[],
) {
  return readAll<T>(db, table, tenantId, sel, order, { activeOnly: false });
}
