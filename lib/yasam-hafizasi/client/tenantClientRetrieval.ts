/**
 * PRIVATE MEMORY — TENANT-WIDE client retrieval adaptörü (SAF; DB/IO çağrı portu).
 *
 * Politika Kilidi md.6: TENANT-WIDE PRIVATE CLIENT SEARCH (client_id URL'de DEĞİL).
 * Mevcut queryPipeline (tsquery üretimi) yeniden kullanılır; per-client adaptörden tek
 * fark: yh_search_tenant_client_candidates çağrılır (client_id parametresi YOK; satırlar
 * client_id TAŞIR → endpoint ad'ı query-time resolve eder). Şema/RPC uygulanmadıysa
 * (dormant) "unavailable" döner → route güvenli disabled state verir.
 */
import { buildRetrievalDescriptor } from "@/lib/yasam-hafizasi/search/queryPipeline";
import type { TenantClientRpcRow } from "./tenantClientSearchResult";

const TENANT_CLIENT_RPC = "yh_search_tenant_client_candidates";
/** v2: modül + tarih penceresi SQL'de LIMIT'ten ÖNCE (tarih ekseni occurred_at → source_updated_at → indexed_at). */
const TENANT_CLIENT_RPC_V2 = "yh_search_tenant_client_candidates_v2";
/** undefined function / undefined table / PostgREST rpc-not-found → şema henüz yok. */
const UNAVAILABLE_CODES = new Set(["42883", "42P01", "PGRST202", "PGRST302"]);

export interface TenantClientRpcDb {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type TenantClientRetrievalOutcome =
  /** filteredInSql: modül + tarih filtresi SQL'de (v2) uygulandı → uygulama katmanı tarih filtresi ATLANIR. */
  | { kind: "rows"; rows: TenantClientRpcRow[]; filteredInSql: boolean }
  | { kind: "noop" }
  | { kind: "unavailable" }
  | { kind: "error" };

export interface TenantClientRetrievalInput {
  rawQuery: string;
  sessionTenantId: string;
  limit: number;
  /** SQL modül filtresi (kapsam ∩ istenen); null → filtre yok. */
  modules?: readonly string[] | null;
  /** YYYY-MM-DD (UTC gün sınırı; to gün sonu dahil). */
  dateFrom?: string | null;
  dateTo?: string | null;
}

export async function runTenantClientRetrieval(
  db: TenantClientRpcDb,
  input: TenantClientRetrievalInput,
): Promise<TenantClientRetrievalOutcome> {
  const { descriptor } = buildRetrievalDescriptor({
    rawQuery: input.rawQuery,
    sessionTenantId: input.sessionTenantId,
    allowShared: false,
  });
  if (descriptor.kind !== "query") return { kind: "noop" };

  const w = descriptor.ranking.weights;
  let filteredInSql = true;
  let { data, error } = await db.rpc(TENANT_CLIENT_RPC_V2, {
    p_tsquery: descriptor.tsquery,
    p_session_tenant: input.sessionTenantId,
    p_weights: [w.A, w.B, w.C, w.D],
    p_limit: input.limit,
    p_modules: input.modules == null ? null : [...input.modules],
    p_date_from: input.dateFrom ? input.dateFrom.slice(0, 10) : null,
    p_date_to: input.dateTo ? input.dateTo.slice(0, 10) : null,
  });
  if (error && error.code === "PGRST202") {
    filteredInSql = false;
    // v2 henüz uygulanmamış DB → v1 (filtreler uygulama katmanında kalır).
    ({ data, error } = await db.rpc(TENANT_CLIENT_RPC, {
      p_tsquery: descriptor.tsquery,
      p_session_tenant: input.sessionTenantId,
      p_weights: [w.A, w.B, w.C, w.D],
      p_limit: input.limit,
    }));
  }

  if (error) {
    if (error.code && UNAVAILABLE_CODES.has(error.code)) return { kind: "unavailable" };
    return { kind: "error" };
  }
  const rows = Array.isArray(data) ? (data as TenantClientRpcRow[]) : [];
  return { kind: "rows", rows, filteredInSql };
}
