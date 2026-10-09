/**
 * dogaltasApi.ts — Doğaltaş güvenli server API'sine (Faz 1) istemci sarmalayıcıları.
 *
 * Tüm stones / minerals / stone_exclusions erişimi buradan /api/dogaltas/* üzerinden
 * gider; tarayıcı artık bu tablolara doğrudan (anon supabase) ERİŞMEZ.
 * tenant_id sunucuda oturumdan belirlenir; burada gönderilmez.
 * Auth: combinationsApi.ts deseni — x-user-id + x-session-token.
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { invalidateStonesList } from "@/lib/dogaltas/stonesListCache";

export const DOGALTAS_API_MISSING_AUTH =
  "Oturum bulunamadı. Lütfen tekrar giriş yapın.";

function authHeaders(json = false): Record<string, string> | null {
  const userId = readYasamUser()?.id;
  const token = readSessionToken();
  if (!userId || !token) return null;
  const h: Record<string, string> = { "x-user-id": userId, "x-session-token": token };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

type ApiResult<T> = { ok: boolean; data?: T; error?: string; demo?: boolean; code?: string; status?: number };

export async function dogaltasApiGet<T = Record<string, unknown>>(
  path: string,
): Promise<ApiResult<T>> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: DOGALTAS_API_MISSING_AUTH };
  try {
    const res = await fetch(path, { headers, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}

export async function dogaltasApiSend<T = Record<string, unknown>>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers = authHeaders(true);
  if (!headers) return { ok: false, error: DOGALTAS_API_MISSING_AUTH };
  try {
    const res = await fetch(path, {
      method, headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; demo?: boolean; code?: string } & T;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}`, demo: json.demo, code: json.code, status: res.status };
    }
    return { ok: true, data: json, demo: json.demo, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}

// ─── Taş mutasyonları ────────────────────────────────────────────────────────
export async function createStone(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>("/api/dogaltas/stones", "POST", payload);
  if (r.ok) invalidateStonesList(); // PERF-2: yeni taş → liste cache'i geçersiz
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

export async function updateStone(
  id: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
): Promise<{ ok: boolean; row?: Record<string, unknown>; error?: string; demo?: boolean; conflict?: boolean }> {
  const body = expectedUpdatedAt ? { ...fields, expectedUpdatedAt } : fields;
  const r = await dogaltasApiSend<{ row?: Record<string, unknown> }>(
    `/api/dogaltas/stones/${encodeURIComponent(id)}`, "PATCH", body);
  if (r.ok) invalidateStonesList(); // PERF-2: düzenleme → liste cache'i geçersiz
  return { ok: r.ok, row: r.data?.row, error: r.error, demo: r.demo, conflict: r.code === "conflict" };
}

export async function deleteStone(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(`/api/dogaltas/stones/${encodeURIComponent(id)}`, "DELETE");
  if (r.ok) invalidateStonesList(); // PERF-2: silme → liste cache'i geçersiz
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/**
 * Liste toplu silme — kendi taşları TEK istekte (batch, tenant guard'lı).
 * Sıralı tekil DELETE yerine `/api/dogaltas/stones/bulk-delete` → hızlı + atomik;
 * sayfadan çıkınca kısmi silme riski yok. Dönüş şekli değişmedi ({deletedIds, error}).
 */
/** Sunucu toplu silme üst sınırı (lib/api/bulkDeleteLimits MAX_BULK_DELETE_IDS) → istemci parçalar. */
export const BULK_CHUNK = 1000;

