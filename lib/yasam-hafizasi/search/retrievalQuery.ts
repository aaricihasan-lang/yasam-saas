/**
 * Yaşam Hafızası™ — Retrieval Query Descriptor / Execution Contract (Sprint 2 / S2.18, EX-D).
 *
 * S2.17 `TsQueryPlan` çıktısını tüketip, retrieval'ın DB yürütmesi için gereken TÜM kararları
 * **saf, deterministik, DB'siz bir typed descriptor** olarak paketler — ama DB'ye gitmeden, SQL
 * üretmeden, ts_rank hesaplamadan (kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §3+§9).
 * Gerçek `.textSearch`/`.rpc()` + PostgreSQL fonksiyonu + DDL, sonraki faza (S2.19) aittir.
 *
 * SÖZLEŞME (kilitli):
 *   - Girdi: `TsQueryPlan` (S2.17) + `VisibilityContext` (S2.13). Çıktı: `RetrievalQueryDescriptor`
 *     discriminated union — `kind:'noop'` (execution YASAK) | `kind:'query'` (güvenli descriptor).
 *     Adapter (S2.19) sözleşmesi: YALNIZ `kind:'query'` çalıştırılabilir.
 *   - **Visibility yeniden hesaplanmaz (K1):** `VisibilityContext`, `evaluateVisibility`'nin GİRDİ
 *     context'idir (session-türevli güvenilir tenant/shared), per-candidate evaluated karar DEĞİL.
 *     Bu birim ikinci bir tenant/shared/PII/demo karar motoru KURMAZ; yalnız context'i sınır
 *     doğrulamasından geçirip TAŞIR. Yetkili satır-kararı S2.13 `evaluateVisibility`; §9 WHERE
 *     materyalizasyonu S2.19. (PII/demo `VisibilityContext`'te yok → descriptor'a ikinci kopya
 *     olarak da EKLENMEZ; onların sahibi S2.13 + ana-indeks kısıtlarıdır.)
 *   - **String SQL YOK (K3):** SQL/WHERE metni, fragment, birleştirilmiş güvenlik filtresi ÜRETİLMEZ.
 *     Visibility/ranking/limit yalnız typed veri. SQL/RPC parametre dönüşümü S2.19 sorumluluğu.
 *   - **Ranking intent taşınır, yürütülmez (K4):** weighted ts_rank gereksinimi + `YH_TSV_WEIGHTS`
 *     (kaynak adı + güvenli readonly DEĞER KOPYASI) + `direction:'desc'` + `YH_CANDIDATE_LIMIT`
 *     (kaynak adı + değer). ts_rank HESAPLANMAZ; SQL ifadesi ÜRETİLMEZ.
 *   - **Config referansı sızdırılmaz (K5/K6):** `YH_TSV_WEIGHTS` `as const`tir ama runtime'da FROZEN
 *     DEĞİL → descriptor mutasyona açık aynı referansı taşımaz; taze `Object.freeze`'li kopya üretir.
 *   - **Fail-safe (K2/K6):** yalnız BEKLENEN veri-kaynaklı geçersizlikler `noop`'a döner (açık type
 *     guard'lar): boş/geçersiz tsquery → `'empty-tsquery'`; geçersiz session sınırı →
 *     `'invalid-visibility-context'`. **Blanket try/catch YOK** — programlama hataları yutulmaz
 *     (yüzeye çıkar). "Asla throw etmez" YALNIZ beklenen geçersizlikler için geçerlidir.
 *   - **Immutability (K6):** descriptor + her iç nesne (ranking/weights/limit/visibility) AYRI AYRI
 *     `Object.freeze` (shallow freeze derin garanti gibi sunulmaz); her çağrı taze; girdi mutasyonsuz.
 *   - **Kapsam dışı:** gerçek DB/Supabase/RPC/textSearch · migration/DDL · Evidence Gate · derece ·
 *     "Neden?" · module facet · ts_rank hesaplama · SQL/WHERE üretimi.
 */

import type { TsQueryPlan } from "./tsQueryPlan";
import type { VisibilityContext } from "./visibilityScope";
import { YH_CANDIDATE_LIMIT, YH_TSV_WEIGHTS } from "../config";

/** Sınırlı, type-safe `noop` gerekçesi (yalnız BEKLENEN veri-kaynaklı geçersizlik). */
export type RetrievalQueryNoopReason = "empty-tsquery" | "invalid-visibility-context";

/** ts_rank ağırlık niyeti — `YH_TSV_WEIGHTS` (§3) değerinin güvenli readonly kopyası. */
export interface RetrievalTsvWeights {
  readonly A: number;
  readonly B: number;
  readonly C: number;
  readonly D: number;
}

/** Ranking execution niyeti (S2.19 materyalize eder; bu birim HESAPLAMAZ). */
export interface RetrievalRankingIntent {
  /** Weighted ts_rank gereksinimi (sabit; §3). */
  readonly requiresWeightedTsRank: true;
  /** Ağırlık kaynağı (tek config kaynağı izlenebilirliği; K5). */
  readonly weightsSource: "YH_TSV_WEIGHTS";
  /** `YH_TSV_WEIGHTS` değerinin taze frozen kopyası (paylaşılan referans sızmaz). */
  readonly weights: RetrievalTsvWeights;
  /** Sıralama yönü (§3: ts_rank azalan). */
  readonly direction: "desc";
}

