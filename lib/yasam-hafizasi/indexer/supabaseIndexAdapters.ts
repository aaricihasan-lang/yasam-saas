/**
 * Yaşam Hafızası™ — Supabase İndeks IO Adapter'ları (Sprint 2 / S2.10, IO katmanı).
 *
 * S2.09 port'larının (`SourceReader`, `ParentTenantReader`) GERÇEK Supabase
 * implementasyonu + hash-aware `IndexWriter`. **S2.10'un TEK Supabase-bağımlı dosyası.**
 *
 * KANONİK KURALLAR (S2.10):
 *   - `getServerDb()` sonucu buraya DAR yapısal `IndexDbClient` olarak verilir
 *     (test edilebilirlik; geniş `SupabaseClient<any>` bağımlılığı yok, `any` yok).
 *   - Tablo/kolon adları YALNIZ statik `SourceConfig`/sabitlerden; `select("*")` yok;
 *     kullanıcı girdisi kabul edilmez → injection yüzeyi yok.
 *   - Reader: primaryKey ASC keyset; cursor varsa `.gt`; active kaynakta `.eq(active,true)`;
 *     dönen satırlar saf çekirdeğe verilmeden shallow-clone edilir.
 *   - ParentReader: 200'lük `.in("id", chunk)`; chunk hatası preload'u FATAL yapar;
 *     `parentTenantMapKey()` reuse; S2.09 port sözleşmesi değişmez.
 *   - Writer: hash prefetch (source_table filtresi zorunlu, source_id chunk) →
 *     `planIndexWrites` → yalnız değişen satırlar `onConflict` upsert; chunk 200;
 *     FAIL-FAST (ilk hatalı chunk'ta dur; önceki success korunur).
 *   - Ham Supabase/DB mesajı DIŞARI TAŞINMAZ; yalnız sabit kod + güvenli sayısal meta.
 */

import { isSyntheticTenantId } from "../../tenancy/syntheticTenants";
import { YH_TABLES } from "../config";
import type { BuiltIndexUnit } from "./buildCandidate";
import {
  planIndexWrites,
  indexConflictKey,
  type DbIndexRow,
  type ExistingHashMap,
} from "./indexWritePlan";
import { parentTenantMapKey } from "./parentTenantLookup";
import type { ParentTenantReader, SourceReader } from "./runSource";
import { hasWorkerCapability, type SourceConfig } from "./sources";

// ─── Sabitler ─────────────────────────────────────────────────────────────────
export const PARENT_CHUNK_SIZE = 200;
export const PREFETCH_CHUNK_SIZE = 200;
export const WRITE_CHUNK_SIZE = 200;
const INDEX_CONFLICT_KEY = "source_table,source_id,section_ref" as const;

// ─── Dar yapısal DB client (getServerDb bununla uyumludur; `any` yok) ─────────
type DbRow = Record<string, unknown>;
export interface DbQueryResult {
  readonly data: DbRow[] | null;
  readonly error: { readonly message: string } | null;
}
export interface DbSelectBuilder extends PromiseLike<DbQueryResult> {
  eq(column: string, value: unknown): DbSelectBuilder;
  gt(column: string, value: unknown): DbSelectBuilder;
  in(column: string, values: readonly unknown[]): DbSelectBuilder;
  order(column: string, opts: { ascending: boolean }): DbSelectBuilder;
  limit(count: number): DbSelectBuilder;
}
export interface DbTableBuilder {
  select(columns: string): DbSelectBuilder;
  upsert(
    rows: readonly DbRow[],
    opts: { onConflict: string },
  ): PromiseLike<{ error: { readonly message: string } | null }>;
}
export interface IndexDbClient {
  from(table: string): DbTableBuilder;
}

