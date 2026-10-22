"use client";

// Owner yönetim ekranı — istek yardımcıları. Kimlik başlıkları yalnız merkezi yardımcılardan (readYasamUser +
// sessionTokenHeader); yetki her istekte sunucuda yeniden verilir (requireEducationOwner).
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

export function ownerHeaders(): Record<string, string> {
  return { "x-admin-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() };
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; status: number };

export async function ownerGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { headers: ownerHeaders(), cache: "no-store", credentials: "same-origin" });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string; code?: string } | null;
    if (res.ok && body?.ok) return { ok: true, data: body.data as T };
    return { ok: false, error: body?.error ?? "Veri alınamadı.", code: body?.code, status: res.status };
  } catch {
    return { ok: false, error: "Ağ hatası — bağlantıyı kontrol edip tekrar deneyin.", status: 0 };
  }
}

export async function ownerPost<T = Record<string, unknown>>(url: string, payload?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ownerHeaders() },
      credentials: "same-origin",
      cache: "no-store",
      body: payload === undefined ? "{}" : JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string; code?: string }) | null;
    if (res.ok && body?.ok) return { ok: true, data: body as T };
    return { ok: false, error: body?.error ?? "İşlem tamamlanamadı.", code: body?.code, status: res.status };
  } catch {
    return { ok: false, error: "Ağ hatası — işlem doğrulanamadı.", status: 0 };
  }
}
