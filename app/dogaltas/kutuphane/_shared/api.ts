// Doğaltaş Kütüphanesi · istemci API yardımcıları.
// Kimlik: mevcut oturum yardımcıları (readYasamUser + sessionTokenHeader). httpOnly çerez taşımasında token başlığı boş
// döner ve çerez `credentials: "same-origin"` ile gider. Yetkisiz / kapalı / bulunamadı → sunucu tek tip 404 döner.

import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

export type ApiOk<T> = { ok: true; status: number; data: T };
export type ApiErr = { ok: false; status: number; code: string | null; error: string | null };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type AuthKind = "viewer" | "owner";

/** Uzman okuma uçları: x-user-id + oturum. Owner yönetim uçları: x-admin-id + oturum. */
export function authHeaders(kind: AuthKind): Record<string, string> {
  const id = readYasamUser()?.id ?? "";
  const h: Record<string, string> = { ...sessionTokenHeader() };
  if (id) h[kind === "owner" ? "x-admin-id" : "x-user-id"] = id;
  return h;
}

type ReqInit = { method?: "GET" | "POST"; json?: unknown; form?: FormData; signal?: AbortSignal };

export async function apiRequest<T>(url: string, kind: AuthKind, init: ReqInit = {}): Promise<ApiResult<T>> {
  const headers = authHeaders(kind);
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    body = init.form;
  }
  try {
    const res = await fetch(url, {
      method: init.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      cache: "no-store",
      credentials: "same-origin",
      signal: init.signal,
    });
    const parsed = (await res.json().catch(() => null)) as (Record<string, unknown> & { ok?: boolean }) | null;
    if (res.ok && parsed && parsed.ok === true) return { ok: true, status: res.status, data: parsed as T };
    return {
      ok: false,
      status: res.status,
      code: typeof parsed?.code === "string" ? parsed.code : null,
      error: typeof parsed?.error === "string" ? parsed.error : null,
    };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: null };
  }
}

export const viewerGet = <T>(url: string, signal?: AbortSignal) => apiRequest<T>(url, "viewer", { signal });
