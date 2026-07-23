/**
 * Yaşam Hafızası™ — Tek-Kaynak İndeksleme Orkestrasyonu (Sprint 2 / S2.09).
 *
 * SAF (pure) ORKESTRASYON — enjekte edilen okuma port'ları dışında IO yok. Bir
 * kaynağın TEK sayfasını işler: satırları port'tan alır, join-mode'da parent tenant
 * kayıtlarını toplu ön-yükler, her satırı S2.08 `runIndexUnit` üzerinden çalıştırır,
 * unit + skip sonuçlarını toplar ve keyset cursor + parent istatistiği döndürür.
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / getServerDb / DB sorgusu / fetch / process.env / IO / API / UI /
 *   network / filesystem / log / Date.now / rastgele / index YAZIMI / upsert /
 *   tombstone / delete / pagination SORGUSU / `.in()` chunk / admin route / cron.
 *   Gerçek IO adapter'ları (SourceReader/ParentTenantReader implementasyonu),
 *   idempotent upsert (S2.10) ve reconcile/tombstone (S2.11) SONRAKİ aşamalara aittir.
 *
 * KANONİK KURALLAR (S2.09):
 *   - S2.04/05/07/08 çekirdekleri YENİDEN YAZILMAZ; GERÇEK fonksiyonlar çağrılır
 *     (`runIndexUnit`, `makeParentTenantLookup`, `parentTenantMapKey`,
 *     `summarizeRunResults`). Yeni skip reason / summary / lookup-key ÜRETİLMEZ.
 *   - Reader yalnız SIRALI (id ASC) satırları döndürür; `hasMore`/`nextCursor`
 *     TEK yerde (bu runner) `rows.length`, `limit` ve son geçerli `id`'den üretilir.
 *     Runner satırları KENDİ SIRALAMAZ.
 *   - Satır kimliği `config.primaryKey`'den okunur (sabit "id" varsayılmaz).
 *   - Join-mode zorunlu `parentReader` eksikse → sessiz skip DEĞİL, AÇIK sözleşme
 *     hatası (throw → çağırana propagate). Reader/parentReader reject'i FATAL,
 *     propagate edilir (IO sınırı çağırandadır).
 *   - Satır-seviyesi beklenmeyen exception yutulmaz-gizlenmez: `failed++`, sonraki
 *     satır işlenir; ham row/içerik/exception sonuca KONMAZ.
 *   - `runSource` row/config/reader-dizisi/parent-map MUTATE ETMEZ.
 */

import type { BuiltIndexUnit } from "./buildCandidate";
import {
  makeParentTenantLookup,
  parentTenantMapKey,
  type ParentTenantMap,
} from "./parentTenantLookup";
import {
  runIndexUnit,
  summarizeRunResults,
  type RunIndexUnitResult,
  type RunSummary,
} from "./runIndexUnit";
import type { SourceConfig } from "./sources";
import type { ParentTenantLookup } from "./tenantResolve";

// ─── Batch sabitleri (config.ts'e EKLENMEZ; burada açık sabit) ────────────────
export const DEFAULT_SOURCE_BATCH_SIZE = 200;
export const MAX_SOURCE_BATCH_SIZE = 500;

// ─── Enjekte IO port sözleşmeleri (implementasyon S2.10) ─────────────────────

/** Reader'ın döndürdüğü sıralı (id ASC) sayfa; cursor/hasMore RUNNER'da hesaplanır. */
export interface SourceRowsPage {
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

/** Kaynak satırlarını keyset (id ASC) okuyan enjekte port (gerçek DB S2.10). */
export interface SourceReader {
  readPage(input: {
    readonly config: SourceConfig;
    readonly afterId: string | null;
    readonly limit: number;
  }): Promise<SourceRowsPage>;
  /**
   * BF-2B exact-write gate — TEK kaydı primary key EŞİTLİĞİYLE okur (cursor/limit
   * genişletme YOK). Opsiyonel port: yalnız exact-record write kapısında kullanılır;
   * geniş sayfa (`readPage`) akışını DEĞİŞTİRMEZ. PK tekil olduğundan en fazla 1 satır
   * beklenir; adapter savunma amacıyla en fazla 2 satır okuyup >1 sözleşme ihlalini
   * çağırana bildirebilir.
   */
  readExactRecord?(input: {
    readonly config: SourceConfig;
    readonly sourceId: string;
  }): Promise<SourceRowsPage>;
}

/** Parent tenant'ları toplu okuyan enjekte port (gerçek `.in()` chunk S2.10). */
export interface ParentTenantReader {
  readParentTenants(input: {
    readonly parentTable: string;
    readonly parentTenantColumn: string;
    readonly parentIds: readonly string[];
  }): Promise<ParentTenantMap>;
}

// ─── Girdi / çıktı sözleşmeleri ───────────────────────────────────────────────

/** runSource girdisi; `parentReader` yalnız join-mode kaynaklarda zorunludur. */
export interface RunSourceInput {
  readonly config: SourceConfig;
  readonly reader: SourceReader;
  readonly parentReader?: ParentTenantReader;
  readonly afterId?: string | null;
  readonly limit?: number;
}

/** Parent ön-yükleme istatistiği (yalnız sayılar; içerik taşımaz). */
export interface ParentPreloadStats {
  readonly requested: number;
  readonly found: number;
  readonly missing: number;
}

/** Tek-sayfa orkestrasyon sonucu (S2.08 `RunSummary` yeniden kullanılır). */
export interface RunSourceResult {
  readonly sourceKey: string;
  readonly fetched: number;
  readonly units: BuiltIndexUnit[];
  readonly summary: RunSummary;
  readonly failed: number;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly parentStats: ParentPreloadStats;
}

const ZERO_PARENT_STATS: ParentPreloadStats = { requested: 0, found: 0, missing: 0 };

// ─── Yardımcılar (dahili; saf; coercion YOK) ──────────────────────────────────

/** Yalnız gerçek string + trim sonrası boş olmayan. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Limit normalizasyonu (fail-safe, deterministik, throw yok):
 *   undefined → DEFAULT · tam sayı değilse / NaN / ±Infinity / < 1 → DEFAULT ·
 *   1..MAX → aynen · > MAX → MAX'a sınırla.
 */
function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_SOURCE_BATCH_SIZE;
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_SOURCE_BATCH_SIZE;
  return Math.min(limit, MAX_SOURCE_BATCH_SIZE);
}

