/**
 * BF-14 Paket 1 — Client retrieval adaptörü. Mevcut queryPipeline (tsquery üretimi)
 * yeniden kullanılır; yalnız client-scoped RPC portu farklıdır. Şema/RPC henüz
 * uygulanmadıysa (dormant) "unavailable" döner → route güvenli disabled state verir.
 */
import { buildRetrievalDescriptor } from "@/lib/yasam-hafizasi/search/queryPipeline";
import type { ClientRpcRow } from "./clientSearchResult";

const CLIENT_RPC = "yh_search_client_candidates";
/** undefined function / undefined table / PostgREST rpc-not-found → şema henüz yok. */
const UNAVAILABLE_CODES = new Set(["42883", "42P01", "PGRST202", "PGRST302"]);

export interface ClientRpcDb {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type ClientRetrievalOutcome =
  | { kind: "rows"; rows: ClientRpcRow[] }
  | { kind: "noop" }
  | { kind: "unavailable" }
  | { kind: "error" };

export interface ClientRetrievalInput {
  rawQuery: string;
  sessionTenantId: string;
  clientId: string;
  limit: number;
}

export async function runClientRetrieval(
  db: ClientRpcDb,
  input: ClientRetrievalInput,
): Promise<ClientRetrievalOutcome> {
  const { descriptor } = buildRetrievalDescriptor({
    rawQuery: input.rawQuery,
    sessionTenantId: input.sessionTenantId,
    allowShared: false,
  });
  if (descriptor.kind !== "query") return { kind: "noop" };

  const w = descriptor.ranking.weights;
  const { data, error } = await db.rpc(CLIENT_RPC, {
    p_tsquery: descriptor.tsquery,
    p_session_tenant: input.sessionTenantId,
    p_client_id: input.clientId,
    p_weights: [w.A, w.B, w.C, w.D],
    p_limit: input.limit,
  });

  if (error) {
    if (error.code && UNAVAILABLE_CODES.has(error.code)) return { kind: "unavailable" };
    return { kind: "error" };
  }
  const rows = Array.isArray(data) ? (data as ClientRpcRow[]) : [];
  return { kind: "rows", rows };
}
