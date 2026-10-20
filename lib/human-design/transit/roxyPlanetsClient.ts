// RoxyAPI Batı astrolojisi GEZEGEN KONUMLARI istemcisi — YALNIZ SUNUCU (OpenAPI v2.0.0: POST /astrology/planets).
// Konum: transit klasörü (L5 korumalı sağlayıcı klasörü ve Gökyüzü Atlası istemcileri DEĞİŞMEZ; yalnız tip/ayar okunur).
//
// Doğum haritası DEĞİLDİR: tek UTC anı için geosentrik, görünen, tarihin gerçek ekliptiğinde tropikal boylamlar.
// İstek: { date, time (UTC), timezone: 0, latitude: 0, longitude: 0, nodeType: "true" } — gözlemci konumu boylamı etkilemez.
// Güvenlik mevcut istemcilerle aynı: anahtar yalnız `X-API-Key` başlığında; hata gövdesi okunmaz; zaman aşımı zorunlu.

import { ROXY_POLICY, type RoxyServerConfig } from "../providers/roxy/config";
import type { FetchLike, RoxyCallErrorKind, RoxyCallResult } from "../providers/roxy/client";
import type { PlanetName } from "../engine/types";

export const ROXY_PLANETS_ENDPOINT = "/astrology/planets";
export const ROXY_PLANETS_ADAPTER_VERSION = "roxy-planets-1";

export type RoxyPlanetsRequest = { date: string; time: string; timezone: 0; latitude: 0; longitude: 0; nodeType: "true" };

export function roxyPlanetsRequest(utcIso: string): RoxyPlanetsRequest {
  return { date: utcIso.slice(0, 10), time: utcIso.slice(11, 19), timezone: 0, latitude: 0, longitude: 0, nodeType: "true" };
}

export async function callRoxyPlanets(
  config: RoxyServerConfig,
  body: RoxyPlanetsRequest,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyCallResult> {
  const timeoutMs = opts.timeoutMs ?? ROXY_POLICY.timeoutMs;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  // lang=en: yalnız sayısal alanlar kullanılır; yorum metinleri okunmaz.
  const url = `${config.baseUrl}${ROXY_PLANETS_ENDPOINT}?lang=en`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify(body),
      signal: ac.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
    return { ok: false, kind: aborted ? "timeout" : "network", status: null };
  }
  try {
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      const s = res.status;
      const kind: RoxyCallErrorKind = s === 401 || s === 403 ? "unauthorized" : s === 429 ? "rate_limited" : s >= 500 ? "server_error" : "bad_request";
      return { ok: false, kind, status: s };
    }
    try {
      return { ok: true, raw: await res.json() };
    } catch (e) {
      const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
      return { ok: false, kind: aborted ? "timeout" : "malformed_json", status: res.status };
    }
  } finally {
    clearTimeout(timer);
  }
}

const NAME: Record<string, PlanetName> = {
  Sun: "Sun", Moon: "Moon", Mercury: "Mercury", Venus: "Venus", Mars: "Mars", Jupiter: "Jupiter", Saturn: "Saturn",
  Uranus: "Uranus", Neptune: "Neptune", Pluto: "Pluto", "North Node": "NorthNode", "South Node": "SouthNode",
};

/** 13 HD cisminin boylamı (Chiron / Lilith dışarıda; Dünya = Güneş + 180°). Şema / karşıtlık hatasında errors dolu. */
export function parseRoxyPlanets(raw: unknown): { ok: true; longitudes: Record<PlanetName, number> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const planets = (raw as { planets?: unknown })?.planets;
  if (!Array.isArray(planets)) return { ok: false, errors: ["planets dizi değil"] };
  const lon: Partial<Record<PlanetName, number>> = {};
  for (const p of planets) {
    const name = typeof (p as { name?: unknown })?.name === "string" ? NAME[(p as { name: string }).name] : undefined;
    if (!name) continue; // Chiron, Black Moon Lilith vb. HD'de kullanılmaz
    const l = (p as { longitude?: unknown }).longitude;
    if (typeof l !== "number" || !Number.isFinite(l) || l < 0 || l >= 360) { errors.push(`${name} boylamı geçersiz`); continue; }
    if (lon[name] !== undefined) errors.push(`${name} iki kez`);
    lon[name] = l;
  }
  for (const n of ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "NorthNode", "SouthNode"] as const) if (lon[n] === undefined) errors.push(`${n} yok`);
  if (errors.length) return { ok: false, errors };
  const opp = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  if (Math.abs(opp(lon.SouthNode!, lon.NorthNode!) - 180) * 3600 > 1) errors.push("Güney Düğüm ≠ Kuzey Düğüm + 180°");
  if (errors.length) return { ok: false, errors };
  lon.Earth = (lon.Sun! + 180) % 360;
  return { ok: true, longitudes: lon as Record<PlanetName, number> };
}