export function chunkIds<T>(ids: readonly T[], size = BULK_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export async function deleteStones(
  ids: string[],
): Promise<{ deletedIds: string[]; error: string | null }> {
  if (ids.length === 0) return { deletedIds: [], error: null };
  // "Tümünü Seç" 1000'den fazla kayıt seçebilir → sunucu sınırına uygun parçalar (sıralı).
  const deletedIds: string[] = [];
  for (const chunk of chunkIds(ids)) {
    const r = await dogaltasApiSend<{ deletedIds?: string[] }>(
      "/api/dogaltas/stones/bulk-delete", "POST", { ids: chunk });
    if (!r.ok) {
      if (deletedIds.length > 0) invalidateStonesList();
      return { deletedIds, error: r.error ?? "Silinemedi" };
    }
    // Demo hesapta server deletedIds:[] döner; gerçek silme yapılmaz.
    deletedIds.push(...(r.data?.deletedIds ?? []));
  }
  invalidateStonesList(); // PERF-2: toplu silme → liste cache'i geçersiz
  return { deletedIds, error: null };
}

export async function getStone(
  id: string,
): Promise<{ ok: boolean; row?: Record<string, unknown>; error?: string }> {
  const r = await dogaltasApiGet<{ row?: Record<string, unknown> }>(
    `/api/dogaltas/stones/${encodeURIComponent(id)}`);
  return { ok: r.ok, row: r.data?.row, error: r.error };
}

// ─── Mineral mutasyonları ────────────────────────────────────────────────────
export async function createMineral(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>("/api/dogaltas/minerals", "POST", payload);
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

export async function bulkDeleteMinerals(
  ids: string[],
): Promise<{ ok: boolean; deleted?: number; error?: string; demo?: boolean }> {
  // "Tümünü Seç" 1000'den fazla kayıt seçebilir → sunucu sınırına uygun parçalar (sıralı).
  let deleted = 0;
  let demo: boolean | undefined;
  for (const chunk of chunkIds(ids)) {
    const r = await dogaltasApiSend<{ deleted?: number }>(
      "/api/dogaltas/minerals/bulk-delete", "POST", { ids: chunk });
    if (!r.ok) return { ok: false, deleted, error: r.error, demo: r.demo };
    deleted += r.data?.deleted ?? 0;
    demo = demo || r.demo;
  }
  return { ok: true, deleted, demo };
}

export async function getMineral(
  id: string,
): Promise<{ ok: boolean; row?: Record<string, unknown>; error?: string }> {
  const r = await dogaltasApiGet<{ row?: Record<string, unknown> }>(
    `/api/dogaltas/minerals/${encodeURIComponent(id)}`);
  return { ok: r.ok, row: r.data?.row, error: r.error };
}

export async function updateMineral(
  id: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
): Promise<{ ok: boolean; updated_at?: string; error?: string; demo?: boolean; conflict?: boolean }> {
  const body = expectedUpdatedAt ? { ...fields, expectedUpdatedAt } : fields;
  const r = await dogaltasApiSend<{ updated_at?: string }>(
    `/api/dogaltas/minerals/${encodeURIComponent(id)}`, "PATCH", body);
  return { ok: r.ok, updated_at: r.data?.updated_at, error: r.error, demo: r.demo, conflict: r.code === "conflict" };
}

// ─── Modül-bazlı çift kayıt kontrolü (DT-P1-1) ───────────────────────────────
export async function checkDuplicate(
  type: "stone" | "mineral" | "knowledge" | "combination",
  name: string,
): Promise<{ ok: boolean; exists: boolean; match?: { id: string; label: string }; error?: string }> {
  const r = await dogaltasApiGet<{ exists?: boolean; match?: { id: string; label: string } }>(
    `/api/dogaltas/duplicate-check?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`,
  );
  return { ok: r.ok, exists: Boolean(r.data?.exists), match: r.data?.match, error: r.error };
}

// ─── Kombinasyon mutasyonları ────────────────────────────────────────────────
export async function updateCombination(
  id: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
): Promise<{ ok: boolean; issue?: string; updated_at?: string; error?: string; demo?: boolean; conflict?: boolean }> {
  const body = expectedUpdatedAt ? { ...fields, expectedUpdatedAt } : fields;
  const r = await dogaltasApiSend<{ issue?: string; updated_at?: string }>(
    `/api/dogaltas/combinations/${encodeURIComponent(id)}`, "PATCH", body);
  return { ok: r.ok, issue: r.data?.issue, updated_at: r.data?.updated_at, error: r.error, demo: r.demo, conflict: r.code === "conflict" };
}
