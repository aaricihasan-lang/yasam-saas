/**
 * BF-14 Paket 1 — Client arama istemci yardımcısı (client-safe).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { ClientSourceModule } from "./clientSources";
import type { ClientSearchResponse } from "./clientSearchResult";

export interface ClientSearchParams {
  q: string;
  modules?: ClientSourceModule[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function fetchClientYhSearch(
  clientId: string,
  params: ClientSearchParams,
  signal?: AbortSignal,
): Promise<ClientSearchResponse> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/yasam-hafizasi/search`, {
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
      return data as ClientSearchResponse;
    }
    return { ok: false, query: params.q, total: 0, facets: [], results: [], code: `HTTP_${res.status}` };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, query: params.q, total: 0, facets: [], results: [], code: "ABORTED" };
    }
    return { ok: false, query: params.q, total: 0, facets: [], results: [], code: "NETWORK" };
  }
}
