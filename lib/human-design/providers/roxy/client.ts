// RoxyAPI HTTP istemcisi — YALNIZ SUNUCU.
//
// Güvenlik:
//   • API anahtarı yalnız `X-API-Key` başlığında gider; hiçbir dönüş değerine, hata
//     mesajına veya loga KONMAZ. Sağlayıcı hata gövdesi de dışarı aktarılmaz (anahtarı
//     yansıtabilir) — yalnız sınıflandırılmış hata kodu döner.
//   • Zaman aşımı AbortController ile zorunlu.
//   • `fetchImpl` enjekte edilebilir → testler gerçek (ücretli) Roxy'ye ÇAĞRI YAPMAZ.

import { ROXY_BODYGRAPH_ENDPOINT, ROXY_POLICY, type RoxyServerConfig } from "./config";

export type RoxyBodygraphRequest = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timezone: string; // IANA
  latitude: number;
  longitude: number;
  nodeType: string;
};

export type RoxyCallErrorKind =
  | "timeout"
  | "network"
  | "unauthorized" // 401/403 — anahtar/plan sorunu
  | "rate_limited" // 429
  | "bad_request" // diğer 4xx
  | "server_error" // 5xx
  | "malformed_json";

export type RoxyCallResult =
  | { ok: true; raw: unknown }
  | { ok: false; kind: RoxyCallErrorKind; status: number | null };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function callRoxyBodygraph(
  config: RoxyServerConfig,
  body: RoxyBodygraphRequest,
  opts: { lang?: string; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<RoxyCallResult> {
  const lang = opts.lang ?? ROXY_POLICY.lang;
  const timeoutMs = opts.timeoutMs ?? ROXY_POLICY.timeoutMs;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const url = `${config.baseUrl}${ROXY_BODYGRAPH_ENDPOINT}?lang=${encodeURIComponent(lang)}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": config.apiKey,
      },
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
      // Gövde okunmaz/aktarılmaz (anahtar yansıması riski); bağlantı serbest bırakılır.
      void res.body?.cancel().catch(() => undefined);
      const s = res.status;
      const kind: RoxyCallErrorKind =
        s === 401 || s === 403 ? "unauthorized" : s === 429 ? "rate_limited" : s >= 500 ? "server_error" : "bad_request";
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
