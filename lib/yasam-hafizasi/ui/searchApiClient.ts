/**
 * BF-13 — Yaşam Hafızası arama istemci yardımcısı (client-safe).
 * Auth başlıkları mevcut kalıpla (x-user-id + x-session-token) gönderilir.
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { YhSourceModule } from "@/lib/yasam-hafizasi/config";
import type { YhSearchResponse } from "./searchResult";

export interface YhSearchParams {
  q: string;
  modules?: YhSourceModule[];
  allowShared?: boolean;
  limit?: number;
}

export async function fetchYhSearch(
  params: YhSearchParams,
  signal?: AbortSignal,
): Promise<YhSearchResponse> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch("/api/yasam-hafizasi/search", {
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
      return data as YhSearchResponse;
    }
    return { ok: false, query: params.q, total: 0, facets: [], results: [], code: `HTTP_${res.status}` };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, query: params.q, total: 0, facets: [], results: [], code: "ABORTED" };
    }
    return { ok: false, query: params.q, total: 0, facets: [], results: [], code: "NETWORK" };
  }
}