// ─── BF-11B: dar, TEK-METOTLU keyed-delete istemcisi (deindex) ────────────────
// Mevcut `IndexDbClient`/`DbTableBuilder` DEĞİŞMEZ (reader/writer regression'ı korunur).
// Chainable builder YERİNE tek bir `deleteRows` metodu: gerçek Supabase zinciri
// (from().delete({count}).eq()...) worker facade'ında UNSAFE CAST'SİZ delege edilir.
export interface IndexDeleteQuery {
  readonly table: string;
  /**
   * Birlikte AND'lenecek filtreler (kolon, değer). Worker-v2: değer `null` ise IS NULL semantiği
   * (SHARED satır deindex'i: tenant_id IS NULL); aksi eşitlik (`.eq`). Facade `.eq`/`.is` seçer.
   */
  readonly filters: ReadonlyArray<readonly [column: string, value: string | null]>;
  /** Silinen satır sayısı için `count: "exact"` zorunlu. */
  readonly count: "exact";
}
export interface IndexDeleteOutcome {
  /** DB hatası oluştuysa true (ham mesaj TAŞINMAZ). */
  readonly error: boolean;
  /** Silinen satır sayısı; count alınamadıysa null (fail-closed → delete-failed). */
  readonly count: number | null;
}
export interface IndexDeleteClient {
  deleteRows(query: IndexDeleteQuery): Promise<IndexDeleteOutcome>;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Kaynak için gerekli MİNİMAL select kolon listesi (config allowlist; `*` yok). */
export function sourceSelectColumns(config: SourceConfig): string[] {
  const cols = new Set<string>();
  cols.add(config.primaryKey);
  // Tenant kolonu: column → tenant kolonu; join → FK; global-canonical → tenant kolonu YOK.
  if (config.tenant.mode === "column") cols.add(config.tenant.column);
  else if (config.tenant.mode === "join") cols.add(config.tenant.fkColumn);
  // BF-14 row-eligibility kolonları (varsa) fetch'e dahil (status/row-classification kapıları).
  if (typeof config.statusColumn === "string" && config.statusColumn.length > 0) cols.add(config.statusColumn);
  if (typeof config.rowClassificationColumn === "string" && config.rowClassificationColumn.length > 0) cols.add(config.rowClassificationColumn);
  for (const c of config.titleColumns) cols.add(c);
  for (const c of config.searchTextColumns) cols.add(c);
  for (const c of config.snippetColumns) cols.add(c);
  for (const c of config.topicTagsColumns) cols.add(c);
  for (const c of config.relationColumns) cols.add(c);
  if (config.updatedAtColumn !== null) cols.add(config.updatedAtColumn);
  if (config.activeColumn !== null) cols.add(config.activeColumn);
  return [...cols];
}

// ─── SourceReader (gerçek) ────────────────────────────────────────────────────
export function createSupabaseSourceReader(db: IndexDbClient): SourceReader {
  return {
    readPage: async ({ config, afterId, limit, scopedTenantId }) => {
      const columns = sourceSelectColumns(config).join(",");
      let q = db
        .from(config.tableName)
        .select(columns)
        .order(config.primaryKey, { ascending: true })
        .limit(limit);
      if (config.activeColumn !== null) q = q.eq(config.activeColumn, true);
      if (afterId !== null) q = q.gt(config.primaryKey, afterId);
      // BF-4B tenant-scoped backfill: column-mode kaynakta tenant kolonuna eşitlik filtresi.
      if (scopedTenantId != null && config.tenant.mode === "column") {
        q = q.eq(config.tenant.column, scopedTenantId);
      }

      const { data, error } = await q;
      if (error) throw new Error("source-read-failed"); // ham mesaj taşınmaz
      const rows = (data ?? []).map((r) => ({ ...r })); // shallow clone → saf çekirdek
      return { rows };
    },

    // BF-2B exact-write gate: primary key EŞİTLİĞİ (`.eq(pk, sourceId)`); cursor/limit
    // genişletme YOK. PK tekil → en fazla 1 satır; savunma amaçlı limit(2) ile >1
    // sözleşme ihlali çağırana taşınır (indexSourcePage exact-guard multiple-rows sayar).
    readExactRecord: async ({ config, sourceId }) => {
      const columns = sourceSelectColumns(config).join(",");
      let q = db
        .from(config.tableName)
        .select(columns)
        .eq(config.primaryKey, sourceId)
        .limit(2);
      if (config.activeColumn !== null) q = q.eq(config.activeColumn, true);

      const { data, error } = await q;
      if (error) throw new Error("source-read-failed"); // ham mesaj taşınmaz
      const rows = (data ?? []).map((r) => ({ ...r })); // shallow clone → saf çekirdek
      return { rows };
    },
  };
}

// ─── ParentTenantReader (gerçek) ──────────────────────────────────────────────
export function createSupabaseParentTenantReader(db: IndexDbClient): ParentTenantReader {
  return {
    readParentTenants: async ({ parentTable, parentTenantColumn, parentIds }) => {
      const map = new Map<string, string | null>();
      for (const c of chunk(parentIds, PARENT_CHUNK_SIZE)) {
        const { data, error } = await db
          .from(parentTable)
          .select(`id,${parentTenantColumn}`)
          .in("id", c);
        if (error) throw new Error("parent-read-failed"); // chunk hatası → FATAL
        for (const row of data ?? []) {
          const id = row["id"];
          if (typeof id !== "string" || id.length === 0) continue;
          const tenant = row[parentTenantColumn];
          const key = parentTenantMapKey(parentTable, id);
          if (typeof tenant === "string") map.set(key, tenant);
          else if (tenant === null) map.set(key, null);
          // aksi (beklenmedik tip): map'e girmez → found:false → parent-not-found (fail-closed)
        }
      }
      return map;
    },

    // Worker-v2: parent aktiflik kolonunu toplu oku (id → kolon===true). Parent bulunamayan id
    // map'te YER ALMAZ → çağıran fail-closed. Yalnız minimal (id + activeColumn) select; `*` yok.
    readParentActive: async ({ parentTable, parentActiveColumn, parentIds }) => {
      const map = new Map<string, boolean>();
      for (const c of chunk(parentIds, PARENT_CHUNK_SIZE)) {
        const { data, error } = await db
          .from(parentTable)
          .select(`id,${parentActiveColumn}`)
          .in("id", c);
        if (error) throw new Error("parent-active-read-failed"); // chunk hatası → FATAL
        for (const row of data ?? []) {
          const id = row["id"];
          if (typeof id !== "string" || id.length === 0) continue;
          map.set(id, row[parentActiveColumn] === true);
        }
      }
      return map;
    },
  };
}

// ─── IndexWriter (gerçek, hash-aware, fail-fast) ──────────────────────────────
export type IndexWriteErrorCode = "prefetch-failed" | "upsert-failed";

export interface WriteIndexUnitsInput {
  readonly config: SourceConfig;
  readonly units: readonly BuiltIndexUnit[];
}
export interface WriteIndexUnitsResult {
  readonly attempted: number; // gerçekten upsert denenen satır (written + failed)
  readonly written: number;
  readonly plannedInsert: number;
  readonly plannedUpdate: number;
  readonly unchanged: number;
  readonly failed: number; // yalnız BAŞARISIZ chunk'taki satır sayısı (sonraki denenmeyen chunk'lar değil)
  readonly chunksAttempted: number;
  readonly chunksSucceeded: number;
  readonly conflictKey: typeof INDEX_CONFLICT_KEY;
  readonly errors: ReadonlyArray<{ readonly chunkIndex: number; readonly code: IndexWriteErrorCode }>;
}
export interface IndexWriter {
  write(input: WriteIndexUnitsInput): Promise<WriteIndexUnitsResult>;
}

function emptyWrite(
  plan: { plannedInsert: number; plannedUpdate: number; unchanged: number },
): WriteIndexUnitsResult {
  return {
    attempted: 0,
    written: 0,
    plannedInsert: plan.plannedInsert,
    plannedUpdate: plan.plannedUpdate,
    unchanged: plan.unchanged,
    failed: 0,
    chunksAttempted: 0,
    chunksSucceeded: 0,
    conflictKey: INDEX_CONFLICT_KEY,
    errors: [],
  };
}

/** Mevcut indeks hash'lerini toplu okur (source_table zorunlu; source_id chunk). */
async function prefetchExistingHashes(
  db: IndexDbClient,
  sourceTable: string,
  units: readonly BuiltIndexUnit[],
): Promise<ExistingHashMap> {
  const map = new Map<string, string | null>();
  const sourceIds = [...new Set(units.map((u) => u.sourceId))];
  for (const c of chunk(sourceIds, PREFETCH_CHUNK_SIZE)) {
    const { data, error } = await db
      .from(YH_TABLES.index)
      .select("source_id,section_ref,content_hash")
      .eq("source_table", sourceTable) // zorunlu; tenant filtresi EKLENMEZ (conflict parçası değil)
      .in("source_id", c);
    if (error) throw new Error("prefetch-failed");
    for (const row of data ?? []) {
      const sid = row["source_id"];
      if (typeof sid !== "string") continue;
      const sref = row["section_ref"];
      const hash = row["content_hash"];
      const key = indexConflictKey(sid, typeof sref === "string" ? sref : null);
      map.set(key, typeof hash === "string" ? hash : null);
    }
  }
  return map;
}

export function createSupabaseIndexWriter(db: IndexDbClient): IndexWriter {
  return {
    write: async ({ config, units }) => {
      // BF-1B-FIX SAVUNMA DERİNLİĞİ: sentetik tenant unit'i writer'a ULAŞAMAZ.
      // Sessiz filtre YOK — orkestrasyon hatasını gizlemek yerine fail-fast durdur
      // (sabit kod; ham tenant/unit içeriği taşınmaz). Gerçek tenant ve NULL/shared
      // unit davranışı ile chunk/upsert/idempotency sözleşmesi DEĞİŞMEZ.
      if (units.some((u) => isSyntheticTenantId(u.tenantId))) {
        throw new Error("synthetic-tenant-unit");
      }

      // Boş units → prefetch/upsert yok.
      if (units.length === 0) {
        return emptyWrite({ plannedInsert: 0, plannedUpdate: 0, unchanged: 0 });
      }

      // 1) Prefetch (hata → fatal write sonucu; ham mesaj taşınmaz).
      let existing: ExistingHashMap;
      try {
        existing = await prefetchExistingHashes(db, config.tableName, units);
      } catch {
        return {
          attempted: 0,
          written: 0,
          plannedInsert: 0,
          plannedUpdate: 0,
          unchanged: 0,
          failed: 0,
          chunksAttempted: 0,
          chunksSucceeded: 0,
          conflictKey: INDEX_CONFLICT_KEY,
          errors: [{ chunkIndex: -1, code: "prefetch-failed" }],
        };
      }

      // 2) Plan (saf).
      const plan = planIndexWrites(units, existing);
      if (plan.toUpsert.length === 0) return emptyWrite(plan);

      // 3) Chunked upsert, FAIL-FAST.
      const chunks: DbIndexRow[][] = chunk(plan.toUpsert, WRITE_CHUNK_SIZE);
      let written = 0;
      let chunksSucceeded = 0;
      let failed = 0;
      const errors: { chunkIndex: number; code: IndexWriteErrorCode }[] = [];

      for (let i = 0; i < chunks.length; i += 1) {
        const { error } = await db
          .from(YH_TABLES.index)
          // IO sınırı: tipli DbIndexRow → dar client'ın Record satırı (tek kontrollü köprü).
          .upsert(chunks[i] as unknown as readonly DbRow[], { onConflict: INDEX_CONFLICT_KEY });
        if (error) {
          failed = chunks[i].length; // yalnız bu chunk; sonraki denenmeyenler değil
          errors.push({ chunkIndex: i, code: "upsert-failed" });
          break; // fail-fast
        }
        written += chunks[i].length;
        chunksSucceeded += 1;
      }

      return {
        attempted: written + failed,
        written,
        plannedInsert: plan.plannedInsert,
        plannedUpdate: plan.plannedUpdate,
        unchanged: plan.unchanged,
        failed,
        chunksAttempted: chunksSucceeded + (errors.length > 0 ? 1 : 0),
        chunksSucceeded,
        conflictKey: INDEX_CONFLICT_KEY,
        errors,
      };
    },
  };
}

// ─── BF-11B: Tenant-Scoped Fiziksel Deindexer (fail-closed) ───────────────────
//
// `yasam_hafizasi_index`'te `source_key` YOKTUR → filtre `source_table` üzerinden
// kurulur (registry `config.tableName`; olayın ham source_table'ı çağıran katmanda
// zaten config ile eşleştirilir). Tenant izolasyonu: index'in kendi `tenant_id`
// kolonuna eşitlik → yanlış tenant asla silinmez (0 satır = fail-closed no-op).
//
// KAPSAM: column-mode + non-shared + record-unit VE (BF-11E Belge/Video) join-mode +
// non-shared + row-unit. Silme (source_table + source_id + tenant_id) tenant-mode/unit'ten
// BAĞIMSIZ genel bir filtredir; global-canonical + shared kaynak fail-closed reddedilir.
//   DB error                          → delete-failed (geçici; ham mesaj taşınmaz)
//   count null/undefined/geçersiz int → delete-failed (FAIL-CLOSED; count:"exact" ist.)
//   count = 0                         → no-op (idempotent success)
//   count = 1                         → ok
//   count > 1                         → multi-row-anomaly (tek-unit sözleşme ihlali)

export type DeindexStatus =
  | "ok"
  | "no-op"
  | "multi-row-anomaly"
  | "delete-failed"
  | "tenant-model-unsupported";

export interface DeindexInput {
  readonly config: SourceConfig;
  readonly sourceId: string;
  /** Worker-v2: SHARED satır deindex'inde `null` (tenant_id IS NULL); tenant-scoped'ta UUID. */
  readonly tenantId: string | null;
}
export interface DeindexResult {
  readonly status: DeindexStatus;
  readonly deleted: number;
}
export interface IndexDeindexer {
  deindex(input: DeindexInput): Promise<DeindexResult>;
}

export function createSupabaseIndexDeindexer(db: IndexDeleteClient): IndexDeindexer {
  return {
    deindex: async ({ config, sourceId, tenantId }) => {
      // Fail-closed model kapısı (okuma/silme yapılmadan): column|join + record|row VEYA Worker-v2
      // capability (shared-optional-professional / section-unit). global-canonical desteklenmez;
      // capability YOK ise shared/section hâlâ fail-closed.
      const sharedCapable = hasWorkerCapability(config, "shared-optional-professional");
      const sectionCapable = hasWorkerCapability(config, "section-unit");
      if (
        (config.tenant.mode !== "column" && config.tenant.mode !== "join") ||
        (config.tenant.allowSharedNull === true && !sharedCapable) ||
        (config.unit !== "record" &&
          config.unit !== "row" &&
          !(config.unit === "section" && sectionCapable))
      ) {
        return { status: "tenant-model-unsupported", deleted: 0 };
      }
      // SHARED (tenant NULL) event yalnız shared-capable kaynak için geçerli; aksi fail-closed
      // (yanlışlıkla tüm tenant'ları IS NULL ile silmeyi ENGELLE).
      if (tenantId === null && !sharedCapable) {
        return { status: "tenant-model-unsupported", deleted: 0 };
      }

      // Fiziksel silme (source_table + source_id + tenant scope birlikte). Worker-v2: tenantId null →
      // IS NULL (SHARED referans satırı); aksi tenant-scoped eşitlik. Facade `.is`/`.eq` seçer.
      const { error, count } = await db.deleteRows({
        table: YH_TABLES.index,
        filters: [
          ["source_table", config.tableName],
          ["source_id", sourceId],
          ["tenant_id", tenantId],
        ],
        count: "exact",
      });

      if (error) return { status: "delete-failed", deleted: 0 }; // ham mesaj taşınmaz
      // FAIL-CLOSED: count:"exact" istenmişken null/undefined/geçersiz → doğrulanmış
      // sıfır DEĞİL → delete-failed (geçici; retry idempotent: sonraki silme 0 → no-op).
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        return { status: "delete-failed", deleted: 0 };
      }
      if (count === 0) return { status: "no-op", deleted: 0 };
      if (count === 1) return { status: "ok", deleted: 1 };
      return { status: "multi-row-anomaly", deleted: count };
    },
  };
}
