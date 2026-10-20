// RoxyAPI Human Design Variables (POST /human-design/variables) — YALNIZ SUNUCU, dar istemci.
//
// Mevcut BodyGraph istemcisiyle (providers/roxy/client.ts — L5 korumalı, DEĞİŞTİRİLMEDİ) aynı güvenlik deseni:
//   • API anahtarı yalnız `X-API-Key` başlığında; dönüşe / hataya / loga KONMAZ. Sağlayıcı hata gövdesi okunmaz.
//   • Üst adres sabittir (yapılandırmadaki base URL + sabit yol); kullanıcı girdisi URL'ye girmez (SSRF yok).
//   • Zaman aşımı zorunlu; `fetchImpl` enjekte edilebilir → testler ücretli çağrı yapmaz.
// Gövde: kayıtlı natal analizin Roxy'ye gönderilen girdisiyle BİREBİR aynı alanlar (doğum anı); ad / iletişim / not YOK.

import { ROXY_POLICY, type RoxyServerConfig } from "../providers/roxy/config";
import type { FetchLike, RoxyCallErrorKind, RoxyCallResult } from "../providers/roxy/client";

export const ROXY_VARIABLES_ENDPOINT = "/human-design/variables";
/** Sözleşme sürümü (OpenAPI 2.0.0 calculateVariables) — değişirse önbellek anahtarı da değişir. */
export const ROXY_VARIABLES_ADAPTER_VERSION = "roxy-variables-2";

export type RoxyVariablesRequest = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timezone: string; // IANA
  latitude: number;
  longitude: number;
  nodeType: "true" | "mean";
};

export async function callRoxyVariables(
  config: RoxyServerConfig,
  body: RoxyVariablesRequest,
  opts: { lang?: string; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyCallResult> {
  const lang = opts.lang ?? ROXY_POLICY.lang;
  const timeoutMs = opts.timeoutMs ?? ROXY_POLICY.timeoutMs;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const url = `${config.baseUrl}${ROXY_VARIABLES_ENDPOINT}?lang=${encodeURIComponent(lang)}`;
  // Yalnız doğum anı alanları (fazladan alan sızmasın diye açıkça yeniden kurulur).
  const payload: RoxyVariablesRequest = {
    date: body.date,
    time: body.time,
    timezone: body.timezone,
    latitude: body.latitude,
    longitude: body.longitude,
    nodeType: body.nodeType,
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify(payload),
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
    let raw: unknown;
    try {
      raw = await res.json();
    } catch (e) {
      const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
      return { ok: false, kind: aborted ? "timeout" : "malformed_json", status: res.status };
    }
    return { ok: true, raw };
  } finally {
    clearTimeout(timer);
  }
}
