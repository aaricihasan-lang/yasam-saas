/**
 * Biyoenerji güvenli API — istemci yardımcıları.
 * İstemciden doğrudan Supabase tablo erişimi yerine /api/biyoenerji/[resource]
 * üzerinden gider (verifyUserRequest + tenant binding).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export type BioRow = Record<string, unknown>;

const BASE = "/api/biyoenerji";

export function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

/** BIO-06 — istek zaman aşımı (ms). Asılı kalan istek UI'ı kilitlemesin. */
export const BIO_FETCH_TIMEOUT_MS = 30_000;
export const BIO_NETWORK_ERROR =
  "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
export const BIO_TIMEOUT_ERROR =
  "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.";

/**
 * BIO-06 — fetch sarmalayıcısı: ağ kesintisi ("Failed to fetch") veya zaman aşımı
 * ASLA reddedilmiş promise olarak yukarı sızmaz; kontrollü bir hata yanıtı (503,
 * `{ ok:false, error }`) döner. Böylece çağıran her yol loading/busy durumunu
 * sıfırlar ve kullanıcıya açık hata gösterir (sahte başarı yok).
 */
export async function bioFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timedOut = false;
  const timer = ctrl
    ? setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, BIO_FETCH_TIMEOUT_MS)
    : null;
  try {
    return await fetch(input, ctrl ? { ...init, signal: ctrl.signal } : init);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: timedOut ? BIO_TIMEOUT_ERROR : BIO_NETWORK_ERROR }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function bioApiList(
  resource: string,
  opts: { offset?: number; limit?: number; search?: string; category?: string } = {},
): Promise<{ rows: BioRow[]; error: string | null }> {
  const p = new URLSearchParams();
  if (opts.offset) p.set("offset", String(opts.offset));
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.search?.trim()) p.set("search", opts.search.trim());
  if (opts.category?.trim()) p.set("category", opts.category.trim());
  const qs = p.toString();
  const res = await bioFetch(`${BASE}/${resource}${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { rows: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { rows: (j.rows as BioRow[]) ?? [], error: null };
}

export async function bioApiCount(
  resource: string,
  search?: string,
  category?: string,
): Promise<{ count: number; error: string | null }> {
  const p = new URLSearchParams({ count: "1" });
  if (search?.trim()) p.set("search", search.trim());
  if (category?.trim()) p.set("category", category.trim());
  const res = await bioFetch(`${BASE}/${resource}?${p.toString()}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { count: 0, error: String(j.error ?? `HTTP ${res.status}`) };
  return { count: Number(j.count ?? 0), error: null };
}

/** Bu kaynak için tenant'a ait benzersiz kategori değerleri (kategori filtresi açılır listesi). */
export async function bioApiCategories(
  resource: string,
): Promise<{ categories: string[]; error: string | null }> {
  const res = await bioFetch(`${BASE}/${resource}?distinct=category`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { categories: [], error: String(j.error ?? `HTTP ${res.status}`) };
  return { categories: (j.categories as string[]) ?? [], error: null };
}

export async function bioApiLastCreated(
  resource: string,
): Promise<{ lastCreatedAt: string | null; error: string | null }> {
  const res = await bioFetch(`${BASE}/${resource}?lastCreated=1`, { headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { lastCreatedAt: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { lastCreatedAt: (j.lastCreatedAt as string | null) ?? null, error: null };
}

export async function bioApiGetOne(
  resource: string,
  id: string,
): Promise<{ row: BioRow | null; error: string | null }> {
  const res = await bioFetch(`${BASE}/${resource}/${id}`, { headers: authHeaders() });
  const j = await readJson(res);
  if (res.status === 404) return { row: null, error: null };
  if (!res.ok || j.ok !== true) return { row: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { row: (j.row as BioRow) ?? null, error: null };
}

export async function bioApiCreate(
  resource: string,
  fields: BioRow,
): Promise<{ row: BioRow | null; error: string | null }> {
  const res = await bioFetch(`${BASE}/${resource}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { row: null, error: String(j.error ?? `HTTP ${res.status}`) };
  return { row: (j.row as BioRow) ?? null, error: null };
}

export async function bioApiUpdate(
  resource: string,
  id: string,
  fields: BioRow,
): Promise<{ error: string | null }> {
  const res = await bioFetch(`${BASE}/${resource}/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

export async function bioApiDelete(
  resource: string,
  id: string,
): Promise<{ error: string | null }> {
  const res = await bioFetch(`${BASE}/${resource}/${id}`, { method: "DELETE", headers: authHeaders() });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { error: String(j.error ?? `HTTP ${res.status}`) };
  return { error: null };
}

/**
 * Seçili kayıtları toplu sil. Sunucuda tenant binding zorlanır; yalnız bu
 * tenant'a ait ve id listesindeki kayıtlar silinir (çapraz-tenant engellenir).
 */
export async function bioApiDeleteMany(
  resource: string,
  ids: string[],
): Promise<{ deleted: number; error: string | null }> {
  const clean = ids.filter((x) => typeof x === "string" && x.trim().length > 0);
  if (clean.length === 0) return { deleted: 0, error: null };
  const res = await bioFetch(`${BASE}/${resource}`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ ids: clean }),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { deleted: 0, error: String(j.error ?? `HTTP ${res.status}`) };
  return { deleted: Number(j.deleted ?? 0), error: null };
}

/**
 * Bu modüldeki TÜM tenant kayıtlarını sil ("Tümünü Sil"). Sunucuda tenant
 * binding zorlanır; yalnız mevcut uzmanın kayıtları silinir.
 */
export async function bioApiDeleteAll(
  resource: string,
  expectedCount?: number,
): Promise<{ deleted: number; error: string | null }> {
  // BIO-13 — kullanıcının onayladığı toplam kayıt sayısı sunucuya iletilir; sunucu
  // gerçek tenant toplamı farklıysa (ör. başka sekmede kayıt eklendi) silmeyi REDDEDER.
  const res = await bioFetch(`${BASE}/${resource}`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify(
      typeof expectedCount === "number" ? { all: true, expectedCount } : { all: true },
    ),
  });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) return { deleted: 0, error: String(j.error ?? `HTTP ${res.status}`) };
  return { deleted: Number(j.deleted ?? 0), error: null };
}
