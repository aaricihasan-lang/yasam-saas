/**
 * Kalıcı dil tercihi — tarayıcı istemcisi (/api/me/locale). Sunucu kodu içe aktarılmaz.
 * Kimlik: x-user-id + koşullu oturum başlığı (lib/auth/yasamUser — salt kullanım, değişiklik yok).
 * Hiçbir hata kullanıcı akışını bozmaz: okunamayan tercih "unavailable" sayılır.
 */
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { parseAccountPreference, type AccountPreference } from "./localePreference";
import type { ActiveLocale } from "./locales";

const URL_ = "/api/me/locale";

function headers(json = false): Record<string, string> | null {
  const userId = readYasamUser()?.id;
  if (!userId) return null;
  return { "x-user-id": userId, ...sessionTokenHeader(), ...(json ? { "content-type": "application/json" } : {}) };
}

/** Giriş yapılmış mı (istemci görüşü)? Senkron yalnız oturum varken çalışır. */
export function hasClientSession(): boolean {
  return headers() !== null;
}

export async function fetchAccountLocale(signal?: AbortSignal): Promise<AccountPreference> {
  const h = headers();
  if (!h) return { status: "unavailable", reason: "no_session" };
  try {
    const res = await fetch(URL_, { method: "GET", headers: h, cache: "no-store", signal });
    if (!res.ok) return { status: "unavailable", reason: `http_${res.status}` };
    const body = (await res.json()) as { preference?: unknown };
    return parseAccountPreference(body.preference);
  } catch {
    return { status: "unavailable", reason: "network" };
  }
}

export async function saveAccountLocale(locale: ActiveLocale): Promise<{ persisted: boolean }> {
  const h = headers(true);
  if (!h) return { persisted: false };
  try {
    const res = await fetch(URL_, { method: "PUT", headers: h, cache: "no-store", body: JSON.stringify({ locale }) });
    if (!res.ok) return { persisted: false };
    const body = (await res.json()) as { persisted?: unknown };
    return { persisted: body.persisted === true };
  } catch {
    return { persisted: false };
  }
}
