/**
 * KAMPANYA MERKEZİ KM-3 — Roxy GERÇEK hesap kalanı (YALNIZ SUNUCU).
 *
 *   refreshProviderUsage : YALNIZ Owner'ın panelden açıkça başlattığı işlem. Sağlayıcının /usage ucunu BİR kez çağırır
 *                          (sağlayıcı bunu da 1 birim sayar). Gövdeden gerçek kalan (remainingThisMonth), başlıktan anahtar
 *                          sayacı ve plan sınırı okunur → campaign_observe_usage (Owner DB'de yeniden doğrulanır + denetim).
 *                          Gövdede güvenilir bir kalan bulunamazsa HİÇBİR şey yazılmaz (tahmin yok).
 *   syncFromClassicLedger: uzman Klasik Numeroloji defterindeki (mevcut muhasebe) en yeni başlık kalanını, kayıtlı fark
 *                          geçerliyse düzeltilmiş olarak işler (salt okuma; uzman tablosuna yazılmaz).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { observeRoxyHeader, readRoxyRate, type FetchLike } from "./roxyGuard";

assertServerOnly("lib/campaign/visitor/providerUsage");

type Db = Pick<SupabaseClient, "rpc" | "from">;
export const ROXY_DEFAULT_BASE = "https://roxyapi.com/api/v2";

export function roxyBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.ROXY_API_BASE_URL ?? "").trim() || ROXY_DEFAULT_BASE;
  return /^https:\/\/[^\s]+$/.test(raw) ? raw.replace(/\/+$/, "") : null;
}
export function roxyApiKey(env: Record<string, string | undefined> = process.env): string | null {
  const k = (env.ROXY_API_KEY ?? "").trim();
  return k.length >= 8 ? k : null;
}

const REAL_KEYS = ["remainingThisMonth", "remaining_this_month", "remainingMonth"];

/** Gövdeden gerçek aylık kalanı bulur (yalnız bilinen alan adları; sayı ve ≥ 0). İç içe nesnelerde de arar (derinlik ≤ 3). */
export function findRealRemaining(body: unknown, depth = 0): number | null {
  if (!body || typeof body !== "object" || depth > 3) return null;
  for (const k of REAL_KEYS) {
    const v = (body as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000_000) return v;
  }
  for (const v of Object.values(body as Record<string, unknown>)) {
    const r = findRealRemaining(v, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

export type UsageRefreshResult =
  | { ok: true; remaining: number; headerRemaining: number | null; quotaLimit: number | null; gap: number | null }
  | { ok: false; error: "yapilandirma_yok" | "saglayici_hatasi" | "bicim_taninmadi" | "kayit_hatasi"; status?: number };

export async function refreshProviderUsage(
  db: Db,
  actorId: string,
  env: Record<string, string | undefined> = process.env,
  deps: { fetchImpl?: FetchLike; now?: Date } = {},
): Promise<UsageRefreshResult> {
  const base = roxyBaseUrl(env);
  const key = roxyApiKey(env);
  if (!base || !key) return { ok: false, error: "yapilandirma_yok" };
  let res: Response;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      res = await (deps.fetchImpl ?? fetch)(`${base}/usage`, { method: "GET", headers: { "X-API-Key": key, Accept: "application/json" }, cache: "no-store", signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  } catch {
    return { ok: false, error: "saglayici_hatasi" };
  }
  if (!res.ok) return { ok: false, error: "saglayici_hatasi", status: res.status };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "bicim_taninmadi" };
  }
  const real = findRealRemaining(body);
  if (real === null) return { ok: false, error: "bicim_taninmadi" };
  const rate = readRoxyRate(res.headers, deps.now ?? new Date());
  try {
    const { data, error } = await db.rpc("campaign_observe_usage", {
      p_actor: actorId,
      p_remaining_real: real,
      p_header_remaining: rate.remaining,
      p_quota_limit: rate.limit,
      p_reset_at: rate.resetAt ? rate.resetAt.toISOString() : null,
    });
    if (error || (data as { ok?: unknown } | null)?.ok !== true) return { ok: false, error: "kayit_hatasi" };
    const gap = (data as { gap?: unknown }).gap;
    return { ok: true, remaining: real, headerRemaining: rate.remaining, quotaLimit: rate.limit, gap: typeof gap === "number" ? gap : null };
  } catch {
    return { ok: false, error: "kayit_hatasi" };
  }
}

/** Uzman Klasik Numeroloji defterindeki son başlık kalanı (≤ 10 dk) → düzeltilmiş tazelik. Yazma yalnız kampanya durumuna. */
export async function syncFromClassicLedger(db: Db, now: Date = new Date()): Promise<boolean> {
  try {
    const since = new Date(now.getTime() - 10 * 60_000).toISOString();
    const { data, error } = await db
      .from("numerology_classic_provider_calls")
      .select("quota_remaining, quota_reset_at, created_at")
      .gte("quota_remaining", 0)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return false;
    const row = data[0] as { quota_remaining: number; quota_reset_at: string | null; created_at: string };
    return observeRoxyHeader(
      db,
      { limit: null, remaining: row.quota_remaining, resetAt: row.quota_reset_at ? new Date(row.quota_reset_at) : null },
      new Date(row.created_at),
    );
  } catch {
    return false;
  }
}
