/**
 * dogaltasApi.ts — Doğaltaş güvenli server API'sine (Faz 1) istemci sarmalayıcıları.
 *
 * Tüm stones / minerals / stone_exclusions erişimi buradan /api/dogaltas/* üzerinden
 * gider; tarayıcı artık bu tablolara doğrudan (anon supabase) ERİŞMEZ.
 * tenant_id sunucuda oturumdan belirlenir; burada gönderilmez.
 * Auth: combinationsApi.ts deseni — x-user-id + x-session-token.
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

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

type ApiResult<T> = { ok: boolean; data?: T; error?: string; demo?: boolean };

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
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; demo?: boolean } & T;
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}`, demo: json.demo };
    return { ok: true, data: json, demo: json.demo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}

// ─── Taş mutasyonları ────────────────────────────────────────────────────────
export async function createStone(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>("/api/dogaltas/stones", "POST", payload);
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

export async function updateStone(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; row?: Record<string, unknown>; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ row?: Record<string, unknown> }>(
    `/api/dogaltas/stones/${encodeURIComponent(id)}`, "PATCH", fields);
  return { ok: r.ok, row: r.data?.row, error: r.error, demo: r.demo };
}

export async function deleteStone(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(`/api/dogaltas/stones/${encodeURIComponent(id)}`, "DELETE");
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/**
 * Liste toplu silme — kendi taşları TEK istekte (batch, tenant guard'lı).
 * Sıralı tekil DELETE yerine `/api/dogaltas/stones/bulk-delete` → hızlı + atomik;
 * sayfadan çıkınca kısmi silme riski yok. Dönüş şekli değişmedi ({deletedIds, error}).
 */
export async function deleteStones(
  ids: string[],
): Promise<{ deletedIds: string[]; error: string | null }> {
  if (ids.length === 0) return { deletedIds: [], error: null };
  const r = await dogaltasApiSend<{ deletedIds?: string[] }>(
    "/api/dogaltas/stones/bulk-delete", "POST", { ids });
  if (!r.ok) return { deletedIds: [], error: r.error ?? "Silinemedi" };
  // Demo hesapta server deletedIds:[] döner; gerçek silme yapılmaz.
  return { deletedIds: r.data?.deletedIds ?? [], error: null };
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
  const r = await dogaltasApiSend<{ deleted?: number }>(
    "/api/dogaltas/minerals/bulk-delete", "POST", { ids });
  return { ok: r.ok, deleted: r.data?.deleted, error: r.error, demo: r.demo };
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
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(
    `/api/dogaltas/minerals/${encodeURIComponent(id)}`, "PATCH", fields);
  return { ok: r.ok, error: r.error, demo: r.demo };
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
): Promise<{ ok: boolean; issue?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ issue?: string }>(
    `/api/dogaltas/combinations/${encodeURIComponent(id)}`, "PATCH", fields);
  return { ok: r.ok, issue: r.data?.issue, error: r.error, demo: r.demo };
}
