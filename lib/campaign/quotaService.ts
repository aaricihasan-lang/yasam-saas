/**
 * KAMPANYA MERKEZİ — kota rezervasyon servisi (YALNIZ SUNUCU; service-role db; public endpoint YOK — KM-3'te bağlanacak).
 *
 * Akış (her ücretli/ücretsiz kampanya analizi):
 *   1) reserve()  → DB tek işlemde tüm sınırları denetler; ok değilse sağlayıcı ÇAĞRILMAZ.
 *   2) sağlayıcı çağrısı yapıldıysa her istek için recordProviderCall() (zaman aşımı dahil).
 *   3) settle()   → completed / cache_hit / aborted_no_call / failed_after_call.
 *   Çökme: settle edilmeyen rezervasyon expireStale() ile "harcandı" sayılır (zamanlayıcı KM-3).
 *
 * FAIL-CLOSED: DB/ağ hatası, beklenmeyen yanıt, gizli anahtar eksikliği, katalogda olmayan teknik → { ok:false } ve
 * çağıran sağlayıcıyı çağırmamalıdır. Bu modül hiçbir koşulda "izin ver" varsayılanına düşmez.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { getCatalogEntry, isSelectable } from "./catalog";
import { normalizeIp, subjectHash, subjectSecret, turkeyDay } from "./subject";

assertServerOnly("lib/campaign/quotaService");

export type DenyReason =
  | "gecersiz_istek"
  | "kampanya_kapali"
  | "teknik_kapali"
  | "genel_kontenjan_doldu"
  | "genel_kredi_doldu"
  | "saglayici_kotasi_tanimsiz"
  | "saglayici_durumu_bilinmiyor"
  | "saglayici_bekleme"
  | "aylik_kampanya_payi_doldu"
  | "uzman_payi_korunuyor"
  | "saglayici_dakika_siniri"
  | "teknik_kontenjan_doldu"
  | "teknik_kredi_doldu"
  | "ip_hakki_doldu"
  | "tarayici_hakki_doldu"
  | "idempotency_cakismasi"
  | "onceki_istek_sonlandi"
  | "katalogda_yok"
  | "gizli_anahtar_yok"
  | "altyapi_hatasi";

export type ReserveOk = { ok: true; reservationId: string; maxCredits: number; replay: boolean; dayTr: string; commentsEnabled: boolean };
export type ReserveResult = ReserveOk | { ok: false; reason: DenyReason };
export type SettleOutcome = "completed" | "cache_hit" | "aborted_no_call" | "failed_after_call";

type Rpc = Pick<SupabaseClient, "rpc">;

/** Yeni idempotency anahtarı (istek başına bir kez üretilip yeniden denemelerde AYNEN kullanılmalı). */
export function newIdempotencyKey(): string {
  return randomBytes(24).toString("base64url");
}

async function callRpc(db: Rpc, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function reserve(
  db: Rpc,
  input: { idempotencyKey: string; techniqueKey: string; ip: string | null | undefined; browserId?: string | null; now?: Date },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReserveResult> {
  const entry = getCatalogEntry(input.techniqueKey);
  if (!entry || !isSelectable(entry)) return { ok: false, reason: "katalogda_yok" };
  const secret = subjectSecret(env);
  if (!secret) return { ok: false, reason: "gizli_anahtar_yok" };
  const now = input.now ?? new Date();
  const day = turkeyDay(now);
  const ipHash = subjectHash("ip", normalizeIp(input.ip), day, secret);
  const browser = String(input.browserId ?? "").trim();
  const browserHash = browser ? subjectHash("browser", browser.slice(0, 200), day, secret) : null;
  const data = await callRpc(db, "campaign_reserve", {
    p_idempotency_key: input.idempotencyKey,
    p_technique_key: input.techniqueKey,
    p_ip_hash: ipHash,
    p_browser_hash: browserHash,
    p_now: input.now ? input.now.toISOString() : null,
  });
  if (!data) return { ok: false, reason: "altyapi_hatasi" };
  if (data.ok === true && typeof data.reservation_id === "string") {
    return {
      ok: true,
      reservationId: data.reservation_id,
      maxCredits: Number(data.max_credits ?? 0),
      replay: data.replay === true,
      dayTr: String(data.day_tr ?? day),
      commentsEnabled: data.comments_enabled === true,
    };
  }
  const reason = typeof data.reason === "string" ? (data.reason as DenyReason) : "altyapi_hatasi";
  return { ok: false, reason };
}

export async function recordProviderCall(
  db: Rpc,
  input: {
    reservationId: string;
    endpoint: string;
    httpStatus: number | null;
    outcome: "ok" | "timeout" | "network_error" | "http_error" | "rate_limited";
    credits: number;
    remaining?: number | null;
    quotaLimit?: number | null;
    resetAt?: Date | null;
    now?: Date;
  },
): Promise<boolean> {
  const data = await callRpc(db, "campaign_record_provider_call", {
    p_reservation_id: input.reservationId,
    p_provider: "roxy",
    p_endpoint: input.endpoint,
    p_http_status: input.httpStatus,
    p_outcome: input.outcome,
    p_credits: input.credits,
    p_remaining: input.remaining ?? null,
    p_quota_limit: input.quotaLimit ?? null,
    p_reset_at: input.resetAt ? input.resetAt.toISOString() : null,
    p_now: input.now ? input.now.toISOString() : null,
  });
  return data?.ok === true;
}

export async function observeProvider(
  db: Rpc,
  input: { remaining: number | null; quotaLimit?: number | null; resetAt?: Date | null; rateLimited?: boolean; now?: Date },
): Promise<boolean> {
  const data = await callRpc(db, "campaign_observe_provider", {
    p_provider: "roxy",
    p_remaining: input.remaining,
    p_quota_limit: input.quotaLimit ?? null,
    p_reset_at: input.resetAt ? input.resetAt.toISOString() : null,
    p_rate_limited: input.rateLimited === true,
    p_now: input.now ? input.now.toISOString() : null,
  });
  return data?.ok === true;
}

export async function settle(
  db: Rpc,
  input: { reservationId: string; outcome: SettleOutcome; spentCredits?: number | null; now?: Date },
): Promise<{ ok: boolean; state?: string; spentCredits?: number }> {
  const data = await callRpc(db, "campaign_settle", {
    p_reservation_id: input.reservationId,
    p_outcome: input.outcome,
    p_spent_credits: input.spentCredits ?? null,
    p_now: input.now ? input.now.toISOString() : null,
  });
  if (data?.ok !== true) return { ok: false };
  return { ok: true, state: String(data.state ?? ""), spentCredits: Number(data.spent_credits ?? 0) };
}

/** Yarım kalan rezervasyonları kapatır (harcandı sayar). Hata → null (zamanlayıcı yeniden dener). */
export async function expireStale(db: Rpc, opts: { now?: Date; limit?: number } = {}): Promise<number | null> {
  try {
    const { data, error } = await db.rpc("campaign_expire_stale", { p_now: opts.now ? opts.now.toISOString() : null, p_limit: opts.limit ?? 500 });
    if (error || typeof data !== "number") return null;
    return data;
  } catch {
    return null;
  }
}
