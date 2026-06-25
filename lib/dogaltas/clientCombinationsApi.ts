import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Danışana özel kombinasyon (public.client_combinations) için güvenli istemci
 * yardımcıları. Tüm istekler service_role'lü sunucu API'lerine gider; tarayıcı
 * doğrudan tabloya erişmez (RLS deny).
 *
 * Genel kombinasyonlardan (combinationsApi.ts) TAMAMEN ayrıdır.
 */

export type ClientCombinationRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  name: string;
  description: string | null;
  note: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  created_at: string;
  updated_at: string | null;
};

export type SaveClientCombinationInput = {
  name: string;
  description?: string | null;
  note?: string | null;
  stones: string[];
  notesText?: string | null;
  notesText2?: string | null;
};

type ApiResult<T = unknown> = {
  ok: boolean;
  error?: string;
  demo?: boolean;
} & T;

function authHeaders(): Record<string, string> | null {
  const userId = readYasamUser()?.id;
  const sessionToken = readSessionToken();
  if (!userId || !sessionToken) return null;
  return { "x-user-id": userId, "x-session-token": sessionToken };
}

/** Taş adlarını CSV'den ayıkla (kart üzerinde taş sayısı / listesi için). */
export function parseStonesText(stonesText: string | null | undefined): string[] {
  if (!stonesText) return [];
  return stonesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function fetchClientCombinations(
  clientId: string,
): Promise<ApiResult<{ rows: ClientCombinationRow[] }>> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "Oturum bulunamadı.", rows: [] };

  try {
    const res = await fetch(`/api/clients/${clientId}/combinations`, {
      headers,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as ApiResult<{
      rows?: ClientCombinationRow[];
    }>;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}`, rows: [] };
    }
    return { ok: true, rows: json.rows ?? [] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ağ hatası",
      rows: [],
    };
  }
}

export async function saveClientCombination(
  clientId: string,
  input: SaveClientCombinationInput,
): Promise<ApiResult> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "Oturum bulunamadı." };

  try {
    const res = await fetch(`/api/clients/${clientId}/combinations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as ApiResult;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}`, demo: json.demo };
    }
    return { ok: true, demo: json.demo };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}

export async function updateClientCombination(
  clientId: string,
  combinationId: string,
  fields: { name?: string; description?: string | null; note?: string | null },
): Promise<ApiResult> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "Oturum bulunamadı." };

  try {
    const res = await fetch(
      `/api/clients/${clientId}/combinations/${combinationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(fields),
      },
    );
    const json = (await res.json().catch(() => ({}))) as ApiResult;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}`, demo: json.demo };
    }
    return { ok: true, demo: json.demo };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}

export async function deleteClientCombination(
  clientId: string,
  combinationId: string,
): Promise<ApiResult> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "Oturum bulunamadı." };

  try {
    const res = await fetch(
      `/api/clients/${clientId}/combinations/${combinationId}`,
      { method: "DELETE", headers },
    );
    const json = (await res.json().catch(() => ({}))) as ApiResult;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}`, demo: json.demo };
    }
    return { ok: true, demo: json.demo };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}
