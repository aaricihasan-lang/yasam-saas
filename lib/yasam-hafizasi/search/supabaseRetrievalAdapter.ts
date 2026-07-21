/**
 * Yaşam Hafızası™ — Supabase Retrieval IO Adapter (Sprint 2 / S2.19A, IO katmanı).
 *
 * S2.19A'nın **TEK Supabase-bağımlı dosyası**. Saf `retrievalExecutor`'ın enjekte
 * port'larının (RPC portu + `StoneExclusionPort`) gerçek `service_role` implementasyonu.
 *
 * KANONİK KURALLAR (S2.10 index adapter deseniyle simetrik):
 *   - `getServerDb()` (service_role) sonucu buraya DAR yapısal `RetrievalDbClient`
 *     olarak verilir (test edilebilirlik; geniş `SupabaseClient` bağımlılığı yok, `any` yok).
 *   - RPC adı + parametre adları YALNIZ statik sabitler; kullanıcı girdisi interpolate
 *     EDİLMEZ (Supabase `.rpc()` parametreleri tipli/parametreli → injection yüzeyi yok).
 *   - `p_weights` descriptor'dan **[A,B,C,D] doğal sırasında** iletilir (PG {D,C,B,A}
 *     dönüşümü RPC içinde; bkz. migration). Ranking TS'te HESAPLANMAZ.
 *   - Ham Supabase/DB hata mesajı DIŞARI TAŞINMAZ: RPC hatası → sabit kod fail-closed;
 *     stone portu hatası → sabit mesajlı throw (`evaluateVisibility` fail-closed yakalar).
 *   - **Blanket try/catch YOK** — yalnız beklenen `{data,error}` sınırı sonuç tipine çevrilir.
 */

import { getServerDb } from "@/lib/supabase-server";
import type { StoneExclusionPort } from "./visibilityScope";
import type { RetrievalQueryDescriptor } from "./retrievalQuery";
import {
  executeRetrieval,
  type RetrievalExecutionResult,
  type RetrievalRpcPort,
} from "./retrievalExecutor";

/** RPC fonksiyon adı (statik; migration ile birebir). */
const RETRIEVAL_RPC = "yh_search_candidates" as const;
/** Kullanıcı-bazlı taş gizleme tablosu (statik). */
const STONE_EXCLUSIONS_TABLE = "stone_exclusions" as const;

// ─── Dar yapısal DB client (getServerDb bununla uyumludur; `any` yok) ─────────
export interface RetrievalDbResult {
  readonly data: unknown[] | null;
  readonly error: { readonly message: string } | null;
}
export interface RetrievalRpcResponse {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}
export interface RetrievalSelectBuilder extends PromiseLike<RetrievalDbResult> {
  eq(column: string, value: unknown): RetrievalSelectBuilder;
  limit(count: number): RetrievalSelectBuilder;
}
export interface RetrievalTableBuilder {
  select(columns: string): RetrievalSelectBuilder;
}
export interface RetrievalDbClient {
  from(table: string): RetrievalTableBuilder;
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<RetrievalRpcResponse>;
}

/** service_role client'ı dar arayüze indirger (any değil; sanctioned narrowing). */
function serverRetrievalDb(): RetrievalDbClient {
  return getServerDb() as unknown as RetrievalDbClient;
}

// ─── RPC portu (gerçek) ───────────────────────────────────────────────────────
/**
 * `public.yh_search_candidates` çağrısı. `p_weights` [A,B,C,D] iletilir. DB hatası →
 * ham mesaj sızmadan `{ok:false, code:'retrieval-execution-failed'}`.
 */
export function createSupabaseRetrievalRpcPort(db: RetrievalDbClient): RetrievalRpcPort {
  return async (params) => {
    const { data, error } = await db.rpc(RETRIEVAL_RPC, {
      p_tsquery: params.tsquery,
      p_session_tenant: params.sessionTenantId,
      p_allow_shared: params.allowShared,
      p_weights: params.weights,
      p_limit: params.limit,
    });
    if (error) {
      return { ok: false, code: "retrieval-execution-failed" };
    }
    return { ok: true, rows: Array.isArray(data) ? data : [] };
  };
}

// ─── Stone exclusion portu (gerçek) ───────────────────────────────────────────
/**
 * `stone_exclusions`'ta (tenant_id, stone_id) varlığını sorgular → `true`=hariç.
 * `stoneSourceId` index satırının `source_id`'sidir (= stone_exclusions.stone_id).
 * DB hatasında sabit mesajlı throw → `evaluateVisibility` fail-closed (görünmez).
 */
export function createSupabaseStoneExclusionPort(db: RetrievalDbClient): StoneExclusionPort {
  return async ({ sessionTenantId, stoneSourceId }) => {
    const { data, error } = await db
      .from(STONE_EXCLUSIONS_TABLE)
      .select("stone_id")
      .eq("tenant_id", sessionTenantId)
      .eq("stone_id", stoneSourceId)
      .limit(1);
    if (error) {
      throw new Error("stone-exclusion-failed"); // ham mesaj sızmaz
    }
    return Array.isArray(data) && data.length > 0;
  };
}

// ─── Birleşik executor fabrikası ──────────────────────────────────────────────
/**
 * Descriptor → `Candidate[]` çalıştırıcısı (service_role). RPC portu + stone portu
 * saf `executeRetrieval`'a enjekte edilir. `db` verilmezse `getServerDb()` (service_role).
 */
export function createSupabaseRetrievalExecutor(
  db: RetrievalDbClient = serverRetrievalDb(),
): (descriptor: RetrievalQueryDescriptor) => Promise<RetrievalExecutionResult> {
  const rpc = createSupabaseRetrievalRpcPort(db);
  const stonePort = createSupabaseStoneExclusionPort(db);
  return (descriptor) => executeRetrieval(descriptor, rpc, stonePort);
}
