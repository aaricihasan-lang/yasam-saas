/**
 * lib/location/userLocationPref.ts — Kullanıcı varsayılan konumu istemci helper'ı (FAZ 5 / P4b).
 *
 * `/api/settings/location` route'unu `x-user-id` + `x-session-token` başlık düzeniyle
 * çağırır. Sunucu tarafı guard (verifyUserRequest) kimliği doğrular; bu helper yalnız
 * istemci tarafı kolaylık katmanıdır. Motorlara/UI'a bağımlı değildir.
 */
import { readYasamUser, readSessionToken, hasSessionCredential, sessionTokenHeader } from "@/lib/auth/yasamUser";
import type { Location } from "@/lib/location";

/** Sunucudan dönen varsayılan konum kaydı (snake_case — DB kolonlarıyla hizalı). */
export interface UserLocationPref {
  location_id: string;
  name: string;
  country_code: string;
  lat: number;
  lon: number;
  elev: number;
  tz: string;
  source: string | null;
  updated_at?: string;
}

/** x-user-id + x-session-token başlıkları; oturum yoksa null. */
function authHeaders(): Record<string, string> | null {
  const user = readYasamUser();
  const token = readSessionToken();
  if (!user?.id || !hasSessionCredential(token)) return null;
  return { "x-user-id": user.id, ...sessionTokenHeader(token) };
}

/** Kullanıcının varsayılan konumunu getir; yoksa / oturum yoksa null. */
export async function getUserLocationPref(): Promise<UserLocationPref | null> {
  const headers = authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch("/api/settings/location", { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as { location: UserLocationPref | null };
    return json.location ?? null;
  } catch {
    return null;
  }
}

/**
 * İstemci tarafı hata kodu (I18N-F1-R3): dil-bağımsız EK alan; `error` metni aynen korunur (Kozmik Ajanda bugünkü
 * gibi `error`'u gösterir). Ayarlar › Konum kaynak dil dışında `settings.location.errors.codes.<KOD>` gösterir.
 */
export type UserLocationPrefErrorCode = "NO_SESSION" | "NETWORK";

/** Varsayılan konumu kaydet (upsert). Location katmanının kaydını API gövdesine eşler. */
export async function saveUserLocationPref(
  loc: Location,
): Promise<{ ok: boolean; error?: string; code?: UserLocationPrefErrorCode }> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "Oturum bulunamadı.", code: "NO_SESSION" };
  try {
    const res = await fetch("/api/settings/location", {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: loc.id,
        name: loc.name,
        country_code: loc.countryCode,
        lat: loc.lat,
        lon: loc.lon,
        elev: loc.elev,
        tz: loc.tz,
        source: loc.source,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: res.ok && json.ok === true, error: json.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası.", code: "NETWORK" };
  }
}
