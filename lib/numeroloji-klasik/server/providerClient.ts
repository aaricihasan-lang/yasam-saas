/**
 * Klasik Numeroloji — sağlayıcı HTTP istemcisi (YALNIZ SUNUCU). Astroloji/HD istemcilerinden bağımsızdır
 * (desen: lib/astrology/providers/roxy/client.ts).
 *
 * Güvenlik / maliyet:
 *   • Taban URL SABİT resmî host. `ROXY_API_BASE_URL` yalnız resmî host'a BİREBİR eşitse dikkate alınır;
 *     farklıysa YOK SAYILIR (anahtar başka bir host'a asla gönderilmez).
 *   • Anahtar yalnız `X-API-Key` başlığında gider; dönüş değerine, hata koduna, loga KONMAZ.
 *   • Yalnız uç kaydındaki (endpoints.ts) uçlar çağrılabilir; GET yol parametresi uç desenine uymalı.
 *   • Sağlayıcı hata gövdesi OKUNMAZ (girdiyi/anahtarı yansıtabilir).
 *   • Zaman aşımı 20 sn; zaman aşımı/ağ hatası YENİDEN DENENMEZ (sağlayıcı hesabı yapıp kotadan düşmüş
 *     olabilir → çift maliyet). YALNIZ 429/503 + Retry-After ≤ 5 sn → en fazla 1 yeniden deneme.
 *   • `fetchImpl` enjekte edilebilir → testler gerçek (ücretli) sağlayıcıya ÇAĞRI YAPMAZ.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { CLASSIC_ENDPOINTS, NUMEROLOGY_BASE_PATH, type ClassicEndpointId } from "../endpoints";

assertServerOnly("lib/numeroloji-klasik/server/providerClient");

export const CLASSIC_PROVIDER_BASE_URL = "https://roxyapi.com/api/v2";
export const CLASSIC_PROVIDER_LANG = "tr";
export const CLASSIC_TIMEOUT_MS = 20_000;
export const CLASSIC_MAX_RETRIES = 1;
export const CLASSIC_MAX_RETRY_AFTER_MS = 5_000;
/** Tek mantıksal çağrının en kötü süresi: 2 × 20 + 5 = 45 sn. */
export const CLASSIC_WORST_CALL_MS = CLASSIC_TIMEOUT_MS * (1 + CLASSIC_MAX_RETRIES) + CLASSIC_MAX_RETRY_AFTER_MS;
const MAX_BODY_BYTES = 8 * 1024;

export type ClassicProviderConfig = { apiKey: string; baseUrl: string };

/** Anahtar yoksa null → servis 503 (kayıtlı analizler yine okunur). */
export function readClassicProviderConfig(env: Record<string, string | undefined> = process.env): ClassicProviderConfig | null {
  const apiKey = (env.ROXY_API_KEY ?? "").trim();
  if (!apiKey) return null;
  // ROXY_API_BASE_URL yalnız resmî host'a eşitse kabul (sondaki / farkı tolere edilir); aksi hâlde yok sayılır.
  const raw = (env.ROXY_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const baseUrl = raw === CLASSIC_PROVIDER_BASE_URL ? raw : CLASSIC_PROVIDER_BASE_URL;
  return { apiKey, baseUrl };
}

export type ClassicProviderErrorKind =
  | "timeout"
  | "network"
  | "unauthorized"
  | "rate_limited"
  | "bad_request"
  | "saturated"
  | "server_error"
  | "malformed_json"
  | "not_allowed";

export type ProviderRateInfo = { limit: number | null; remaining: number | null; resetAt: number | null };

export type ClassicProviderResult =
  | { ok: true; raw: unknown; http: number; attempts: number; rate: ProviderRateInfo }
  | { ok: false; kind: ClassicProviderErrorKind; http: number | null; attempts: number; rate: ProviderRateInfo };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ClassicCallOptions = {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  lang?: string;
};

/** GET uçlarının yol parametresi desenleri (OpenAPI 2.0.0). */
const PATH_PARAM_RE: Partial<Record<ClassicEndpointId, RegExp>> = {
  meanings: /^(1|2|3|4|5|6|7|8|9|11|22|33)$/,
  compound_number: /^(1\d|2\d|3\d|4\d|5[0-2])$/,
};

const EMPTY_RATE: ProviderRateInfo = { limit: null, remaining: null, resetAt: null };

function intHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (v === null || !/^\d{1,12}$/.test(v.trim())) return null;
  return Number(v.trim());
}

