/**
 * KAMPANYA MERKEZİ — kota rezervasyon servisi (YALNIZ SUNUCU; service-role db; public endpoint YOK — KM-3'te bağlanacak).
 *
 * Akış (her ücretli/ücretsiz kampanya analizi):
 *   1) reserve()  → DB tek işlemde tüm sınırları denetler; ok değilse sağlayıcı ÇAĞRILMAZ. Aynı istek kimliğiyle tekrar
 *      HİÇBİR koşulda ok dönmez (istek_suruyor / istek_tamamlandi / onceki_istek_sonlandi) → ikinci çağrı yapılamaz.
 *   2) Sağlayıcı YALNIZ ReservationCallGuard.call() ile çağrılır: önce sunucu tarafı azami kredi denetimi, sonra DB izni
 *      (campaign_authorize_call), sonra çağrı, sonra sonuç kaydı (zaman aşımı / ağ hatası / 429 dahil).
 *   3) settle()   → completed / cache_hit / aborted_no_call / failed_after_call (harcama azami krediyle sınırlı).
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
  | "saglayici_kotasi_bilinmiyor"
  | "saglayici_kotasi_uyusmuyor"
  | "saglayici_bekleme"
  | "aylik_kampanya_payi_doldu"
  | "uzman_payi_korunuyor"
  | "saglayici_dakika_siniri"
  | "teknik_kontenjan_doldu"
  | "teknik_kredi_doldu"
  | "ip_hakki_doldu"
  | "tarayici_hakki_doldu"
  | "idempotency_cakismasi"
  | "istek_suruyor"
  | "istek_tamamlandi"
  | "onceki_istek_sonlandi"
  | "katalogda_yok"
  | "gizli_anahtar_yok"
  | "altyapi_hatasi";

/** Yalnız YENİ rezervasyon ok:true döner; commentsEnabled = modül ana anahtarı VE teknik anahtarı (DB'de hesaplanır). */
export type ReserveOk = { ok: true; reservationId: string; maxCredits: number; dayTr: string; commentsEnabled: boolean };
/** Tekrar (replay) her zaman ok:false; state: reserved (süren) / completed / released / expired. */
export type ReserveDenied = { ok: false; reason: DenyReason; replay?: true; state?: string; reservationId?: string };
export type ReserveResult = ReserveOk | ReserveDenied;
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
  // Tekrar yanıtı DB'de zaten ok:false'tur; yine de savunma amaçlı replay=true asla izin sayılmaz.
  if (data.ok === true && data.replay !== true && typeof data.reservation_id === "string") {
    return {
      ok: true,
      reservationId: data.reservation_id,
      maxCredits: Number(data.max_credits ?? 0),
      dayTr: String(data.day_tr ?? day),
      commentsEnabled: data.comments_enabled === true,
    };
  }
  const reason = typeof data.reason === "string" && data.ok !== true ? (data.reason as DenyReason) : "altyapi_hatasi";
  const denied: ReserveDenied = { ok: false, reason };
  if (data.replay === true) {
    denied.replay = true;
    if (typeof data.state === "string") denied.state = data.state;
    if (typeof data.reservation_id === "string") denied.reservationId = data.reservation_id;
  }
  return denied;
}

export type CallDenyReason =
  | "gecersiz_istek"
  | "rezervasyon_yok"
  | "rezervasyon_kapali"
  | "rezervasyon_suresi_doldu"
  | "sifir_maliyetli_teknik"
  | "kampanya_kapali"
  | "saglayici_bekleme"
  | "rezervasyon_kredi_tavani"
  | "altyapi_hatasi";
export type ProviderOutcome = "ok" | "timeout" | "network_error" | "http_error" | "rate_limited";
export type ProviderResponseMeta = { httpStatus: number; remaining?: number | null; quotaLimit?: number | null; resetAt?: Date | null };