/** Sondan başlayarak ilk geçerli `id`; hiç yoksa null. (Reader id ASC verir.) */
function lastValidCursor(
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  primaryKey: string,
): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const id = rows[i][primaryKey];
    if (isNonEmptyString(id)) return id;
  }
  return null;
}

// ─── Orkestrasyon ─────────────────────────────────────────────────────────────

/**
 * Bir kaynağın tek sayfasını işler → `RunSourceResult`.
 * Async YALNIZ enjekte reader port'ları nedeniyledir; mantık deterministiktir.
 *
 * @throws Reader/parentReader reject'i propagate edilir; join-mode'da zorunlu
 *   `parentReader` eksikse açık sözleşme hatası (fail-closed).
 */
export async function runSource(input: RunSourceInput): Promise<RunSourceResult> {
  const { config, reader, parentReader } = input;
  const limit = normalizeLimit(input.limit);
  const afterId = input.afterId ?? null;

  // 1) Sayfayı oku (reader reject → propagate).
  const page = await reader.readPage({ config, afterId, limit });
  const rows = page.rows;
  const fetched = rows.length;

  // 2) Parent tenant ön-yükleme (yalnız join-mode).
  let parentLookup: ParentTenantLookup | undefined;
  let parentStats: ParentPreloadStats = ZERO_PARENT_STATS;

  if (config.tenant.mode === "join") {
    if (!parentReader) {
      // Sessiz tenant skip DEĞİL: açık sözleşme hatası (fail-closed).
      throw new Error(
        `runSource: '${config.sourceKey}' join-mode kaynağı parentReader gerektirir`,
      );
    }
    const fkColumn = config.tenant.fkColumn;
    const parentTable = config.tenant.parentTable;
    const parentTenantColumn = config.tenant.parentTenantColumn;

    // Sayfadaki geçerli parent FK'ları: dedupe + ilk-görülme sırası korunur.
    const seen = new Set<string>();
    const parentIds: string[] = [];
    for (const row of rows) {
      const fk = row[fkColumn];
      if (isNonEmptyString(fk) && !seen.has(fk)) {
        seen.add(fk);
        parentIds.push(fk);
      }
    }

    // İşlenecek FK yoksa gereksiz IO yapma (boş map ile deterministik devam).
    const map: ParentTenantMap =
      parentIds.length > 0
        ? await parentReader.readParentTenants({ parentTable, parentTenantColumn, parentIds })
        : new Map<string, string | null>();

    parentLookup = makeParentTenantLookup(map);

    let found = 0;
    for (const pid of parentIds) {
      if (map.has(parentTenantMapKey(parentTable, pid))) found += 1;
    }
    parentStats = { requested: parentIds.length, found, missing: parentIds.length - found };
  }

  // 3) Satır-başı orkestrasyon (S2.08 runIndexUnit; per-row hata izolasyonu).
  const results: RunIndexUnitResult[] = [];
  const units: BuiltIndexUnit[] = [];
  let failed = 0;

  for (const row of rows) {
    try {
      const result = runIndexUnit({ config, row, parentLookup });
      results.push(result);
      if (result.status === "unit") units.push(result.unit);
    } catch {
      // Beklenmeyen satır hatası: gizlenmez ama batch'i durdurmaz.
      // Ham row/içerik/exception SONUCA KONMAZ; yalnız sayılır.
      failed += 1;
    }
  }

  const summary = summarizeRunResults(results);

  // 4) Keyset cursor (tek yerde; reader id ASC sözleşmesine dayanır).
  const cursor = lastValidCursor(rows, config.primaryKey);
  const hasMore = fetched === limit && cursor !== null;
  const nextCursor = hasMore ? cursor : null;

  return {
    sourceKey: config.sourceKey,
    fetched,
    units,
    summary,
    failed,
    nextCursor,
    hasMore,
    parentStats,
  };
}
