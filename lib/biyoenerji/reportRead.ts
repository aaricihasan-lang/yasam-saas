/**
 * Biyoenerji Word raporları — kayıt okuma (yalnız sunucu).
 *
 * BIO-01: tüm/tek okuma sayfalı + sayım doğrulamalı (readAllPaged; max-rows'ta sessiz kesilme yok).
 * A4-A: "seçili" mod — uzun id listesi URL'ye tek `.in()` olarak GİRMEZ (800+ id → 500 hatası);
 *   `chunkIds` ile parçalara bölünür, her parça sayfalı okunur, sonuçlar birleştirilip
 *   rotanın sıralamasına göre (orderCol + id) dizilir. İstenen id'lerden biri bile bulunamazsa
 *   (silinmiş / bu hesaba ait değil) rapor ÜRETİLMEZ, açık hata döner (sessiz eksik rapor yok).
 *   Aynı id iki kez istense de kayıt bir kez üretilir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPaged, chunkIds } from "@/lib/db/readAllPaged";
import { isUuid } from "@/lib/biyoenerji/uuid";

export const REPORT_ID_CHUNK = 100;

export type BioReportReadInput = {
  db: SupabaseClient;
  table: string;
  select: string;
  tenantId: string;
  orderCol: string;
  orderAsc: boolean;
  maxRows: number;
  /** "single" → singleId; "selected" → ids; diğer → tümü */
  mode: "all" | "single" | "selected";
  singleId?: string | null;
  ids?: readonly string[] | null;
  /** seçili mod üst sınırı (aşılırsa 400) */
  maxSelected: number;
};

export type BioReportReadResult<T> =
  | { ok: true; rows: T[]; truncated: boolean }
  | { ok: false; status: number; error: string; cause?: unknown };

/** Türkçe metin sıralaması (Ç/Ş/İ/Ö/Ü "Z"den sonra gelmez); zaman damgaları kod-noktası. */
const TR_COLLATOR = new Intl.Collator("tr");

function compareBy<T>(col: string, asc: boolean) {
  const cmpText = /_at$/.test(col) ? (x: string, y: string) => (x < y ? -1 : 1) : (x: string, y: string) => TR_COLLATOR.compare(x, y);
  return (a: T, b: T): number => {
    const x = (a as Record<string, unknown>)[col];
    const y = (b as Record<string, unknown>)[col];
    const xs = x === null || x === undefined ? null : String(x);
    const ys = y === null || y === undefined ? null : String(y);
    if (xs !== ys) {
      if (xs === null) return 1; // nullsFirst:false
      if (ys === null) return -1;
      const c = cmpText(xs, ys);
      if (c !== 0) return asc ? c : -c;
    }
    const ia = String((a as Record<string, unknown>).id ?? "");
    const ib = String((b as Record<string, unknown>).id ?? "");
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  };
}

export async function readBioReportRows<T extends Record<string, unknown>>(
  input: BioReportReadInput,
): Promise<BioReportReadResult<T>> {
  const { db, table, select, tenantId, orderCol, orderAsc, maxRows } = input;
  const base = () => db.from(table).select(select, { count: "exact" }).eq("tenant_id", tenantId);

  if (input.mode === "selected") {
    const raw = (input.ids ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    const requested = [...new Set(raw.map((x) => x.trim()))];
    if (requested.length === 0) {
      return { ok: false, status: 400, error: "Seçili kayıt yok." };
    }
    if (requested.length > input.maxSelected) {
      return {
        ok: false,
        status: 400,
        error: `Tek raporda en fazla ${input.maxSelected} kayıt seçilebilir (seçilen: ${requested.length}).`,
      };
    }
    // Geçersiz (uuid olmayan) id sorguya GİRMEZ (Postgres 22P02 → 500 yerine): bulunamadı sayılır → 409.
    const queryable = requested.filter((id) => isUuid(id));
    const rows: T[] = [];
    for (const part of chunkIds(queryable, REPORT_ID_CHUNK)) {
      const r = await readAllPaged<T>((from, to) =>
        base().in("id", part).order(orderCol, { ascending: orderAsc }).order("id", { ascending: true }).range(from, to),
      );
      if (r.error) return { ok: false, status: 500, error: "Kayıtlar okunamadı.", cause: r.error };
      rows.push(...r.rows);
    }
    const found = new Set(rows.map((r) => String(r.id ?? "")));
    const missing = requested.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        status: 409,
        error: `Seçilen ${requested.length} kayıttan ${missing.length} tanesi bulunamadı (silinmiş veya bu hesaba ait değil). Eksik rapor üretilmedi; listeyi yenileyip tekrar deneyin.`,
      };
    }
    rows.sort(compareBy<T>(orderCol, orderAsc));
    return { ok: true, rows, truncated: false };
  }

  if (input.mode === "single" && input.singleId && !isUuid(input.singleId)) {
    return { ok: false, status: 404, error: "Kayıt bulunamadı." };
  }
  const paged = await readAllPaged<T>(
    (from, to) => {
      let q = base();
      if (input.mode === "single" && input.singleId) q = q.eq("id", input.singleId);
      return q.order(orderCol, { ascending: orderAsc }).order("id", { ascending: true }).range(from, to);
    },
    { maxRows },
  );
  if (paged.error) return { ok: false, status: 500, error: "Kayıtlar okunamadı.", cause: paged.error };
  return { ok: true, rows: paged.rows, truncated: paged.truncated };
}
