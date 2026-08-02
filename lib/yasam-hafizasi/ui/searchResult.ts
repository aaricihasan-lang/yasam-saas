/**
 * BF-13 — Kullanıcı arama yanıt sözleşmesi + güvenli DTO eşlemesi (SAF).
 *
 * `Candidate` (retrieval çıktısı) → UI'ya dönecek GÜVENLİ alanlara indirger:
 *   - ham `tenantId` DÖNMEZ (yalnız `isShared` boolean türetilir)
 *   - PII/secret DÖNMEZ (index zaten PII-free; yine de tenantId gizlenir)
 *   - modül etiketi + kaynak bağlantısı merkezî allowlist'ten
 * Facet sayımı ve modül filtresi de burada (sunum katmanı; yeni sorgu yapmaz).
 */
import type { Candidate } from "@/lib/yasam-hafizasi/search/types";
import type { YhSourceModule } from "@/lib/yasam-hafizasi/config";
import { moduleLabel, sourceLinkFor } from "./moduleLabels";

export interface YhEvidence {
  kind: string;
  text: string;
}
export interface YhRelation {
  kind: string;
  targetLabel: string;
}

export interface YhSearchResult {
  id: string;
  module: YhSourceModule;
  moduleLabel: string;
  sourceTable: string;
  sourceId: string;
  title: string | null;
  snippet: string | null;
  evidence: YhEvidence[];
  topicTags: string[];
  relations: YhRelation[];
  /** tenant_id IS NULL → paylaşımlı/kütüphane içeriği. Ham tenantId DÖNMEZ. */
  isShared: boolean;
  updatedAt: string | null;
  /** Yalnız allowlist route; yoksa null. */
  sourceLink: string | null;
}

export interface YhFacet {
  module: YhSourceModule;
  moduleLabel: string;
  count: number;
}

export type YhEmptyReason = "no-query" | "no-results" | "filtered";

export interface YhSearchResponse {
  ok: boolean;
  /** Tenant flag'i (yh_enabled/yh_hizli) kapalı veya demo → arama yapılmadı. */
  disabled?: boolean;
  query: string;
  total: number;
  facets: YhFacet[];
  results: YhSearchResult[];
  emptyReason?: YhEmptyReason;
  /** Hata/erişim kodu (yalnız ok=false). */
  code?: string;
}

/** Candidate → güvenli DTO (ham tenantId çıkarılır). */
export function toSearchResult(c: Candidate): YhSearchResult {
  return {
    id: c.id,
    module: c.sourceModule,
    moduleLabel: moduleLabel(c.sourceModule),
    sourceTable: c.sourceTable,
    sourceId: c.sourceId,
    title: c.title,
    snippet: c.snippet,
    evidence: (c.evidenceFields ?? []).map((e) => ({ kind: e.kind, text: e.text })),
    topicTags: c.topicTags ?? [],
    relations: (c.expertRelations ?? []).map((r) => ({ kind: r.kind, targetLabel: r.targetLabel })),
    isShared: c.tenantId === null,
    updatedAt: c.sourceUpdatedAt,
    sourceLink: sourceLinkFor(c.sourceModule),
  };
}

/** Modül faset sayaçları (tüm sonuç kümesi üzerinden; filtreden ÖNCE). */
export function computeFacets(results: readonly YhSearchResult[]): YhFacet[] {
  const counts = new Map<YhSourceModule, number>();
  for (const r of results) counts.set(r.module, (counts.get(r.module) ?? 0) + 1);
  return [...counts.entries()]
    .map(([module, count]) => ({ module, moduleLabel: moduleLabel(module), count }))
    .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));
}

/** Seçili modüllere göre sunum filtresi (boş → tümü). */
export function filterByModules(
  results: readonly YhSearchResult[],
  modules: readonly YhSourceModule[] | undefined,
): YhSearchResult[] {
  if (!modules || modules.length === 0) return [...results];
  const set = new Set<YhSourceModule>(modules);
  return results.filter((r) => set.has(r.module));
}
