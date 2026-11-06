/**
 * TRIAL7 — 7 günlük deneme uzmanı için GERÇEK Roxy kredi ölçümü (günlük 50 ortak kredi:
 * Gökyüzü Atlası + Human Design + Numeroloji; kişiye özel toplam / modül limitleri).
 *
 * Model (kampanya guardedFetch ile aynı ilke: "1 HTTP isteği = 1 kredi"):
 *   - Roxy istemcilerinin VARSAYILAN fetch'i `trialMeteredFetch`'tir. İstek bağlamında (AsyncLocalStorage)
 *     deneme sayacı YOKSA çağrı düz fetch'tir → Premium / admin / demo / kampanya / yönetici araçları için
 *     davranış BİREBİR aynıdır.
 *   - Sayaç VARSA her GERÇEK HTTP isteğinden ÖNCE DB'de atomik rezervasyon (trial_credit_reserve; kullanıcı
 *     satırı FOR UPDATE → eşzamanlı çağrılar limiti aşamaz). Rezervasyon reddi → istek ATILMAZ.
 *   - Önbellek isabeti HTTP isteği üretmez → kredi düşmez. Tek-uçuş (single-flight) bekleyen eş
 *     istekler ücret ödemez; yalnız isteği fiilen atan bağlam öder.
 *   - Yeniden deneme ayrı HTTP isteğidir → ayrı rezervasyon (limit doluysa yeniden deneme yapılmaz).
 *   - Kapanış: yanıt alındı (2xx/4xx, 429 hariç) → charged; 429 veya 5xx (sağlayıcı işlemedi) →
 *     refunded; ağ hatası / zaman aşımı → charged (istek sağlayıcıya ulaşmış olabilir; temkinli).
 *   - Sistem geneli günlük bütçe YOKTUR (Owner kararı).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import {
  isTrialRestrictedRow,
  TRIAL_CREDIT_LIMIT_CODE,
  TRIAL_MESSAGES,
  trialDenial,
  type TrialCreditModule,
  type TrialPhase,
} from "@/lib/trial/trialCore";

assertServerOnly("lib/trial/roxyMeter");

type MeterDenial = { reason: string };

type MeterContext = {
  module: TrialCreditModule;
  label: string;
  /** Kimlik kapısı (verifyUserRequest) doğruladıktan sonra bağlanır; yalnız deneme uzmanında true. */
  metered: boolean;
  db: Pick<SupabaseClient, "rpc"> | null;
  userId: string | null;
  denial: MeterDenial | null;
  charged: number;
};

const meterStore = new AsyncLocalStorage<MeterContext>();