/** Aday tavanı execution niyeti (S2.19 uygular; bu birim kesme YAPMAZ). */
export interface RetrievalLimitIntent {
  /** Limit kaynağı (tek config kaynağı izlenebilirliği; K5). */
  readonly source: "YH_CANDIDATE_LIMIT";
  /** `YH_CANDIDATE_LIMIT` değeri. */
  readonly value: number;
}

/** Yürütülebilir güvenli descriptor (adapter YALNIZ bunu çalıştırabilir). */
export interface RetrievalQueryDescriptorQuery {
  readonly kind: "query";
  /** PostgreSQL text-search config (S2.17 plan ile simetrik). */
  readonly config: "simple";
  /** Hedef kolon (S2.17 plan ile aynı). */
  readonly column: "search_tsv";
  /** S2.17 `TsQueryPlan.tsquery` — BİREBİR korunur (yeniden üretilmez). */
  readonly tsquery: string;
  /** S2.13 session context'i TAŞINIR (yeniden hesaplanmaz; taze frozen kopya). */
  readonly visibility: VisibilityContext;
  /** Ranking execution niyeti (yürütülmez). */
  readonly ranking: RetrievalRankingIntent;
  /** Aday tavanı execution niyeti. */
  readonly limit: RetrievalLimitIntent;
}

/** Execution YASAK sonucu (fail-closed; adapter çalıştıramaz). */
export interface RetrievalQueryDescriptorNoop {
  readonly kind: "noop";
  readonly reason: RetrievalQueryNoopReason;
}

/** Retrieval query sözleşmesi — fail-closed discriminated union. */
export type RetrievalQueryDescriptor =
  | RetrievalQueryDescriptorQuery
  | RetrievalQueryDescriptorNoop;

/** Fail-closed `noop` üretici (taze frozen). */
function noop(reason: RetrievalQueryNoopReason): RetrievalQueryDescriptorNoop {
  return Object.freeze({ kind: "noop", reason });
}

/**
 * S2.17 `TsQueryPlan` + S2.13 `VisibilityContext`'ten güvenli/deterministik/DB'siz retrieval
 * query descriptor üretir. Saf + fail-safe; BEKLENEN geçersizlikte `noop`, aksi `query`.
 * Programlama hataları YUTULMAZ (blanket try/catch yok). Her çağrı taze frozen nesne.
 */
export function buildRetrievalQuery(
  plan: TsQueryPlan,
  visibility: VisibilityContext,
): RetrievalQueryDescriptor {
  // 1) Plan → tsquery. Beklenen veri-kaynaklı geçersizlik → 'empty-tsquery' (fail-closed).
  //    Sınırda `unknown` üzerinden koru: TS tipine rağmen çağıran bozuk değer geçebilir.
  const rawPlan: unknown = plan;
  if (rawPlan === null || typeof rawPlan !== "object") return noop("empty-tsquery");
  const p = rawPlan as { tsquery?: unknown; isEmpty?: unknown };
  if (p.isEmpty === true) return noop("empty-tsquery");
  const tsquery = p.tsquery;
  if (typeof tsquery !== "string" || tsquery.trim().length === 0) {
    return noop("empty-tsquery");
  }

  // 2) Visibility sınırı → 'invalid-visibility-context' (fail-closed). Bu bir karar motoru DEĞİL;
  //    yalnız S2.13 context'inin geçerli/güvenilir olduğunu doğrulayan sınır guard'ı
  //    (S2.13 `normalizedId` ile aynı: string + trim boş-değil). Politika yeniden hesaplanmaz.
  const rawVis: unknown = visibility;
  if (rawVis === null || typeof rawVis !== "object") {
    return noop("invalid-visibility-context");
  }
  const v = rawVis as { sessionTenantId?: unknown; allowShared?: unknown };
  const sessionTenantId =
    typeof v.sessionTenantId === "string" ? v.sessionTenantId.trim() : "";
  if (sessionTenantId.length === 0) return noop("invalid-visibility-context");
  if (typeof v.allowShared !== "boolean") return noop("invalid-visibility-context");

  // 3) QUERY descriptor — taze nesneler, paylaşılan/config referansı sızmaz, her katman frozen.
  const weights: RetrievalTsvWeights = Object.freeze({
    A: YH_TSV_WEIGHTS.A,
    B: YH_TSV_WEIGHTS.B,
    C: YH_TSV_WEIGHTS.C,
    D: YH_TSV_WEIGHTS.D,
  });
  const ranking: RetrievalRankingIntent = Object.freeze({
    requiresWeightedTsRank: true,
    weightsSource: "YH_TSV_WEIGHTS",
    weights,
    direction: "desc",
  });
  const limit: RetrievalLimitIntent = Object.freeze({
    source: "YH_CANDIDATE_LIMIT",
    value: YH_CANDIDATE_LIMIT,
  });
  // Visibility: S2.13 sözleşmesi TAŞINIR (yeniden hesaplanmaz). Taze frozen kopya → çağıranın
  // referansı sızmaz, girdi mutasyona uğramaz. sessionTenantId, S2.13'ün uyguladığı sınır
  // trim'i ile kanonikleştirilir (karar değil, sınır normalizasyonu).
  const carriedVisibility: VisibilityContext = Object.freeze({
    sessionTenantId,
    allowShared: v.allowShared,
  });

  const descriptor: RetrievalQueryDescriptorQuery = Object.freeze({
    kind: "query",
    config: "simple",
    column: "search_tsv",
    tsquery, // S2.17 planından birebir
    visibility: carriedVisibility,
    ranking,
    limit,
  });
  return descriptor;
}
