/**
 * PRIVATE MEMORY — TENANT-WIDE client arama yanıt sözleşmesi + güvenli DTO (SAF).
 *
 * Politika Kilidi md.7: danışan adı index'e KOPYALANMAZ. RPC satırı client_id taşır;
 * ad server-side (clients tablosundan, tenant-scoped) resolve edilip DTO'ya EKLENİR.
 * Ham tenant_id DÖNMEZ. isClientScoped:true; sourceLink allowlist.
 */
import {
  toClientSearchResult,
  type ClientRpcRow,
  type ClientSearchResult,
  type ClientFacet,
} from "./clientSearchResult";
import { computeClientFacets } from "./clientSearchResult";
import { clientDetailDeepLink, type ClientSourceModule } from "./clientSources";

/** Tenant-wide RPC satırı (yh_search_tenant_client_candidates; client_id EK alan). */
export interface TenantClientRpcRow extends ClientRpcRow {
  client_id: string;
}

/** Tenant-wide sonuç: per-client DTO + client_id + server-resolved ad + danışan detay deep-link. */
export interface TenantClientSearchResult extends ClientSearchResult {
  clientId: string;
  clientName: string;
  /** İlgili DANIŞANIN detay sayfası + modül sekmesi (generic modül ana sayfası DEĞİL). */
  clientDeepLink: string | null;
}

export type TenantClientEmptyReason = "no-query" | "no-results" | "filtered";

export interface TenantClientSearchResponse {
  ok: boolean;
  disabled?: boolean;
  reason?: "not-active" | "flag-disabled" | "demo";
  query: string;
  total: number;
  facets: ClientFacet[];
  results: TenantClientSearchResult[];
  emptyReason?: TenantClientEmptyReason;
  code?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ad çözülemezse gösterilecek nötr etiket (PII sızıntısı değil). */
export const CLIENT_NAME_FALLBACK = "Danışan";

/** Satır kümesindeki benzersiz, geçerli client_id'ler (ad resolve sorgusu için). */
export function distinctClientIds(rows: readonly TenantClientRpcRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (typeof r.client_id === "string" && UUID_RE.test(r.client_id)) set.add(r.client_id);
  }
  return [...set];
}

/**
 * Tenant-wide RPC satırı → güvenli DTO. module bilinmiyorsa veya client_id geçersizse
 * null (fail-closed eleme). Ad, nameById üzerinden resolve edilir (yoksa fallback).
 */
export function toTenantClientSearchResult(
  row: TenantClientRpcRow,
  nameById: ReadonlyMap<string, string>,
): TenantClientSearchResult | null {
  if (typeof row.client_id !== "string" || !UUID_RE.test(row.client_id)) return null;
  const base = toClientSearchResult(row);
  if (base === null) return null;
  const resolved = nameById.get(row.client_id);
  return {
    ...base,
    clientId: row.client_id,
    clientName: resolved && resolved.trim().length > 0 ? resolved : CLIENT_NAME_FALLBACK,
    clientDeepLink: clientDetailDeepLink(row.client_id, base.module),
  };
}

export function computeTenantFacets(results: readonly TenantClientSearchResult[]): ClientFacet[] {
  // TenantClientSearchResult, ClientSearchResult'ı genişletir → doğrudan yeniden kullanım.
  return computeClientFacets(results);
}

export function filterTenantByModules(
  results: readonly TenantClientSearchResult[],
  modules: readonly ClientSourceModule[] | undefined,
): TenantClientSearchResult[] {
  if (!modules || modules.length === 0) return [...results];
  const set = new Set<ClientSourceModule>(modules);
  return results.filter((r) => set.has(r.module));
}
