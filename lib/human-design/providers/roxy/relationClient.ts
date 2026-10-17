// RoxyAPI İlişki (Connection) ve Grup (Penta) HTTP istemcisi — YALNIZ SUNUCU.
//
// Güvenlik callRoxyBodygraph (client.ts) ile BİREBİR aynı kurallar:
//   • API anahtarı yalnız `X-API-Key` başlığında; dönüş/hata/log içine KONMAZ.
//   • Sağlayıcı hata gövdesi okunmaz/aktarılmaz; yalnız sınıflandırılmış hata kodu döner.
//   • Zaman aşımı zorunlu; `fetchImpl` enjekte edilebilir → testler ücretli çağrı YAPMAZ.
// BodyGraph istemcisi DEĞİŞTİRİLMEDİ; bu dosya yalnız iki yeni uç içindir.

import { ROXY_CONNECTION_ENDPOINT, ROXY_PENTA_ENDPOINT, ROXY_POLICY, type RoxyServerConfig } from "./config";
import type { FetchLike, RoxyCallErrorKind, RoxyCallResult } from "./client";

/** OpenAPI: date (YYYY-MM-DD), time (HH:MM:SS), timezone (IANA tercih), latitude/longitude, nodeType. */
export type RoxyBirthMoment = {
  date: string;
  time: string;
  timezone: string;
  latitude: number;
  longitude: number;
  nodeType: string;
};

export type RoxyConnectionRequest = { personA: RoxyBirthMoment; personB: RoxyBirthMoment };
export type RoxyPentaRequest = { members: RoxyBirthMoment[] };

async function callRoxyJson(
  config: RoxyServerConfig,
  endpoint: string,
  body: unknown,
  opts: { lang?: string; timeoutMs?: number; fetchImpl?: FetchLike },
): Promise<RoxyCallResult> {
  const lang = opts.lang ?? ROXY_POLICY.lang;
  const timeoutMs = opts.timeoutMs ?? ROXY_POLICY.timeoutMs;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const url = `${config.baseUrl}${endpoint}?lang=${encodeURIComponent(lang)}`;
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
      const kind: RoxyCallErrorKind =
        s === 401 || s === 403 ? "unauthorized" : s === 429 ? "rate_limited" : s >= 500 ? "server_error" : "bad_request";
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

export function callRoxyConnection(
  config: RoxyServerConfig,
  body: RoxyConnectionRequest,
  opts: { lang?: string; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyCallResult> {
  return callRoxyJson(config, ROXY_CONNECTION_ENDPOINT, body, opts);
}

export function callRoxyPenta(
  config: RoxyServerConfig,
  body: RoxyPentaRequest,
  opts: { lang?: string; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyCallResult> {
  return callRoxyJson(config, ROXY_PENTA_ENDPOINT, body, opts);
}
