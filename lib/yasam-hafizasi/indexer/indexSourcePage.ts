/**
 * Yaşam Hafızası™ — Tek-Sayfa İndeksleme Orkestrasyonu (Sprint 2 / S2.10, ince IO).
 *
 * Gerçek adapter'ları kurar, `runSource()` çağırır, demo tenant unit'lerini writer
 * ÖNCESİNDE zorunlu düşürür ve (write modunda) `IndexWriter`'a verir. Tek kaynak,
 * tek sayfa. Çok-sayfalı runner / admin route / cron BU DOSYADA YOKTUR (S2.11+).
 *
 * KANONİK KURALLAR (S2.10):
 *   - Demo tenant (`YH_DEMO_TENANT_ID`, config'ten import; config DEĞİŞMEZ) unit'leri
 *     writer'a ULAŞMAZ; write planına girmez (K-L). Reader seviyesinde filtrelenmez
 *     (join child'da tenant_id yok → aynı garanti verilemez); orkestrasyonda düşülür.
 *   - Sonuç yalnız GÜVENLİ sayı/özet taşır; ham `units` / demo içeriği DIŞARI SIZMAZ.
 *   - Dry-run modunda writer çağrılmaz.
 *   - Kaynak/parent okuma hatası fatal propagate; write hatası kontrollü sonuç.
 *   - `getServerDb()` yalnız gerçek kullanımda ve fonksiyon İÇİNDE çağrılır (modül
 *     import side-effect'i yok); test için `db` enjekte edilebilir.
 */

import { getServerDb } from "../../supabase-server";
import { YH_DEMO_TENANT_ID } from "../config";
import {
  createSupabaseIndexWriter,
  createSupabaseParentTenantReader,
  createSupabaseSourceReader,
  type IndexDbClient,
  type WriteIndexUnitsResult,
} from "./supabaseIndexAdapters";
import type { ParentPreloadStats } from "./runSource";
import { runSource } from "./runSource";
import type { RunSummary } from "./runIndexUnit";
import type { SourceConfig } from "./sources";

export type IndexSourcePageMode = "dry-run" | "write";

/**
 * Girdi. `config` statik allowlist'ten (`YH_INDEX_SOURCES`) gelmelidir; mevcut
 * `sources.ts` sourceKey→config registry export etmediğinden ve o dosya korunan
 * olduğundan, config caller tarafından statik olarak verilir (registry uydurulmaz).
 * `db` yalnız test için enjekte edilir; verilmezse `getServerDb()` kullanılır.
 */
export interface IndexSourcePageInput {
  readonly config: SourceConfig;
  readonly afterId?: string | null;
  readonly limit?: number;
  readonly mode: IndexSourcePageMode;
  readonly db?: IndexDbClient;
}

/** Sonuç — yalnız güvenli sayılar/özet; ham unit veya demo içeriği taşımaz. */
export interface IndexSourcePageResult {
  readonly sourceKey: string;
  readonly mode: IndexSourcePageMode;
  readonly fetched: number;
  readonly eligibleUnits: number; // demo düşüldükten sonra writer'a giden
  readonly excludedDemo: number;
  readonly summary: RunSummary;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly parentStats: ParentPreloadStats;
  readonly write: WriteIndexUnitsResult | null; // dry-run → null
}

export async function indexSourcePage(
  input: IndexSourcePageInput,
): Promise<IndexSourcePageResult> {
  const { config, mode } = input;
  const db: IndexDbClient = input.db ?? (getServerDb() as unknown as IndexDbClient);

  const reader = createSupabaseSourceReader(db);
  const parentReader =
    config.tenant.mode === "join" ? createSupabaseParentTenantReader(db) : undefined;

  // Kaynak/parent okuma hatası fatal propagate (IO sınırı çağırandadır).
  const page = await runSource({
    config,
    reader,
    parentReader,
    afterId: input.afterId ?? null,
    limit: input.limit,
  });

  // Demo tenant unit'lerini writer ÖNCESİ zorunlu düş (mode-agnostik; ham içerik sızmaz).
  const eligible = page.units.filter((u) => u.tenantId !== YH_DEMO_TENANT_ID);
  const excludedDemo = page.units.length - eligible.length;

  let write: WriteIndexUnitsResult | null = null;
  if (mode === "write") {
    const writer = createSupabaseIndexWriter(db);
    write = await writer.write({ config, units: eligible });
  }

  return {
    sourceKey: page.sourceKey,
    mode,
    fetched: page.fetched,
    eligibleUnits: eligible.length,
    excludedDemo,
    summary: page.summary,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    parentStats: page.parentStats,
    write,
  };
}
