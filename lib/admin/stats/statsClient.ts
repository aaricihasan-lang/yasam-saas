/**
 * FAZ 2 — Tipli admin istatistik istemcisi (yalnız tarayıcı/istemci).
 * Güvenli admin header deseni (x-admin-id + x-session-token) readYasamUser/readSessionToken'dan.
 * Token URL'e/loga/mesaja KONULMAZ. Tarayıcıda anon Supabase ile istatistik ÜRETİLMEZ.
 * AbortSignal ile eski isteklerin yeni seçimi ezmesi engellenir (yarış yönetimi çağıranda).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type {
  ActivityData, ModulesData, StorageData, OverviewData,
  ExpertsData, StorageOverviewData, StorageGrowthData,
} from "@/lib/admin/stats/apiTypes";

export type StatsFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; kind: "auth" | "badrequest" | "server" | "network" };

function adminHeaders(): Record<string, string> {
  const id = readYasamUser()?.id ?? "";
  const token = readSessionToken() ?? "";
  return { "x-admin-id": id, "x-session-token": token };
}

async function getStats<T>(path: string, signal?: AbortSignal): Promise<StatsFetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { headers: adminHeaders(), cache: "no-store", signal });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e; // çağıran yut/yoksay
    return { ok: false, status: 0, error: "Ağ hatası — bağlantıyı kontrol edip tekrar deneyin.", kind: "network" };
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* bos/hatali govde */ }
  if (res.ok && body && (body as { ok?: boolean }).ok) {
    return { ok: true, data: (body as { data: T }).data };
  }
  const errMsg = (body as { error?: string })?.error ?? "Beklenmeyen hata.";
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: errMsg, kind: "auth" };
  if (res.status === 400) return { ok: false, status: 400, error: errMsg, kind: "badrequest" };
  return { ok: false, status: res.status || 500, error: errMsg, kind: "server" };
}

const qs = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

const BASE = "/api/admin/expert-stats";

export const statsApi = {
  overview: (p: { from?: string | null; to?: string | null; activeSinceDays?: number }, signal?: AbortSignal) =>
    getStats<OverviewData>(`${BASE}/overview${qs(p)}`, signal),
  experts: (p: { search?: string | null; status?: string; sort?: string; page?: number; pageSize?: number; includeDemo?: boolean }, signal?: AbortSignal) =>
    getStats<ExpertsData>(`${BASE}/experts${qs(p)}`, signal),
  activity: (p: { userId: string; from?: string | null; to?: string | null }, signal?: AbortSignal) =>
    getStats<ActivityData>(`${BASE}/activity${qs(p)}`, signal),
  modules: (p: { userId: string; from?: string | null; to?: string | null }, signal?: AbortSignal) =>
    getStats<ModulesData>(`${BASE}/modules${qs(p)}`, signal),
  storage: (p: { userId: string }, signal?: AbortSignal) =>
    getStats<StorageData>(`${BASE}/storage${qs(p)}`, signal),
  storageOverview: (signal?: AbortSignal) =>
    getStats<StorageOverviewData>(`${BASE}/storage-overview`, signal),
  storageGrowth: (p: { from?: string | null; to?: string | null }, signal?: AbortSignal) =>
    getStats<StorageGrowthData>(`${BASE}/storage-growth${qs(p)}`, signal),
};
