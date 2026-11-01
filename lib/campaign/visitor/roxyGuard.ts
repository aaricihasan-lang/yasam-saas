/**
 * KAMPANYA MERKEZİ KM-3 — ücretli sağlayıcı (Roxy) çağrılarının kampanya kota korumasına bağlanması (YALNIZ SUNUCU).
 *
 * Mevcut uzman istemcileri (HD / Atlas / Klasik Numeroloji) DEĞİŞTİRİLMEZ: hepsi `fetchImpl` / `callProvider` enjeksiyonu
 * kabul eder. Burada üretilen `guardedFetch`, HER HTTP isteğini ReservationCallGuard.call() ile yetkilendirir:
 *   - rezervasyon tavanı + DB izni (campaign_authorize_call) olmadan istek ATILMAZ (yeniden deneme de ayrı yetki ister);
 *   - yalnız yapılandırılmış Roxy köküne (https) gidilir; başka adres → istek atılmaz;
 *   - yanıt başlıkları (X-RateLimit-Limit / Remaining / Reset) okunur: plan sınırı kayda geçer, "kalan" ise yalnız
 *     campaign_observe_header ile GEÇERLİ hesap farkı (başlık − gerçek /usage) varken düzeltilmiş olarak işlenir.
 *     Başlık kalanı ASLA doğrudan hesap kalanı sayılmaz (canlı ölçüm: başlık hesabın gerçek kalanından yüksektir).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReservationCallGuard } from "../quotaService";

assertServerOnly("lib/campaign/visitor/roxyGuard");

type Rpc = Pick<SupabaseClient, "rpc">;
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type RoxyRate = { limit: number | null; remaining: number | null; resetAt: Date | null };

function intHeader(h: Headers, name: string): number | null {
  const v = h.get(name);
  if (v === null || !/^\d{1,12}$/.test(v.trim())) return null;
  const n = Number(v.trim());
  return n <= 100_000_000 ? n : null;
}

/** Sağlayıcı belgesi: Limit = aylık hak, Remaining = bu ay kalan (anahtar sayacı), Reset = sıfırlamaya kalan saniye. */
export function readRoxyRate(h: Headers, now: Date = new Date()): RoxyRate {
  const reset = intHeader(h, "x-ratelimit-reset");
  let resetAt: Date | null = null;
  if (reset !== null) resetAt = reset > 1_000_000_000 ? new Date(reset * 1000) : new Date(now.getTime() + reset * 1000);
  const limit = intHeader(h, "x-ratelimit-limit");
  return { limit: limit !== null && limit >= 1 ? limit : null, remaining: intHeader(h, "x-ratelimit-remaining"), resetAt };
}

/** Başlık gözlemini kampanya durumuna işler (fark yoksa yalnız plan sınırı). Hata yutulur — fail-closed taraf: tazelik yok. */
export async function observeRoxyHeader(db: Rpc, rate: RoxyRate, observedAt: Date | null = null): Promise<boolean> {
  if (rate.remaining === null && rate.limit === null) return false;
  try {
    const { data, error } = await db.rpc("campaign_observe_header", {
      p_header_remaining: rate.remaining,
      p_quota_limit: rate.limit,
      p_reset_at: rate.resetAt ? rate.resetAt.toISOString() : null,
      p_observed_at: observedAt ? observedAt.toISOString() : null,
    });
    return !error && (data as { applied?: unknown } | null)?.applied === true;
  } catch {
    return false;
  }
}

export type GuardDenial = { reason: string };

/**
 * Rezervasyona bağlı fetch. `allowedBase` dışına istek atmaz. Her istek 1 kredi olarak yetkilendirilir (sağlayıcı: 1 istek
 * = 1 birim). Yetki reddinde istek ATILMAZ ve hata fırlatılır (istemciler bunu ağ hatası olarak görür); gerçek red nedeni
 * `denials` dizisinde tutulur. Ağ hatası / zaman aşımı guard tarafından kayda geçer.
 */
export function guardedFetch(
  guard: ReservationCallGuard,
  db: Rpc,
  allowedBase: string,
  label: string,
  opts: { fetchImpl?: FetchLike; denials?: GuardDenial[]; now?: () => Date } = {},
): FetchLike {
  const base = allowedBase.replace(/\/+$/, "");
  const doFetch: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/^https:\/\//.test(base) || !(url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`))) {
      opts.denials?.push({ reason: "izinsiz_adres" });
      throw Object.assign(new Error("campaign: izinsiz sağlayıcı adresi"), { name: "CampaignGuardDenied" });
    }
    let response: Response | null = null;
    const r = await guard.call(label, 1, async () => {
      const res = await doFetch(input, init);
      response = res;
      const rate = readRoxyRate(res.headers, opts.now?.() ?? new Date());
      // Ham başlık kalanı kayda "kalan" olarak GEÇMEZ (null); yalnız plan sınırı ve sıfırlama zamanı.
      return { value: res, meta: { httpStatus: res.status, remaining: null, quotaLimit: rate.limit, resetAt: rate.resetAt } };
    });
    if (!r.ok) {
      if (r.reason !== "saglayici_hatasi") {
        opts.denials?.push({ reason: r.reason });
        throw Object.assign(new Error(`campaign: sağlayıcı çağrısı reddedildi (${r.reason})`), { name: "CampaignGuardDenied" });
      }
      throw r.error instanceof Error ? r.error : new Error("campaign: sağlayıcı hatası");
    }
    const res = response as Response | null;
    if (res) await observeRoxyHeader(db, readRoxyRate(res.headers, opts.now?.() ?? new Date()));
    return r.value;
  };
}
