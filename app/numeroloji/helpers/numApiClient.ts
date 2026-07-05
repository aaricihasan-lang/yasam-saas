/**
 * Numeroloji güvenli API — istemci yardımcıları.
 * Doğrudan Supabase (anon) tablo erişimi YERİNE session-guard'lı server API'ye gider.
 * Tenant SUNUCUDA session'dan alınır; istemciden gönderilmez (çapraz-tenant engellenir).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type NumApiResult = { ok: boolean; status: number; json: Record<string, unknown> };

export async function numApi(path: string, opts: RequestInit = {}): Promise<NumApiResult> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...opts,
      headers: { ...authHeaders(), ...((opts.headers as Record<string, string>) ?? {}) },
    });
  } catch {
    return { ok: false, status: 0, json: { error: "Bağlantı hatası. Lütfen tekrar deneyin." } };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && json.ok !== false, status: res.status, json };
}

/** API yanıtından hata metni türetir (yoksa null). */
export function numApiError(r: NumApiResult): string | null {
  if (r.ok) return null;
  const e = r.json.error;
  return typeof e === "string" && e.trim() ? e : `İşlem başarısız (HTTP ${r.status}).`;
}
