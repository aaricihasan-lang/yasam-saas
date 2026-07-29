import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { ReadListEnvelope } from "@/lib/aromaterapi/readTypes";

/**
 * Aromaterapi V2 — C3C istemci okuma yardımcıları (client-safe; server-only YOK).
 *
 * Route URL'lerini ve response parsing'i tek yerde toplar; katalog/kaynak/claim/
 * glossary sarmalayıcıları buradan beslenir. Auth başlıkları mevcut Aromaterapi
 * kalıbıyla (x-user-id + x-session-token) gönderilir. Stabil hata kodları Türkçe
 * kullanıcı mesajına burada çevrilir (ham DB hatası zaten sunucuda tutulur).
 */

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  AROMA_INVALID_UUID: "Geçersiz kayıt bağlantısı.",
  AROMA_INVALID_PAGE: "Geçersiz sayfa değeri.",
  AROMA_INVALID_LIMIT: "Geçersiz sayfa boyutu.",
  AROMA_INVALID_SORT: "Geçersiz sıralama.",
  AROMA_INVALID_FILTER: "Geçersiz filtre değeri.",
  AROMA_QUERY_TOO_LONG: "Arama metni çok uzun.",
  AROMA_NOT_FOUND: "Kayıt bulunamadı.",
  AROMA_READ_FAILED: "İçerik yüklenemedi. Lütfen tekrar deneyin.",
};

export function messageForCode(code: string | null): string {
  if (!code) return "İçerik yüklenemedi. Lütfen tekrar deneyin.";
  return ERROR_MESSAGES[code] ?? "İçerik yüklenemedi. Lütfen tekrar deneyin.";
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export type ListResult<T> = {
  ok: boolean;
  envelope: ReadListEnvelope<T> | null;
  errorCode: string | null;
};

export type DetailResult<T> = {
  ok: boolean;
  data: T | null;
  notFound: boolean;
  errorCode: string | null;
};

/** Ortak liste GET — `{ ok, rows, page, limit, total }` sözleşmesini çözer. */
export async function getList<T>(url: string, signal?: AbortSignal): Promise<ListResult<T>> {
  try {
    const res = await fetch(url, { headers: authHeaders(), signal });
    const j = await readJson(res);
    if (!res.ok || j.ok !== true) {
      return { ok: false, envelope: null, errorCode: String(j.code ?? `HTTP_${res.status}`) };
    }
    return {
      ok: true,
      envelope: {
        rows: (j.rows as T[]) ?? [],
        page: Number(j.page ?? 1),
        limit: Number(j.limit ?? 25),
        total: Number(j.total ?? 0),
      },
      errorCode: null,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, envelope: null, errorCode: null };
    }
    return { ok: false, envelope: null, errorCode: "AROMA_READ_FAILED" };
  }
}

/** Ortak detay GET — response'taki tek `key` alanını çözer; 404 ayrıştırılır. */
export async function getDetail<T>(
  url: string,
  key: string,
  signal?: AbortSignal,
): Promise<DetailResult<T>> {
  try {
    const res = await fetch(url, { headers: authHeaders(), signal });
    const j = await readJson(res);
    if (res.status === 404) {
      return { ok: false, data: null, notFound: true, errorCode: "AROMA_NOT_FOUND" };
    }
    if (!res.ok || j.ok !== true) {
      return {
        ok: false,
        data: null,
        notFound: false,
        errorCode: String(j.code ?? `HTTP_${res.status}`),
      };
    }
    return { ok: true, data: (j[key] as T) ?? null, notFound: false, errorCode: null };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, data: null, notFound: false, errorCode: null };
    }
    return { ok: false, data: null, notFound: false, errorCode: "AROMA_READ_FAILED" };
  }
}

/** Çok-anahtarlı detay GET — ham JSON gövdesini döndürür (404 ayrıştırılır). */
export async function getRawDetail(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; json: Record<string, unknown>; notFound: boolean; errorCode: string | null }> {
  try {
    const res = await fetch(url, { headers: authHeaders(), signal });
    const j = await readJson(res);
    if (res.status === 404) {
      return { ok: false, json: {}, notFound: true, errorCode: "AROMA_NOT_FOUND" };
    }
    if (!res.ok || j.ok !== true) {
      return { ok: false, json: {}, notFound: false, errorCode: String(j.code ?? `HTTP_${res.status}`) };
    }
    return { ok: true, json: j, notFound: false, errorCode: null };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, json: {}, notFound: false, errorCode: null };
    }
    return { ok: false, json: {}, notFound: false, errorCode: "AROMA_READ_FAILED" };
  }
}

/** URLSearchParams kurar; boş/undefined değerleri atlar. */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    sp.set(k, s);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
