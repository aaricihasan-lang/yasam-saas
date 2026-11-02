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

function collectRemaining(body: unknown, depth: number, out: number[]): void {
  if (!body || typeof body !== "object" || depth > 3) return;
  for (const k of REAL_KEYS) {
    const v = (body as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000_000) out.push(v);
  }
  for (const v of Object.values(body as Record<string, unknown>)) collectRemaining(v, depth + 1, out);
}
/**
 * Gövdeden gerçek aylık kalanı bulur (yalnız bilinen alan adları; sayı ve ≥ 0; derinlik ≤ 3). Denetim O-1: gövdede FARKLI
 * değerli birden çok aday alan varsa (ör. anahtar düzeyi + hesap düzeyi) hangisinin hesap kalanı olduğu bilinemez → null
 * (hiçbir şey yazılmaz; tahmin yok).
 */
export function findRealRemaining(body: unknown): number | null {
  const all: number[] = [];
  collectRemaining(body, 0, all);
  const uniq = [...new Set(all)];
  return uniq.length === 1 ? uniq[0] : null;
}

/**
 * B-4 (000500): fark doğrulama durumu. "dogrulandi" yalnız ≥ 1 saat arayla iki tutarlı gerçek okumadan sonra (24 saat geçerli);
 * "kayma" = aynı hesapta izlenemeyen (başka anahtar) tüketim şüphesi. Migration yoksa null (eski davranış).
 */
export type GapStatus = "ilk_gozlem" | "bekliyor_ara" | "dogrulandi" | "kayma" | "fark_yok";
const GAP_STATUSES: readonly GapStatus[] = ["ilk_gozlem", "bekliyor_ara", "dogrulandi", "kayma", "fark_yok"];

export type UsageRefreshResult =
  | { ok: true; remaining: number; headerRemaining: number | null; quotaLimit: number | null; gap: number | null; gapStatus: GapStatus | null; verifiedUntil: string | null }
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
      // Denetim D-5: yönlendirme izlenmez (anahtar başlığı başka kökene taşınamaz).
      res = await (deps.fetchImpl ?? fetch)(`${base}/usage`, { method: "GET", headers: { "X-API-Key": key, Accept: "application/json" }, cache: "no-store", signal: ctl.signal, redirect: "error" });
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
  // Tutarlılık: gerçek kalan plan sınırını aşamaz (aksi hâlde yanlış alan / biçim) → hiçbir şey yazılmaz.
  if (rate.limit !== null && real > rate.limit) return { ok: false, error: "bicim_taninmadi" };
  try {
    const { data, error } = await db.rpc("campaign_observe_usage", {
      p_actor: actorId,
      p_remaining_real: real,
      p_header_remaining: rate.remaining,
      p_quota_limit: rate.limit,
      p_reset_at: rate.resetAt ? rate.resetAt.toISOString() : null,
    });
    if (error || (data as { ok?: unknown } | null)?.ok !== true) return { ok: false, error: "kayit_hatasi" };
    const d = data as { gap?: unknown; gap_status?: unknown; verified_until?: unknown };
    const st = typeof d.gap_status === "string" && (GAP_STATUSES as readonly string[]).includes(d.gap_status) ? (d.gap_status as GapStatus) : null;
    return {
      ok: true,
      remaining: real,
      headerRemaining: rate.remaining,
      quotaLimit: rate.limit,
      gap: typeof d.gap === "number" ? d.gap : null,
      gapStatus: st,
      verifiedUntil: typeof d.verified_until === "string" ? d.verified_until : null,
    };
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

/**
 * B-4 kod kapısı: ücretli kampanya isteği, sertleştirilmiş fark kuralları (migration 20271229000500) veritabanında yoksa
 * REDDEDİLİR. Böylece migration sırası yanlış uygulansa bile 000300'ün 7 günlük fark kabulüyle ücretli çağrı yapılmaz.
 * Yalnız olumlu sonuç kısa süre önbelleğe alınır (migration uygulanınca hemen etkili; geri alınırsa en geç 5 dk).
 */
let gapReadyAt = 0;
export const GAP_READY_TTL_MS = 5 * 60_000;
export async function providerGuardReady(db: Db, now: Date = new Date()): Promise<boolean> {
  if (gapReadyAt && now.getTime() - gapReadyAt < GAP_READY_TTL_MS) return true;
  try {
    // Denetim D-3: yalnız kolon varlığı değil, başlık RPC'sinin GÜNCEL gövdesinin sertleştirilmiş olduğu da doğrulanır.
    const { data, error } = await db.rpc("campaign__gap_policy");
    const pol = data as { valid_hours?: unknown; header_hardened?: unknown } | null;
    if (error || pol?.valid_hours !== 24 || pol?.header_hardened !== true) return false;
    gapReadyAt = now.getTime();
    return true;
  } catch {
    return false;
  }
}
/** YALNIZ testler. */
export function __resetProviderGuardReady(): void {
  gapReadyAt = 0;
}
