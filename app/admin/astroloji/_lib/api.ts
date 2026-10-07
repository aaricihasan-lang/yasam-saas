// Astroloji owner UI — tarayıcı API istemcisi (yalnız istemci).
// Güvenli admin başlık deseni (x-admin-id + x-session-token; lib/admin/stats/statsClient ile aynı).
// Token URL'e/loga konmaz. Yetki her çağrıda SUNUCUDA (requireAstrologyOwner) verilir.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export function astroHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {
    "x-admin-id": readYasamUser()?.id ?? "",
    "x-session-token": readSessionToken() ?? "",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; error: string; data: Record<string, unknown> | null };

export async function astroFetch<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: astroHeaders(init.body !== undefined),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: "Ağ hatası — bağlantıyı kontrol edin.", data: null };
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (res.ok && body && body.ok === true) return { ok: true, status: res.status, data: body as T };
  return {
    ok: false,
    status: res.status,
    code: typeof body?.code === "string" ? body.code : `HTTP_${res.status}`,
    error: typeof body?.error === "string" ? body.error : "Beklenmeyen hata.",
    data: body,
  };
}

export const PREVIEW_STORAGE_KEY = "yasam.astro.previewNoInterp";

export function readPreviewFlag(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const PREVIEW_EVENT = "yasam-astro-preview-flag";

export function writePreviewFlag(v: boolean): void {
  try {
    if (v) window.localStorage.setItem(PREVIEW_STORAGE_KEY, "1");
    else window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
  } catch {
    /* depolama yoksa yoksay */
  }
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

/** useSyncExternalStore aboneliği (aynı sekme + diğer sekmeler). */
export function subscribePreviewFlag(cb: () => void): () => void {
  window.addEventListener(PREVIEW_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREVIEW_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
