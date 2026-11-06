"use client";

// Kampanya Merkezi — istek yardımcıları. Kimlik başlıkları yalnız merkezi yardımcılardan (readYasamUser + sessionTokenHeader);
// Owner yetkisi her istekte sunucuda yeniden verilir (requireCampaignOwner). Owner olmayan her istek 404 alır.
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

export const CAMPAIGN_API = "/api/admin/kampanya-merkezi";

function headers(): Record<string, string> {
  return { "x-admin-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() };
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; detail?: string; status: number };

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string; code?: string; detail?: string }) | null;
  if (res.ok && body?.ok) return { ok: true, data: body as T };
  return { ok: false, error: body?.error ?? "İşlem tamamlanamadı.", code: body?.code, detail: body?.detail, status: res.status };
}

export async function campaignGet<T>(query = ""): Promise<ApiResult<T>> {
  try {
    return await parse<T>(await fetch(`${CAMPAIGN_API}${query}`, { headers: headers(), cache: "no-store", credentials: "same-origin" }));
  } catch {
    return { ok: false, error: "Ağ hatası — bağlantıyı kontrol edip tekrar deneyin.", status: 0 };
  }
}

export async function campaignPost<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    return await parse<T>(
      await fetch(CAMPAIGN_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      }),
    );
  } catch {
    return { ok: false, error: "Ağ hatası — işlem doğrulanamadı.", status: 0 };
  }
}