export class TrialCreditDeniedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Deneme Roxy kredisi reddedildi (${reason})`);
    this.name = "TrialCreditDeniedError";
    this.reason = reason;
  }
}

type FetchInput = string | URL | Request;

/** Roxy istemcilerinin varsayılan fetch'i. Bağlam yoksa düz fetch (davranış değişmez). */
export async function trialMeteredFetch(input: FetchInput, init?: RequestInit): Promise<Response> {
  const ctx = meterStore.getStore();
  if (!ctx || !ctx.metered || !ctx.db || !ctx.userId) return fetch(input, init);
  const db = ctx.db;
  const userId = ctx.userId;

  let reservationId: number | null = null;
  try {
    const { data, error } = await db.rpc("trial_credit_reserve", {
      p_user_id: userId,
      p_module: ctx.module,
      p_label: ctx.label,
    });
    if (error || !data || typeof data !== "object") throw new Error("reserve-failed");
    const d = data as Record<string, unknown>;
    if (d.ok !== true) {
      const reason = typeof d.reason === "string" ? d.reason : "denied";
      ctx.denial = { reason };
      throw new TrialCreditDeniedError(reason);
    }
    if (d.metered !== true) return fetch(input, init);
    reservationId = Number(d.reservation_id);
    if (!Number.isFinite(reservationId)) throw new Error("reserve-failed");
  } catch (e) {
    if (e instanceof TrialCreditDeniedError) throw e;
    // Fail-closed: kredi defterine yazılamıyorsa ücretli istek ATILMAZ.
    ctx.denial = { reason: "unavailable" };
    throw new TrialCreditDeniedError("unavailable");
  }

  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e) {
    await settle(db, ctx, reservationId, true, null);
    throw e;
  }
  const charged = !(res.status === 429 || res.status >= 500);
  await settle(db, ctx, reservationId, charged, res.status);
  return res;
}

async function settle(
  db: Pick<SupabaseClient, "rpc">,
  ctx: MeterContext,
  id: number,
  charged: boolean,
  status: number | null,
): Promise<void> {
  if (charged) ctx.charged += 1;
  try {
    await db.rpc("trial_credit_settle", { p_reservation_id: id, p_charged: charged, p_http_status: status });
  } catch {
    // Kapanış yazılamazsa rezervasyon 'reserved' kalır ve günlük sayımda TÜKETİLMİŞ sayılır (temkinli).
  }
}

function denialResponse(reason: string): NextResponse {
  if (reason === "daily_limit" || reason === "module_limit") {
    return NextResponse.json(
      {
        code: TRIAL_CREDIT_LIMIT_CODE,
        error: reason === "module_limit" ? TRIAL_MESSAGES.creditModule : TRIAL_MESSAGES.creditDaily,
      },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  const phase: TrialPhase =
    reason === "trial_expired" ? "expired" : reason === "trial_suspended" ? "suspended" : reason === "trial_review" ? "review" : "not_started";
  if (reason === "unavailable") {
    return NextResponse.json(
      { code: "TRIAL_CREDIT_UNAVAILABLE", error: "Kredi durumu doğrulanamadı. Lütfen biraz sonra tekrar deneyin." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const d = trialDenial(phase);
  return NextResponse.json({ code: d.code, error: d.message }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

/**
 * Kimlik kapısı (verifyUserRequest, includeProfile) DOĞRULADIĞI kullanıcıyı açık sayaç bağlamına
 * bağlar. Bağlam yoksa (Roxy çağırmayan uçlar) etkisizdir. Yalnız deneme uzmanında (Pro'ya geçmemiş)
 * ölçüm açılır; Premium / admin / demo için bağlam ölçümsüz kalır.
 */
export function bindTrialMeterIdentity(
  db: Pick<SupabaseClient, "rpc">,
  userId: string,
  profile: Record<string, unknown> | undefined,
): void {
  const ctx = meterStore.getStore();
  if (!ctx) return;
  ctx.db = db;
  ctx.userId = userId;
  ctx.metered = !!profile && isTrialRestrictedRow(profile);
}

/**
 * Roxy çağırabilen bir uç işleyicisini deneme kredi sayacı bağlamında çalıştırır. Bağlam kimliği
 * işleyicinin kendi kimlik kapısında bağlanır (bindTrialMeterIdentity). Deneme rejimi dışı
 * kullanıcıda bağlam ölçümsüzdür → davranış AYNI. İşleyici sırasında bir rezervasyon reddedildiyse
 * yanıt anlaşılır kredi/deneme mesajıyla değiştirilir (başarılı JSON yanıtta kısmi sonuç korunur ve
 * `trialCreditLimit` alanı eklenir).
 */
export function withTrialRoxyMeter<A extends unknown[]>(
  module: TrialCreditModule,
  label: string,
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const ctx: MeterContext = { module, label, metered: false, db: null, userId: null, denial: null, charged: 0 };
    const res = await meterStore.run(ctx, () => handler(...args));
    if (!ctx.denial) return res;
    if (!res.ok) return denialResponse(ctx.denial.reason);
    // Kısmi başarı (ör. çok birimli Atlas çalıştırması): sonuç korunur, kredi bilgisi eklenir.
    try {
      const body = (await res.clone().json()) as unknown;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const denial = (await denialResponse(ctx.denial.reason).json()) as { code: string; error: string };
        return NextResponse.json(
          { ...(body as Record<string, unknown>), trialCreditLimit: denial },
          { status: res.status, headers: res.headers },
        );
      }
    } catch {
      /* JSON olmayan yanıt → olduğu gibi */
    }
    return res;
  };
}

/** Test/izleme: ölçümlü bağlam içinde mi? */
export function isTrialMeterActive(): boolean {
  return meterStore.getStore()?.metered === true;
}