/**
 * Rezervasyon başına sağlayıcı çağrı koruyucusu. Sağlayıcı YALNIZ call() ile çağrılmalıdır:
 *   1) sunucu tarafı denetim: toplam kredi + istenen ≤ rezervasyon azamisi (aşarsa DB'ye bile gidilmez);
 *   2) DB izni (campaign_authorize_call) — rezervasyon açık / süresi dolmamış / kampanya aktif / 429 beklemesi yok / tavan;
 *   3) çağrı; 4) sonuç kaydı (ok / http_error / rate_limited / timeout / network_error). İzin alınmış çağrı sonucu yazılamasa
 *      bile DB'de harcanmış sayılır (fail-closed). İzin yoksa fn ÇALIŞTIRILMAZ.
 */
/** Defter uç etiketi: harf/rakam/_ ile başlar, yol atlama ("..") içermez. DB CHECK ile aynı. */
const ENDPOINT_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/;

export class ReservationCallGuard {
  private used = 0;
  constructor(private readonly db: Rpc, readonly reservationId: string, readonly maxCredits: number) {}

  get usedCredits(): number {
    return this.used;
  }

  async call<T>(
    endpoint: string,
    credits: number,
    fn: () => Promise<{ value: T; meta: ProviderResponseMeta }>,
    opts: { now?: Date } = {},
  ): Promise<{ ok: true; value: T; meta: ProviderResponseMeta } | { ok: false; reason: CallDenyReason | "saglayici_hatasi"; error?: unknown }> {
    if (!Number.isInteger(credits) || credits < 1 || credits > 50 || !ENDPOINT_RE.test(endpoint) || endpoint.includes("..")) return { ok: false, reason: "gecersiz_istek" };
    if (this.used + credits > this.maxCredits) return { ok: false, reason: "rezervasyon_kredi_tavani" };
    // Gece operasyonu (02.11): kredi await ÖNCESİ ayrılır → paralel çağrılar istemci tavanını birlikte geçemez (asıl tavan
    // DB'de: campaign_authorize_call rezervasyon satırını FOR UPDATE kilitler). İzin yoksa ayrılan kredi geri bırakılır.
    this.used += credits;
    const auth = await callRpc(this.db, "campaign_authorize_call", {
      p_reservation_id: this.reservationId,
      p_endpoint: endpoint,
      p_credits: credits,
      p_now: opts.now ? opts.now.toISOString() : null,
    });
    if (!auth || auth.ok !== true || (typeof auth.call_id !== "number" && typeof auth.call_id !== "string")) {
      this.used -= credits;
      if (!auth) return { ok: false, reason: "altyapi_hatasi" };
      return { ok: false, reason: typeof auth.reason === "string" ? (auth.reason as CallDenyReason) : "altyapi_hatasi" };
    }
    const callId = Number(auth.call_id);
    try {
      const res = await fn();
      const s = res.meta.httpStatus;
      const outcome: ProviderOutcome = s === 429 ? "rate_limited" : s >= 200 && s < 300 ? "ok" : "http_error";
      await recordProviderResult(this.db, { callId, httpStatus: s, outcome, remaining: res.meta.remaining, quotaLimit: res.meta.quotaLimit, resetAt: res.meta.resetAt, now: opts.now });
      return { ok: true, value: res.value, meta: res.meta };
    } catch (error) {
      const name = (error as { name?: string } | null)?.name ?? "";
      const outcome: ProviderOutcome = name === "AbortError" || name === "TimeoutError" ? "timeout" : "network_error";
      await recordProviderResult(this.db, { callId, httpStatus: null, outcome, now: opts.now });
      return { ok: false, reason: "saglayici_hatasi", error };
    }
  }
}

/** Yetkilendirilmiş isteğin sonucu (yalnız 'pending' satır bir kez). */
export async function recordProviderResult(
  db: Rpc,
  input: { callId: number; httpStatus: number | null; outcome: ProviderOutcome; remaining?: number | null; quotaLimit?: number | null; resetAt?: Date | null; now?: Date },
): Promise<boolean> {
  const data = await callRpc(db, "campaign_record_provider_call", {
    p_call_id: input.callId,
    p_http_status: input.httpStatus,
    p_outcome: input.outcome,
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
