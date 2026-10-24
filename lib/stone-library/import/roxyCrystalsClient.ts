// Doğaltaş Kütüphanesi · sağlayıcı (Roxy) kristal uçları — YALNIZ SUNUCU, YALNIZ GET.
//
// Güvenlik (astroloji istemcisiyle aynı ilkeler):
//   • Anahtar yalnız `X-API-Key` başlığında gider; dönüş değerine, hata metnine, log'a KONMAZ.
//   • Zaman aşımı AbortController ile zorunlu. Bu katman YENİDEN DENEMEZ (kredi kararı runner'da, deftere yazıldıktan sonra).
//   • Yol ve sorgu beyaz listede; serbest URL kabul edilmez. Görsel indirme yalnız izinli görsel yolundan.
//   • `fetchImpl` enjekte edilebilir → testler gerçek (ücretli) sağlayıcıya ÇAĞRI YAPMAZ.

export type CrystalsFetch = (input: string, init: RequestInit) => Promise<Response>;

export type CrystalsConfig = { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: CrystalsFetch };

export type QuotaHeaders = { limit: number | null; remaining: number | null; used: number | null; reset: number | null };

export type CrystalsCallResult =
  | { ok: true; status: number; json: unknown; quota: QuotaHeaders; retryAfterMs: null }
  | { ok: false; status: number | null; kind: "timeout" | "network" | "http" | "malformed_json"; json: unknown; quota: QuotaHeaders; retryAfterMs: number | null };

export const CRYSTALS_DEFAULT_BASE_URL = "https://roxyapi.com/api/v2";
export const CRYSTALS_TIMEOUT_MS = 20_000;
export const CRYSTALS_LANGS = ["tr", "en"] as const;
export type CrystalsLang = (typeof CRYSTALS_LANGS)[number];

/** Yalnız bu yollar çağrılabilir (endpoint metni ham kayıtta da bu biçimde saklanır). */
const PATH_RE = /^\/crystals(\/[a-z0-9-]{1,80}|\/birthstone\/(?:[1-9]|1[0-2])|\/colors|\/planets)?$/;
const QUERY_KEY_RE = /^(lang|limit|offset)$/;
const QUERY_VAL_RE = /^[a-z0-9-]{1,10}$/;

export function isAllowedCrystalsPath(path: string): boolean {
  return PATH_RE.test(path);
}

function num(h: string | null): number | null {
  if (h == null || h === "") return null;
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

export function readQuota(res: Response): QuotaHeaders {
  return {
    limit: num(res.headers.get("x-ratelimit-limit")),
    remaining: num(res.headers.get("x-ratelimit-remaining")),
    used: num(res.headers.get("x-ratelimit-used")),
    reset: num(res.headers.get("x-ratelimit-reset")),
  };
}

const NO_QUOTA: QuotaHeaders = { limit: null, remaining: null, used: null, reset: null };

export function buildCrystalsUrl(cfg: CrystalsConfig, path: string, query: Record<string, string>): string | null {
  if (!isAllowedCrystalsPath(path)) return null;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (!QUERY_KEY_RE.test(k) || !QUERY_VAL_RE.test(v)) return null;
    qs.set(k, v);
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return null;
  const s = qs.toString();
  return `${base}${path}${s ? `?${s}` : ""}`;
}

/** Tek GET. Yeniden deneme YOK. Hata gövdesi yalnız JSON ise ve anahtar metnini İÇERMİYORSA döner. */
export async function getCrystals(cfg: CrystalsConfig, path: string, query: Record<string, string>): Promise<CrystalsCallResult> {
  const url = buildCrystalsUrl(cfg, path, query);
  if (!url) return { ok: false, status: null, kind: "http", json: null, quota: NO_QUOTA, retryAfterMs: null };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs ?? CRYSTALS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await (cfg.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { Accept: "application/json", "X-API-Key": cfg.apiKey },
      signal: ac.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
    return { ok: false, status: null, kind: aborted ? "timeout" : "network", json: null, quota: NO_QUOTA, retryAfterMs: null };
  }
  try {
    const quota = readQuota(res);
    let text = "";
    try {
      text = await res.text();
    } catch {
      return { ok: false, status: res.status, kind: ac.signal.aborted ? "timeout" : "network", json: null, quota, retryAfterMs: null };
    }
    let json: unknown = null;
    let parsed = false;
    // Anahtar yanıtta yansıtılmışsa gövde hiç ayrıştırılmaz / saklanmaz (kısa test anahtarlarında yanlış pozitif olmasın).
    const keyEchoed = cfg.apiKey.length >= 16 && text.includes(cfg.apiKey);
    if (text && !keyEchoed) {
      try {
        json = JSON.parse(text);
        parsed = true;
      } catch {
        parsed = false;
      }
    }
    if (!res.ok) {
      const ra = num(res.headers.get("retry-after"));
      return { ok: false, status: res.status, kind: "http", json: parsed ? json : null, quota, retryAfterMs: ra == null ? null : ra * 1000 };
    }
    if (!parsed) return { ok: false, status: res.status, kind: "malformed_json", json: null, quota, retryAfterMs: null };
    return { ok: true, status: res.status, json, quota, retryAfterMs: null };
  } finally {
    clearTimeout(timer);
  }
}

// ── Görsel indirme (kredi harcamayan statik varlık; yine de deftere yazılır) ───────────────────
const IMAGE_URL_RE = /^https:\/\/roxyapi\.com\/img\/crystals\/[a-z0-9-]{1,80}\.(jpg|jpeg|png|webp)$/;

export function isAllowedCrystalImageUrl(url: unknown): url is string {
  return typeof url === "string" && IMAGE_URL_RE.test(url);
}

export type ImageFetchResult =
  | { ok: true; status: number; bytes: Buffer; contentType: string | null; quota: QuotaHeaders }
  | { ok: false; status: number | null; reason: "url_not_allowed" | "timeout" | "network" | "http" | "too_large" };

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Yalnız izinli kristal görsel yolu; gövde akış hâlinde okunur ve bayt sınırı aşılınca kesilir. Anahtar GÖNDERİLMEZ. */
export async function fetchCrystalImage(url: string, opts: { fetchImpl?: CrystalsFetch; timeoutMs?: number } = {}): Promise<ImageFetchResult> {
  if (!isAllowedCrystalImageUrl(url)) return { ok: false, status: null, reason: "url_not_allowed" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? CRYSTALS_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await (opts.fetchImpl ?? fetch)(url, { method: "GET", redirect: "manual", signal: ac.signal, cache: "no-store" });
    } catch (e) {
      const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
      return { ok: false, status: null, reason: aborted ? "timeout" : "network" };
    }
    if (res.status !== 200) {
      void res.body?.cancel().catch(() => undefined);
      return { ok: false, status: res.status, reason: "http" };
    }
    const len = num(res.headers.get("content-length"));
    if (len != null && len > IMAGE_MAX_BYTES) {
      void res.body?.cancel().catch(() => undefined);
      return { ok: false, status: res.status, reason: "too_large" };
    }
    const chunks: Buffer[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > IMAGE_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, status: res.status, reason: "too_large" };
        }
        chunks.push(Buffer.from(value));
      }
    }
    return { ok: true, status: res.status, bytes: Buffer.concat(chunks), contentType: res.headers.get("content-type"), quota: readQuota(res) };
  } catch {
    return { ok: false, status: null, reason: ac.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
