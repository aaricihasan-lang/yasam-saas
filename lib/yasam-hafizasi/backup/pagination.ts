/**
 * BF-12B — Deterministik sayfalama + mutabakat.
 *
 * - Configurable page size; TÜM sayfalar tamamlanana kadar devam (hard-cap YOK).
 * - PK varsa keyset (PK sırası) sayfalama; PK yoksa reader canonical sıra sağlar.
 * - Duplicate PK tespiti; sayfa overlap/gap keyset ile yapısal olarak engellenir.
 * - exported count == snapshot count değilse FAIL-CLOSED.
 * - Tablo içeriği için deterministik hash (sıralı satırların canonical'i).
 */
import { createHash } from "node:crypto";
import { canonicalize } from "./canonical";
import type { DbReader, Row, TableExport, TableSchema } from "./types";
import type { RestorePolicy } from "./constants";

export interface PaginateOptions {
  pageSize: number;
  restorePolicy: RestorePolicy;
  tenantColumn: string | null;
  /** Satır bazlı callback (arşive yazma için); tüm satırları bellekte tutmayı önler. */
  onRow?: (row: Row) => void;
}

export interface PaginateResult {
  export: TableExport;
  /** İlk N satır (Word öz/önizleme için; sınırlı). */
  sample: Row[];
}

const SAMPLE_LIMIT = 50;

export async function paginateTable(
  reader: DbReader,
  schema: TableSchema,
  opts: PaginateOptions,
): Promise<PaginateResult> {
  const table = schema.name;
  const pk = schema.primaryKey;
  const snapshotCount = await reader.countRows(table);

  const hash = createHash("sha256");
  const seenPk = new Set<string>();
  let duplicatePrimaryKeys = 0;
  let rowCount = 0;
  let after: unknown[] | null = null;
  const sample: Row[] = [];
  const perTenant: Record<string, number> = {};

  // Sonsuz döngü koruması: en fazla ceil(snapshot/pageSize)+2 tur.
  const maxPages = Math.ceil(Math.max(snapshotCount, 1) / opts.pageSize) + 2;
  let pages = 0;

  for (;;) {
    if (pages > maxPages) {
      throw new Error(
        `paginateTable(${table}): beklenenden fazla sayfa (olası keyset/order hatası)`,
      );
    }
    const page: Row[] = await reader.readPage(table, opts.pageSize, after);
    pages += 1;
    if (page.length === 0) break;

    for (const row of page) {
      if (pk.length > 0) {
        const key = canonicalize(pk.map((c) => row[c]));
        if (seenPk.has(key)) {
          duplicatePrimaryKeys += 1;
        } else {
          seenPk.add(key);
        }
      }
      hash.update(canonicalize(row));
      hash.update("\n");
      rowCount += 1;
      if (opts.tenantColumn) {
        const tid = row[opts.tenantColumn];
        const k = tid === null || tid === undefined ? "__null__" : String(tid);
        perTenant[k] = (perTenant[k] ?? 0) + 1;
      }
      if (opts.onRow) opts.onRow(row);
      if (sample.length < SAMPLE_LIMIT) sample.push(row);
    }

    // Keyset ilerlet.
    const last = page[page.length - 1];
    after = pk.length > 0 ? pk.map((c) => last[c]) : null;
    // PK yoksa keyset ilerletilemez → tek sayfada bitmeli (reader tüm satırı döndürür).
    if (pk.length === 0) {
      if (page.length < opts.pageSize) break;
      // PK'sız tabloda pageSize'a eşit sayfa geldi → güvenli tam-tarama garantisi yok.
      throw new Error(
        `paginateTable(${table}): PK yok ve tek sayfaya sığmadı — güvenli sayfalama yapılamaz`,
      );
    }
    if (page.length < opts.pageSize) break;
  }

  if (rowCount !== snapshotCount) {
    throw new Error(
      `paginateTable(${table}): satır uyuşmazlığı exported=${rowCount} snapshot=${snapshotCount} (FAIL-CLOSED)`,
    );
  }
  if (duplicatePrimaryKeys > 0) {
    throw new Error(
      `paginateTable(${table}): ${duplicatePrimaryKeys} tekrarlı PK (FAIL-CLOSED)`,
    );
  }

  const tableExport: TableExport = {
    table,
    rowCount,
    reconciledSnapshotCount: snapshotCount,
    primaryKey: pk,
    pageSize: opts.pageSize,
    pages,
    canonicalSha256: hash.digest("hex"),
    duplicatePrimaryKeys,
    restorePolicy: opts.restorePolicy,
    tenantColumn: opts.tenantColumn,
    perTenantCounts: perTenant,
  };
  return { export: tableExport, sample };
}
