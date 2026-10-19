// RoxyAPI Human Design TRANSİT HTTP istemcisi — YALNIZ SUNUCU (OpenAPI v2.0.0: POST /human-design/transit).
// Konum: transit klasörü — L5 korumalı sağlayıcı klasörü (lib/human-design/providers) DEĞİŞMEZ; yalnız tipleri/ayarları okunur.
//
// Güvenlik mevcut BodyGraph / İlişki istemcileriyle BİREBİR aynı kurallar (o dosyalar DEĞİŞTİRİLMEDİ):
//   • API anahtarı yalnız `X-API-Key` başlığında; dönüş/hata/log içine KONMAZ.
//   • Sağlayıcı hata gövdesi okunmaz/aktarılmaz; yalnız sınıflandırılmış hata kodu döner.
//   • Zaman aşımı zorunlu; `fetchImpl` enjekte edilebilir → testler ücretli çağrı YAPMAZ.
// İstek: { birthData: { date, time, timezone, latitude, longitude, nodeType }, date (UTC), time (UTC) }.

import { ROXY_POLICY, type RoxyServerConfig } from "../providers/roxy/config";
import type { FetchLike, RoxyCallErrorKind, RoxyCallResult } from "../providers/roxy/client";
import type { RoxyBirthMoment } from "../providers/roxy/relationClient";

export const ROXY_TRANSIT_ENDPOINT = "/human-design/transit";
/** Transit adaptör sözleşme sürümü — değişirse önbellek anahtarı da değişir. */
export const ROXY_TRANSIT_ADAPTER_VERSION = "roxy-transit-1";

export type RoxyTransitRequest = { birthData: RoxyBirthMoment; date: string; time: string };

export async function callRoxyTransit(
  config: RoxyServerConfig,
  body: RoxyTransitRequest,
  opts: { lang?: string; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyCallResult> {
  const lang = opts.lang ?? ROXY_POLICY.lang;
  const timeoutMs = opts.timeoutMs ?? ROXY_POLICY.timeoutMs;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const url = `${config.baseUrl}${ROXY_TRANSIT_ENDPOINT}?lang=${encodeURIComponent(lang)}`;
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
