// RoxyAPI Location — GET /location/search?q= (YALNIZ SUNUCU).
//
// Şema gerçek bir yanıttan doğrulandı (2026-10-05, q="Selçuklu"):
//   { total, limit, offset, cities: [{ city, province, country, iso2, latitude, longitude,
//     timezone, utcOffset, population }] }
// Anahtar yalnız X-API-Key başlığında; hata gövdesi dışarı aktarılmaz. Her arama Roxy kredisi
// harcar → çağıran uç (route) cache + rate limit + açık kullanıcı eylemi ile korur.

import { ROXY_POLICY, type RoxyServerConfig } from "./config";
import type { FetchLike, RoxyCallErrorKind } from "./client";

export type RoxyCity = {
  city: string;
  province: string;
  country: string;
  iso2: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type RoxyLocationResult =
  | { ok: true; cities: RoxyCity[] }
  | { ok: false; kind: RoxyCallErrorKind | "schema"; status: number | null };

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Yanıtı doğrular; geçersiz öğeler ATILIR (tahmin yok), gövde biçimi bozuksa schema hatası. */
export function parseRoxyLocationResponse(raw: unknown): RoxyCity[] | null {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { cities?: unknown }).cities)) return null;
  const out: RoxyCity[] = [];
  for (const c of (raw as { cities: unknown[] }).cities) {
    if (typeof c !== "object" || c === null) continue;
    const x = c as Record<string, unknown>;
    if (!isStr(x.city) || !isStr(x.country) || !isStr(x.timezone) || !isNum(x.latitude) || !isNum(x.longitude)) continue;
    if (x.latitude < -90 || x.latitude > 90 || x.longitude < -180 || x.longitude > 180) continue;
    out.push({
      city: x.city.trim(),
      province: isStr(x.province) ? x.province.trim() : "",
      country: x.country.trim(),
      iso2: isStr(x.iso2) ? x.iso2.trim().toUpperCase().slice(0, 2) : "",
      latitude: x.latitude,
      longitude: x.longitude,
      timezone: x.timezone.trim(),
    });
  }
  return out;
}

export async function searchRoxyLocations(
  config: RoxyServerConfig,
  query: string,
  opts: { limit?: number; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyLocationResult> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 20));
  const url = `${config.baseUrl}/location/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? ROXY_POLICY.timeoutMs);
  try {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "X-API-Key": config.apiKey },
        signal: ac.signal,
        cache: "no-store",
      });
    } catch (e) {
      const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
      return { ok: false, kind: aborted ? "timeout" : "network", status: null };
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      const s = res.status;
      return { ok: false, kind: s === 401 || s === 403 ? "unauthorized" : s === 429 ? "rate_limited" : s >= 500 ? "server_error" : "bad_request", status: s };
    }
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      return { ok: false, kind: "malformed_json", status: res.status };
    }
    const cities = parseRoxyLocationResponse(raw);
    return cities ? { ok: true, cities } : { ok: false, kind: "schema", status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