export function readRateInfo(res: Response): ProviderRateInfo {
  const reset = intHeader(res, "x-ratelimit-reset");
  return {
    limit: intHeader(res, "x-ratelimit-limit"),
    remaining: intHeader(res, "x-ratelimit-remaining"),
    // epoch saniye → ms (küçük değerler göreli saniye olabilir; o durumda yok sayılır).
    resetAt: reset !== null && reset > 1_000_000_000 ? reset * 1000 : null,
  };
}

function retryAfterMs(res: Response): number {
  const h = res.headers.get("retry-after");
  const n = h ? Number(h) : NaN;
  if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, CLASSIC_MAX_RETRY_AFTER_MS + 1);
  return 2_000;
}

/** Uç + parametre → URL (beyaz liste dışı → null). */
export function buildClassicUrl(config: ClassicProviderConfig, id: ClassicEndpointId, pathParam: string | null, lang: string): string | null {
  const ep = CLASSIC_ENDPOINTS.find((e) => e.id === id);
  if (!ep) return null;
  if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang)) return null;
  let p = ep.path;
  if (p.includes("{n}")) {
    const re = PATH_PARAM_RE[id];
    if (!re || pathParam === null || !re.test(pathParam)) return null;
    p = p.replace("{n}", pathParam);
  } else if (pathParam !== null) {
    return null;
  }
  return `${config.baseUrl}${NUMEROLOGY_BASE_PATH}${p}?lang=${encodeURIComponent(lang)}`;
}

async function once(
  url: string,
  method: "GET" | "POST",
  bodyText: string | undefined,
  config: ClassicProviderConfig,
  timeoutMs: number,
  doFetch: FetchLike,
): Promise<{ result: ClassicProviderResult; retryAfter: number | null }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "X-API-Key": config.apiKey,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: bodyText,
      signal: ac.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
    return { result: { ok: false, kind: aborted ? "timeout" : "network", http: null, attempts: 1, rate: EMPTY_RATE }, retryAfter: null };
  }
  try {
    const rate = readRateInfo(res);
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      const s = res.status;
      const kind: ClassicProviderErrorKind =
        s === 401 || s === 403 ? "unauthorized" : s === 429 ? "rate_limited" : s === 503 ? "saturated" : s >= 500 ? "server_error" : "bad_request";
      const retryable = kind === "rate_limited" || kind === "saturated";
      return { result: { ok: false, kind, http: s, attempts: 1, rate }, retryAfter: retryable ? retryAfterMs(res) : null };
    }
    try {
      const raw: unknown = await res.json();
      return { result: { ok: true, raw, http: res.status, attempts: 1, rate }, retryAfter: null };
    } catch (e) {
      const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
      return { result: { ok: false, kind: aborted ? "timeout" : "malformed_json", http: res.status, attempts: 1, rate }, retryAfter: null };
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tek mantıksal sağlayıcı çağrısı. POST uçları `payload` (düz nesne) alır; GET uçları `pathParam`.
 * Dönüş hiçbir zaman anahtar veya sağlayıcı hata gövdesi içermez.
 */
export async function callClassicEndpoint(
  config: ClassicProviderConfig,
  id: ClassicEndpointId,
  payload: Record<string, unknown> | null,
  opts: ClassicCallOptions & { pathParam?: string | null } = {},
): Promise<ClassicProviderResult> {
  const ep = CLASSIC_ENDPOINTS.find((e) => e.id === id);
  const lang = opts.lang ?? CLASSIC_PROVIDER_LANG;
  const url = ep ? buildClassicUrl(config, id, opts.pathParam ?? null, lang) : null;
  if (!ep || !url) return { ok: false, kind: "not_allowed", http: null, attempts: 0, rate: EMPTY_RATE };
  let bodyText: string | undefined;
  if (ep.method === "POST") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, kind: "not_allowed", http: null, attempts: 0, rate: EMPTY_RATE };
    bodyText = JSON.stringify(payload);
    if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) return { ok: false, kind: "not_allowed", http: null, attempts: 0, rate: EMPTY_RATE };
  } else if (payload !== null) {
    return { ok: false, kind: "not_allowed", http: null, attempts: 0, rate: EMPTY_RATE };
  }
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = opts.timeoutMs ?? CLASSIC_TIMEOUT_MS;
  const maxRetries = Math.max(0, Math.min(CLASSIC_MAX_RETRIES, opts.maxRetries ?? CLASSIC_MAX_RETRIES));

  let attempts = 0;
  for (;;) {
    attempts += 1;
    const { result, retryAfter } = await once(url, ep.method, bodyText, config, timeoutMs, doFetch);
    if (result.ok) return { ...result, attempts };
    const canRetry = retryAfter !== null && retryAfter <= CLASSIC_MAX_RETRY_AFTER_MS && attempts <= maxRetries;
    if (!canRetry) return { ...result, attempts };
    await sleep(retryAfter);
  }
}
