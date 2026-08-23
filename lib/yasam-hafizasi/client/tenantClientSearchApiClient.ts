/**
 * PRIVATE MEMORY — TENANT-WIDE Danışan Hafızası arama istemci yardımcısı (client-safe).
 *
 * Per-client helper'dan (clientSearchApiClient.fetchClientYhSearch) farkı: clientId YOK →
 * uzmanın kendi tenant'ındaki TÜM danışan geçmişinde arar. Endpoint:
 *   POST /api/yasam-hafizasi/client-search
 * Auth başlıkları mevcut kalıpla (x-user-id + x-session-token). tenantId/clientId ASLA
 * gönderilmez (tenant server session'dan çözülür; body'de tenant/client yok sayılır).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { ClientSourceModule } from "./clientSources";
import type { TenantClientSearchResponse } from "./tenantClientSearchResult";

export interface TenantClientSearchParams {
  q: string;
  modules?: ClientSourceModule[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function fetchTenantClientYhSearch(
  params: TenantClientSearchParams,
  signal?: AbortSignal,
): Promise<TenantClientSearchResponse> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch("/api/yasam-hafizasi/client-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": u?.id ?? "",
        ...(t ? { "x-session-token": t } : {}),
      },
      body: JSON.stringify(params),
      signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof data === "object" && "results" in data) {
      return data as TenantClientSearchResponse;
    }
    return { ok: false, query: params.q, total: 0, facets: [], results: [], code: `HTTP_${res.status}` };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, query: params.q, total: 0, facets: [], results: [], code: "ABORTED" };
    }
    return { ok: false, query: params.q, total: 0, facets: [], results: [], code: "NETWORK" };
  }
}
