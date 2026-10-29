// Klasik Numeroloji · istemci API yardımcıları (Numeroloji Merkezi ekranları).
// Kimlik: mevcut oturum yardımcıları (readYasamUser + sessionTokenHeader) — Doğaltaş Kütüphanesi
// (app/dogaltas/kutuphane/_shared/api.ts) ile aynı düzen. Web'de HttpOnly çerez taşımasında token başlığı
// boş döner ve çerez `credentials: "same-origin"` ile gider; token varlığına göre kapı YOK.

import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

export type ApiOk<T> = { ok: true; status: number; data: T };
export type ApiErr = { ok: false; status: number; code: string | null; error: string | null; retryAfterSec: number | null };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export const API_BASE = "/api/numeroloji-klasik";

export function authHeaders(): Record<string, string> {
  const id = readYasamUser()?.id ?? "";
  const h: Record<string, string> = { ...sessionTokenHeader() };
  if (id) h["x-user-id"] = id;
  return h;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type ReqInit = { method?: Method; json?: unknown; signal?: AbortSignal };

function retryAfter(res: Response): number | null {
  const v = res.headers.get("retry-after");
  return v && /^\d{1,6}$/.test(v) ? Number(v) : null;
}

export async function apiRequest<T>(url: string, init: ReqInit = {}): Promise<ApiResult<T>> {
  const headers = authHeaders();
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
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
      retryAfterSec: retryAfter(res),
    };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return { ok: false, status: -1, code: "ABORTED", error: null, retryAfterSec: null };
    return { ok: false, status: 0, code: "NETWORK", error: null, retryAfterSec: null };
  }
}

export type BlobResult = { ok: true; blob: Blob; filename: string } | ApiErr;

/** Word indirme: POST → blob (hata halinde JSON gövdesindeki Türkçe mesaj). */
export async function apiBlob(url: string, json: unknown, fallbackName: string): Promise<BlobResult> {
  const headers = { ...authHeaders(), "Content-Type": "application/json" };
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(json), cache: "no-store", credentials: "same-origin" });
    if (!res.ok) {
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return {
        ok: false,
        status: res.status,
        code: typeof parsed?.code === "string" ? parsed.code : null,
        error: typeof parsed?.error === "string" ? parsed.error : null,
        retryAfterSec: retryAfter(res),
      };
    }
    const blob = await res.blob();
    return { ok: true, blob, filename: filenameFrom(res.headers.get("content-disposition")) ?? fallbackName };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: null, retryAfterSec: null };
  }
}

function filenameFrom(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* düz ada düş */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : null;
}

/** Tarayıcıda dosya indirmeyi tetikler (nesne URL'si hemen bırakılır). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]+/g, "_");
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** API hatasını uzmana gösterilecek Türkçe metne çevirir (sunucu mesajı önceliklidir). */
export function errorMessage(e: ApiErr): string {
  if (e.status === 0 || e.code === "NETWORK") return "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
  if (e.status === 429 || e.code === "RATE_LIMITED") return "Çok sık istek; biraz sonra tekrar deneyin.";
  if (e.status === 403 && (e.code === "MODULE_FORBIDDEN" || e.code === "MODULE" || e.code === "MODULE_ACCESS")) {
    return e.error ?? "Bu modüle erişim izniniz yok. Yöneticinizle iletişime geçin.";
  }
  if (e.status === 403 && (e.code === "MEMBERSHIP" || e.code === "MEMBERSHIP_INACTIVE" || e.code === "MEMBERSHIP_EXPIRED")) {
    return e.error ?? "Üyeliğiniz bu işlem için etkin değil.";
  }
  if (e.code === "CLIENTS_PERMISSION" || e.code === "CLIENTS_PERMISSION_REQUIRED") return e.error ?? "Bu işlem için Danışan Yönetimi izniniz olmalı.";
  if (e.error) return e.error;
  if (e.status === 401) return "Oturumunuz sona ermiş olabilir. Lütfen yeniden giriş yapın.";
  if (e.status === 403) return "Bu işlem için yetkiniz yok.";
  if (e.status === 404) return "Kayıt bulunamadı ya da artık mevcut değil.";
  if (e.status === 409) return "Kayıt başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin.";
  if (e.status === 413) return "İstek çok büyük.";
  if (e.status >= 500) return "İşlem şu an tamamlanamadı. Lütfen daha sonra tekrar deneyin.";
  return "İşlem tamamlanamadı.";
}
