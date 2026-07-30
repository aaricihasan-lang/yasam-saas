/**
 * Yaşam Hafızası™ — Reconciliation İki-Yönlü Orkestratör (BF-11D2, DI; salt-okunur).
 * ============================================================================
 *
 * SAF ORKESTRASYON — yalnız ENJEKTE edilen READ port'ları dışında IO yok. Write
 * port'u SÖZLEŞMEDE YOKTUR (yapısal zero-write): insert/update/upsert/delete/RPC/
 * enqueue/writer/deindexer BURAYA GEÇİLEMEZ.
 *
 * İki AYRI pass (ayrı cursor / scanned / hasMore / cap):
 *   A. source→index : her stones satırını `decideSourceToIndex` ile sınıflar.
 *   B. index→source : her index satırını `decideIndexToSource` ile sınıflar (orphan/
 *      invariant/duplicate/tenant_mismatch; aynı-tenant covered → sayılır, aday değil).
 *
 * Cursor: DETERMİNİSTİK keyset (id ASC; offset YOK). Cap'ler: pageSize/maxPageSize/
 * maxPages/maxScannedRows/maxReportedCandidates (types.ts). Aynı cursor+veri → aynı
 * sonuç (idempotent). Ham row/PII/içerik sonuca KONMAZ.
 */

import type { SourceConfig } from "../indexer/sources";
import {
  decideSourceToIndex,
  decideIndexToSource,
  type IndexRowView,
} from "./classifyRecord";
import type {
  ReconCursor,
  ReconPassSummary,
  ReconRecordResult,
  ReconScanCaps,
} from "./types";

// ─── Enjekte READ port'ları (write metodu YOK) ────────────────────────────────
export interface SourceScanPort {
  readSourcePage(input: {
    readonly afterId: string | null;
    readonly limit: number;
  }): Promise<{ readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>> }>;
}
export interface IndexScanPort {
  readIndexPage(input: {
    readonly afterId: string | null;
    readonly limit: number;
  }): Promise<{ readonly rows: readonly IndexRowView[] }>;
}
export interface IndexLookupPort {
  /** source_id → TEK canonical index satırı (source_table=stones, record, section_ref null). */
  lookupCanonicalIndex(
    sourceIds: readonly string[],
  ): Promise<ReadonlyMap<string, IndexRowView>>;
}
export interface SourceExistsPort {
  /** source_id → tenant_id (kaynak varsa). Yoksa map'te bulunmaz. */
  lookupSourceTenants(
    sourceIds: readonly string[],
  ): Promise<ReadonlyMap<string, string | null>>;
}

// ─── Yardımcılar (saf) ────────────────────────────────────────────────────────
function normalizePageSize(caps: ReconScanCaps): number {
  const p = Number.isInteger(caps.pageSize) && caps.pageSize > 0 ? caps.pageSize : 1;
  return Math.min(p, caps.maxPageSize);
}

