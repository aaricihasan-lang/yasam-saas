// Astroloji — RoxyAPI GENEL HTTP istemcisi (YALNIZ SUNUCU). Human Design istemcisinden bağımsızdır.
//
// Güvenlik:
//   • Anahtar yalnız `X-API-Key` başlığında gider; dönüş değerine, hata koduna, loga KONMAZ.
//     Sağlayıcı hata gövdesi okunmaz/aktarılmaz (anahtarı/girdiyi yansıtabilir).
//   • Zaman aşımı AbortController ile zorunlu. `fetchImpl` enjekte edilebilir → testler gerçek
//     (ücretli) Roxy'ye ÇAĞRI YAPMAZ.
//   • Yeniden deneme YALNIZ hesap yapılmadığı kesin durumlarda ve EN FAZLA 1 kez: 429 ve 503
//     (Retry-After ≤ 5 sn). Zaman aşımı/ağ hatası yeniden DENENMEZ (sağlayıcı hesabı yapmış ve
//     kotadan düşmüş olabilir → çift maliyet riski).

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASTRO_PROVIDER_LANG, ASTRO_ROXY_TIMEOUT_MS, type RoxyServerConfig } from "../../config";

assertServerOnly("lib/astrology/providers/roxy/client");

export type RoxyErrorKind =
  | "timeout"
  | "network"
  | "unauthorized" // 401/403 — anahtar/plan sorunu
  | "rate_limited" // 429
  | "bad_request" // diğer 4xx
  | "saturated" // 503 (compute_saturated)
  | "server_error" // diğer 5xx
  | "malformed_json";

export type RoxyCallResult =
  | { ok: true; raw: unknown; attempts: number }
  | { ok: false; kind: RoxyErrorKind; status: number | null; attempts: number };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type RoxyCallOptions = {
  lang?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Yeniden deneme sayısı üst sınırı (varsayılan 1). Testler 0 verebilir. */
  maxRetries?: number;
  /** Ek sorgu parametreleri (beyaz liste: anahtar [a-z]+, değer [a-z0-9,-]+). */
  query?: Record<string, string>;
};

const QUERY_KEY_RE = /^[a-z]{1,20}$/;
const QUERY_VAL_RE = /^[a-z0-9,\-]{1,80}$/;

function buildUrl(config: RoxyServerConfig, endpoint: string, lang: string, query: Record<string, string> | undefined): string | null {
  const qs = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(query ?? {})) {
    if (!QUERY_KEY_RE.test(k) || k === "lang" || !QUERY_VAL_RE.test(v)) return null;
    qs.set(k, v);
  }
  return `${config.baseUrl}${endpoint}?${qs.toString()}`;
}

const MAX_RETRY_AFTER_MS = 5_000;

function retryAfterMs(res: Response): number {
  const h = res.headers.get("retry-after");
  const n = h ? Number(h) : NaN;
  if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, MAX_RETRY_AFTER_MS + 1);
  return 2_000;
}

async function once(
  config: RoxyServerConfig,
  endpoint: string,
  body: Record<string, unknown>,
  lang: string,
  timeoutMs: number,
  doFetch: FetchLike,
  query?: Record<string, string>,
): Promise<{ result: RoxyCallResult; retryAfter: number | null }> {
  const url = buildUrl(config, endpoint, lang, query);
  if (!url) return { result: { ok: false, kind: "bad_request", status: null, attempts: 0 }, retryAfter: null };
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
    return { result: { ok: false, kind: aborted ? "timeout" : "network", status: null, attempts: 1 }, retryAfter: null };
  }
  try {
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      const s = res.status;
      const kind: RoxyErrorKind =
        s === 401 || s === 403
          ? "unauthorized"
          : s === 429
            ? "rate_limited"
            : s === 503
              ? "saturated"
              : s >= 500
                ? "server_error"
                : "bad_request";
      const retryable = kind === "rate_limited" || kind === "saturated";
      return { result: { ok: false, kind, status: s, attempts: 1 }, retryAfter: retryable ? retryAfterMs(res) : null };
    }
    try {
      const raw: unknown = await res.json();
      return { result: { ok: true, raw, attempts: 1 }, retryAfter: null };
    } catch (e) {
      const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
      return { result: { ok: false, kind: aborted ? "timeout" : "malformed_json", status: res.status, attempts: 1 }, retryAfter: null };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** POST <base><endpoint>?lang=… — tek mantıksal çağrı (en fazla 1 güvenli yeniden deneme). */
export async function callRoxy(
  config: RoxyServerConfig,
  endpoint: string,
  body: Record<string, unknown>,
  opts: RoxyCallOptions = {},
): Promise<RoxyCallResult> {
  if (!/^\/[a-z0-9\-/]{1,120}$/.test(endpoint)) {
    return { ok: false, kind: "bad_request", status: null, attempts: 0 };
  }
  const lang = opts.lang ?? ASTRO_PROVIDER_LANG;
  const timeoutMs = opts.timeoutMs ?? ASTRO_ROXY_TIMEOUT_MS;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = Math.max(0, Math.min(1, opts.maxRetries ?? 1));

  let attempts = 0;
  for (;;) {
    attempts += 1;
    const { result, retryAfter } = await once(config, endpoint, body, lang, timeoutMs, doFetch, opts.query);
    if (result.ok) return { ...result, attempts };
    const canRetry = retryAfter !== null && retryAfter <= MAX_RETRY_AFTER_MS && attempts <= maxRetries;
    if (!canRetry) return { ...result, attempts };
    await sleep(retryAfter);
  }
}
