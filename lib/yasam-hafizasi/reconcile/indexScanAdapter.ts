/**
 * Yaşam Hafızası™ — Reconciliation Salt-Okunur IO Adapter'ları (BF-11D2).
 * ============================================================================
 *
 * BF-11D dry-run'ın TEK Supabase-bağımlı dosyası. YAPISAL ZERO-WRITE: bu dosyadaki
 * `ReadDbClient` arayüzünde YALNIZ `select` vardır — upsert/insert/update/delete
 * METODU YOKTUR → reconcile IO yüzeyinden yazma çağrısı TİP-SEVİYESİNDE İMKÂNSIZDIR.
 *
 * Adapter'lar (hepsi READ):
 *   - createSupabaseSourceScanner  : stones keyset sayfa (SourceScanPort)
 *   - createSupabaseIndexScanner   : index keyset sayfa (IndexScanPort)
 *   - createSupabaseIndexLookup    : source_id → canonical index (IndexLookupPort)
 *   - createSupabaseSourceExists   : source_id → tenant (SourceExistsPort)
 *
 * Kolon adları YALNIZ statik config/sabitten (`sourceSelectColumns` reuse; `*` YOK;
 * kullanıcı girdisi kabul edilmez). Ham DB mesajı DIŞARI TAŞINMAZ.
 */

import { YH_TABLES } from "../config";
import type { SourceConfig } from "../indexer/sources";
import { sourceSelectColumns } from "../indexer/supabaseIndexAdapters";
import type { IndexRowView } from "./classifyRecord";
import type {
  IndexLookupPort,
  IndexScanPort,
  SourceExistsPort,
  SourceScanPort,
} from "./reconcileSource";
import { RECON_PILOT_SOURCE_TABLE } from "./types";

const CHUNK_SIZE = 200;
const INDEX_SELECT =
  "id,tenant_id,source_table,source_id,unit_type,section_ref,group_key,content_hash,source_updated_at";

// ─── Salt-okunur dar client (YALNIZ select; write metodu YOK) ─────────────────
type ReadRow = Record<string, unknown>;
interface ReadResult {
  readonly data: ReadRow[] | null;
  readonly error: { readonly message: string } | null;
}
interface ReadSelect extends PromiseLike<ReadResult> {
  eq(column: string, value: unknown): ReadSelect;
  gt(column: string, value: unknown): ReadSelect;
  in(column: string, values: readonly unknown[]): ReadSelect;
  order(column: string, opts: { ascending: boolean }): ReadSelect;
  limit(count: number): ReadSelect;
}
interface ReadTable {
  select(columns: string): ReadSelect;
}
export interface ReadDbClient {
  from(table: string): ReadTable;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function toIndexRowView(r: ReadRow): IndexRowView | null {
  const id = str(r["id"]);
  const sourceId = str(r["source_id"]);
  const sourceTable = str(r["source_table"]);
  const unitType = str(r["unit_type"]);
  if (id === null || sourceId === null || sourceTable === null || unitType === null) {
    return null; // teknik anahtar eksik → atla (fail-closed; anomaliyi bozuk satır yapma)
  }
  const tenant = r["tenant_id"];
  return {
    id,
    tenantId: typeof tenant === "string" ? tenant : null,
    sourceTable,
    sourceId,
    unitType,
    sectionRef: str(r["section_ref"]),
    groupKey: str(r["group_key"]),
    contentHash: str(r["content_hash"]),
    sourceUpdatedAt: str(r["source_updated_at"]),
  };
}

// ─── SourceScanPort (stones keyset sayfa; read-only; sourceSelectColumns reuse) ─
export function createSupabaseSourceScanner(
  db: ReadDbClient,
  config: SourceConfig,
): SourceScanPort {
  const columns = sourceSelectColumns(config).join(",");
  return {
    readSourcePage: async ({ afterId, limit }) => {
      let q = db
        .from(config.tableName)
        .select(columns)
        .order(config.primaryKey, { ascending: true })
        .limit(limit);
      if (config.activeColumn !== null) q = q.eq(config.activeColumn, true);
      if (afterId !== null) q = q.gt(config.primaryKey, afterId);
      const { data, error } = await q;
      if (error) throw new Error("recon-source-read-failed"); // ham mesaj taşınmaz
      const rows = (data ?? []).map((r) => ({ ...r }));
      return { rows };
    },
  };
}

// ─── IndexScanPort (index keyset sayfa; source_table=stones) ───────────────────
export function createSupabaseIndexScanner(db: ReadDbClient): IndexScanPort {
  return {
    readIndexPage: async ({ afterId, limit }) => {
      let q = db
        .from(YH_TABLES.index)
        .select(INDEX_SELECT)
        .eq("source_table", RECON_PILOT_SOURCE_TABLE)
        .order("id", { ascending: true })
        .limit(limit);
      if (afterId !== null) q = q.gt("id", afterId);
      const { data, error } = await q;
      if (error) throw new Error("recon-index-read-failed");
      const rows: IndexRowView[] = [];
      for (const r of data ?? []) {
        const v = toIndexRowView(r);
        if (v !== null) rows.push(v);
      }
      return { rows };
    },
  };
}

// ─── IndexLookupPort (source_id → canonical index; source_table=stones) ────────
export function createSupabaseIndexLookup(db: ReadDbClient): IndexLookupPort {
  return {
    lookupCanonicalIndex: async (sourceIds) => {
      const map = new Map<string, IndexRowView>();
      const uniq = [...new Set(sourceIds)];
      for (const c of chunk(uniq, CHUNK_SIZE)) {
        const { data, error } = await db
          .from(YH_TABLES.index)
          .select(INDEX_SELECT)
          .eq("source_table", RECON_PILOT_SOURCE_TABLE)
          .in("source_id", c);
        if (error) throw new Error("recon-index-lookup-failed");
        for (const r of data ?? []) {
          const v = toIndexRowView(r);
          if (v === null) continue;
          // Yalnız canonical record satırı (unit_type=record & section_ref=null).
          if (v.unitType !== "record" || v.sectionRef !== null) continue;
          // Deterministik: aynı source_id için birden çok canonical varsa en küçük id
          // (duplicate anomalisini Pass B raporlar; burada kararlı temsilci seçilir).
          const prev = map.get(v.sourceId);
          if (prev === undefined || v.id < prev.id) map.set(v.sourceId, v);
        }
      }
      return map;
    },
  };
}

// ─── SourceExistsPort (source_id → tenant; stones) ────────────────────────────
export function createSupabaseSourceExists(
  db: ReadDbClient,
  config: SourceConfig,
): SourceExistsPort {
  const tenantColumn =
    config.tenant.mode === "column" ? config.tenant.column : "tenant_id";
  return {
    lookupSourceTenants: async (sourceIds) => {
      const map = new Map<string, string | null>();
      const uniq = [...new Set(sourceIds)];
      for (const c of chunk(uniq, CHUNK_SIZE)) {
        const { data, error } = await db
          .from(config.tableName)
          .select(`${config.primaryKey},${tenantColumn}`)
          .in(config.primaryKey, c);
        if (error) throw new Error("recon-source-exists-failed");
        for (const r of data ?? []) {
          const id = str(r[config.primaryKey]);
          if (id === null) continue;
          const t = r[tenantColumn];
          map.set(id, typeof t === "string" ? t : null);
        }
      }
      return map;
    },
  };
}