function readId(
  row: Readonly<Record<string, unknown>>,
  pk: string,
): string | null {
  const v = row[pk];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ─── Anomaly-aware combined katmanı (FAIL-CLOSED precedence) ──────────────────
//
// KRİTİK İNVARYANT: aynı pilot source identity (source_id) için bir anomaly
// (duplicate_index > index_invariant_violation > tenant_mismatch) varsa, o identity
// AYNI birleşik sonuçta hiçbir actionable candidate (missing/stale/orphan/
// deindex_required) olarak görünemez. Anomaly, actionable/normal/healthy'yi BASTIRIR.
// Precedence: düşük sayı = daha güçlü (bastıran). Anomaly-DIŞI sınıflar = 9 (normal).
// İki pass'in AYRI sayaç/cursor'ı DEĞİŞMEZ; yalnız birleşik tally/aday listesi
// anomaly-aware'dir (identity-anahtarlı; sıra-bağımsız; deterministik).
const COMBINED_PRECEDENCE: Readonly<Record<string, number>> = {
  duplicate_index: 1,
  index_invariant_violation: 2,
  tenant_mismatch: 3,
};
export function combinedPrecedence(classification: string): number {
  return COMBINED_PRECEDENCE[classification] ?? 9;
}

export class CombinedReconcile {
  private readonly byId = new Map<string, { readonly result: ReconRecordResult; readonly prec: number }>();
  private readonly standalone: ReconRecordResult[] = [];

  /** Bir pass sonucunu birleşik görünüme ekler (identity-anahtarlı precedence). */
  add(result: ReconRecordResult): void {
    if (result.sourceId === null) {
      this.standalone.push(result);
      return;
    }
    const prec = combinedPrecedence(result.classification);
    const existing = this.byId.get(result.sourceId);
    if (existing === undefined || prec < existing.prec) {
      this.byId.set(result.sourceId, { result, prec });
    }
  }

  /** classification → adet (her identity YALNIZ bir kez, kazanan sınıfla). */
  tally(): Record<string, number> {
    const t: Record<string, number> = {};
    for (const { result } of this.byId.values()) t[result.classification] = (t[result.classification] ?? 0) + 1;
    for (const r of this.standalone) t[r.classification] = (t[r.classification] ?? 0) + 1;
    return t;
  }

  /** Bounded birleşik aday/anomali örneği (anomaly-aware; kazanan sınıf). */
  sample(max: number): ReconRecordResult[] {
    const out: ReconRecordResult[] = [];
    for (const { result } of this.byId.values()) {
      if (out.length >= max) break;
      out.push(result);
    }
    return out;
  }

  /** Bir identity'nin birleşik nihai sınıfı (test/iç kullanım). */
  classOf(sourceId: string): ReconRecordResult | null {
    return this.byId.get(sourceId)?.result ?? null;
  }

  /**
   * TÜM birleşik sonuçlar (identity başına kazanan sınıf + standalone). Bounded DEĞİL —
   * byId taranan identity sayısıyla (safety cap ile) sınırlıdır. BF-11D6 apply core'un
   * tam actionable aday listesini alması için (dry-run davranışı değişmez; salt-okuma).
   */
  entries(): ReconRecordResult[] {
    const out: ReconRecordResult[] = [];
    for (const { result } of this.byId.values()) out.push(result);
    for (const r of this.standalone) out.push(r);
    return out;
  }
}

/** classification tally + bounded sample biriktirici. */
class Accumulator {
  readonly byClassification: Record<string, number> = {};
  readonly sample: ReconRecordResult[] = [];
  constructor(private readonly maxSample: number) {}
  add(r: ReconRecordResult): void {
    this.byClassification[r.classification] =
      (this.byClassification[r.classification] ?? 0) + 1;
    if (this.sample.length < this.maxSample) this.sample.push(r);
  }
}

// ─── Pass A: source → index ───────────────────────────────────────────────────
export async function runSourceToIndexPass(
  config: SourceConfig,
  ports: { readonly source: SourceScanPort; readonly indexLookup: IndexLookupPort },
  caps: ReconScanCaps,
  startCursor: ReconCursor = null,
  combined?: CombinedReconcile,
): Promise<ReconPassSummary> {
  const limit = normalizePageSize(caps);
  const acc = new Accumulator(caps.maxReportedCandidates);
  let cursor: string | null = startCursor;
  let scannedRows = 0;
  let pagesScanned = 0;
  let stoppedByCap = false;
  let dataExhausted = false;

  while (true) {
    if (pagesScanned >= caps.maxPages || scannedRows >= caps.maxScannedRows) {
      stoppedByCap = true;
      break;
    }
    const { rows } = await ports.source.readSourcePage({ afterId: cursor, limit });
    if (rows.length === 0) {
      dataExhausted = true;
      break;
    }
    pagesScanned += 1;

    const ids: string[] = [];
    for (const row of rows) {
      const id = readId(row, config.primaryKey);
      if (id !== null) ids.push(id);
    }
    const canonical = await ports.indexLookup.lookupCanonicalIndex(ids);

    let lastId: string | null = cursor;
    for (const row of rows) {
      const id = readId(row, config.primaryKey);
      const ix = id !== null ? canonical.get(id) ?? null : null;
      const result = decideSourceToIndex(config, row, ix);
      acc.add(result);
      combined?.add(result);
      scannedRows += 1;
      if (id !== null) lastId = id;
    }
    cursor = lastId;

    if (rows.length < limit) {
      dataExhausted = true;
      break;
    }
  }

  const hasMore = !dataExhausted;
  return {
    pass: "source",
    scannedRows,
    pagesScanned,
    byClassification: acc.byClassification,
    sample: acc.sample,
    hasMore,
    nextCursor: hasMore ? cursor : null,
    stoppedByCap,
  };
}

// ─── Pass B: index → source ───────────────────────────────────────────────────
export async function runIndexToSourcePass(
  ports: { readonly index: IndexScanPort; readonly sourceExists: SourceExistsPort },
  caps: ReconScanCaps,
  startCursor: ReconCursor = null,
  combined?: CombinedReconcile,
): Promise<ReconPassSummary> {
  const limit = normalizePageSize(caps);
  const acc = new Accumulator(caps.maxReportedCandidates);
  let cursor: string | null = startCursor;
  let scannedRows = 0;
  let pagesScanned = 0;
  let coveredBySource = 0;
  let stoppedByCap = false;
  let dataExhausted = false;

  while (true) {
    if (pagesScanned >= caps.maxPages || scannedRows >= caps.maxScannedRows) {
      stoppedByCap = true;
      break;
    }
    const { rows } = await ports.index.readIndexPage({ afterId: cursor, limit });
    if (rows.length === 0) {
      dataExhausted = true;
      break;
    }
    pagesScanned += 1;

    // Kaynak varlık lookup + sayfa-içi canonical duplicate sayımı.
    const ids: string[] = [];
    const canonicalCount = new Map<string, number>();
    for (const ix of rows) {
      ids.push(ix.sourceId);
      if (ix.unitType === "record" && ix.sectionRef === null && ix.sourceTable === "stones") {
        canonicalCount.set(ix.sourceId, (canonicalCount.get(ix.sourceId) ?? 0) + 1);
      }
    }
    const sourceTenants = await ports.sourceExists.lookupSourceTenants(ids);

    let lastId: string | null = cursor;
    for (const ix of rows) {
      const present = sourceTenants.has(ix.sourceId);
      const dup = canonicalCount.get(ix.sourceId) ?? 0;
      const result = decideIndexToSource(
        ix,
        { present, tenantId: present ? sourceTenants.get(ix.sourceId) ?? null : null },
        dup,
      );
      if (result === null) coveredBySource += 1;
      else {
        acc.add(result);
        combined?.add(result);
      }
      scannedRows += 1;
      // Keyset cursor: index tablosunun kendi PK'sı (id ASC; adapter sözleşmesi).
      lastId = ix.id;
    }
    cursor = lastId;

    if (rows.length < limit) {
      dataExhausted = true;
      break;
    }
  }

  const hasMore = !dataExhausted;
  const summary: ReconPassSummary = {
    pass: "index",
    scannedRows,
    pagesScanned,
    byClassification: acc.byClassification,
    sample: acc.sample,
    covered: coveredBySource,
    hasMore,
    nextCursor: hasMore ? cursor : null,
    stoppedByCap,
  };
  return summary;
}
