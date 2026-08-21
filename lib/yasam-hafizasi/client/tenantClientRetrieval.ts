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
/** undefined function / undefined table / PostgREST rpc-not-found → şema henüz yok. */
const UNAVAILABLE_CODES = new Set(["42883", "42P01", "PGRST202", "PGRST302"]);

export interface TenantClientRpcDb {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type TenantClientRetrievalOutcome =
  | { kind: "rows"; rows: TenantClientRpcRow[] }
  | { kind: "noop" }
  | { kind: "unavailable" }
  | { kind: "error" };

export interface TenantClientRetrievalInput {
  rawQuery: string;
  sessionTenantId: string;
  limit: number;
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
  const { data, error } = await db.rpc(TENANT_CLIENT_RPC, {
    p_tsquery: descriptor.tsquery,
    p_session_tenant: input.sessionTenantId,
    p_weights: [w.A, w.B, w.C, w.D],
    p_limit: input.limit,
  });

  if (error) {
    if (error.code && UNAVAILABLE_CODES.has(error.code)) return { kind: "unavailable" };
    return { kind: "error" };
  }
  const rows = Array.isArray(data) ? (data as TenantClientRpcRow[]) : [];
  return { kind: "rows", rows };
}
