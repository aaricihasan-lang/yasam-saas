import "server-only";

/**
 * Yaşam Hafızası™ — Outbox Webhook Bridge Route (event-driven drain tetikleyicisi).
 * ====================================================================
 *
 * Supabase Database Webhook (public.yasam_hafizasi_outbox /
 * public.yasam_hafizasi_client_outbox INSERT/UPDATE) → BU ROUTE → inngest.send(enqueued).
 * Worker event ile HEMEN uyanır ve queue'yu drain eder. Bu route başarılı DB
 * transaction'ının PARÇASI DEĞİLDİR (best-effort uyandırma); nihai correctness 15dk
 * safety cron'dadır (kaçan/başarısız event → cron recovery).
 *
 * GÜVENLİK:
 *   - YALNIZ POST (GET/PUT/… export edilmez → 405). runtime: nodejs.
 *   - Zorunlu secret: header `x-yh-webhook-secret` VEYA `Authorization: Bearer <secret>`.
 *     WT3.1 (2026-10-08): Beklenen değer Supabase VAULT'tadır (`yh_outbox_webhook_secret`);
 *     uygulama secret'ı HİÇ tutmaz — adayı service_role-only RPC
 *     `yh_outbox_webhook_secret_matches` doğrular (sha256 karşılaştırma, DB içinde).
 *     Eski env YH_OUTBOX_WEBHOOK_SECRET artık OKUNMAZ (rotation sonrası eski değer geçersiz).
 *     Vault yapılandırılmamış / RPC hatası → 503 fail-closed. Secret yok/yanlış → 401.
 *     Secret/ham payload/PII ASLA loglanmaz.
 *   - Karar (tablo/tip + loop-prevention) saf `decideWebhookAction`'dadır; row içeriği
 *     işlenmez. Bilinmeyen tablo/tip/malformed → 4xx (fail-closed).
 *   - YH-03 (AŞAMA 1): Vault RPC'sinden ÖNCE DB'siz ucuz kapılar — aday uzunluk sınırı, IP başına
 *     istek sınırı ve IP başına başarısız doğrulama sınırı (bellek içi; meşru pg_net trafiği için
 *     cömert). Aşımda 429; kayıp yok (olay yalnız "uyan" sinyali, safety cron toparlar).
 *   - YH-01 (AŞAMA 1): ilgili worker kapalıysa (env bayrağı) olay GÖNDERİLMEZ → boş "disabled"
 *     Inngest run'ı oluşmaz.
 */

import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import {
  decideWebhookAction,
  type WebhookDecision,
} from "@/lib/yasam-hafizasi/outbox/webhookBridge";
import type { YhOutboxEnqueuedEventData } from "@/lib/inngest/events";
import { YH_OUTBOX_TABLE } from "@/lib/yasam-hafizasi/outbox/webhookBridge";
import { isOutboxWorkerEnabled } from "@/lib/inngest/functions/yhOutboxWorker";
import { isClientOutboxWorkerEnabled } from "@/lib/inngest/functions/yhClientOutboxWorker";
import { checkRateLimit } from "@/lib/rateLimit";
import { clientIpFromHeaders } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";

const SECRET_HEADER = "x-yh-webhook-secret";
const SECRET_RPC = "yh_outbox_webhook_secret_matches";

/** YH-03: aday secret uzunluk sınırları (DB'ye gitmeden ret). */
const SECRET_MIN_LENGTH = 16;
const SECRET_MAX_LENGTH = 512;
/** YH-03: IP başına istek sınırı (pg_net dalgaları için cömert) ve başarısız doğrulama sınırı. */
const WEBHOOK_IP_LIMIT = 600;
const WEBHOOK_IP_WINDOW_MS = 60_000;
const WEBHOOK_AUTH_FAIL_LIMIT = 20;
const WEBHOOK_AUTH_FAIL_WINDOW_MS = 10 * 60_000;

/** IP başına başarısız doğrulama sayacı (yalnız başarısızlıklar sayılır; bellek içi, instance başına). */
const authFailures = new Map<string, { count: number; resetAt: number }>();
function authFailBlocked(ip: string, now: number): number {
  const e = authFailures.get(ip);
  if (!e || e.resetAt <= now) return 0;
  return e.count >= WEBHOOK_AUTH_FAIL_LIMIT ? Math.ceil((e.resetAt - now) / 1000) : 0;
}
function recordAuthFailure(ip: string, now: number): void {
  const e = authFailures.get(ip);
  if (!e || e.resetAt <= now) authFailures.set(ip, { count: 1, resetAt: now + WEBHOOK_AUTH_FAIL_WINDOW_MS });
  else e.count += 1;
  if (authFailures.size > 10_000) authFailures.clear(); // sınırsız büyüme koruması
}

function tooMany(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { ok: false, reason: "rate-limited" },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)) } },
  );
}

/** `Authorization: Bearer <token>` → token (yoksa null). */
function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Vault doğrulaması: true = eşleşti, false = yanlış, null = yapılandırılmamış/hata (fail-closed). */
async function secretMatches(provided: string): Promise<boolean | null> {
  try {
    const { data, error } = await getServerDb().rpc(SECRET_RPC, { p_candidate: provided });
    if (error) return null;
    return typeof data === "boolean" ? data : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: secret header veya Bearer. Aday yoksa DB'ye gitmeden 401.
  const provided =
    request.headers.get(SECRET_HEADER) ?? bearerToken(request.headers.get("authorization"));
  if (!provided) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  if (provided.length < SECRET_MIN_LENGTH || provided.length > SECRET_MAX_LENGTH) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const ip = clientIpFromHeaders(request.headers);
  const ipHit = checkRateLimit(`yh-webhook-ip:${ip}`, WEBHOOK_IP_LIMIT, WEBHOOK_IP_WINDOW_MS);
  if (!ipHit.allowed) return tooMany(ipHit.retryAfterSeconds);
  // Önceki başarısız doğrulamalar sınırı aştıysa Vault RPC'si hiç çağrılmaz.
  const blockedFor = authFailBlocked(ip, Date.now());
  if (blockedFor > 0) return tooMany(blockedFor);
  const matched = await secretMatches(provided);
  if (matched === null) {
    // Vault'ta secret yok / RPC hatası → fail-closed (hiçbir şey işleme). Ham hata loglanmaz.
    console.error("[yh-outbox-webhook] secret doğrulanamadı (yapılandırma/RPC) → 503");
    return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 503 });
  }
  if (!matched) {
    recordAuthFailure(ip, Date.now());
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  // Payload parse (malformed → 400).
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "malformed-json" }, { status: 400 });
  }

  const decision: WebhookDecision = decideWebhookAction(payload);

  if (decision.kind === "reject") {
    console.info("[yh-outbox-webhook] reddedildi:", decision.reason);
    return NextResponse.json({ ok: false, reason: decision.reason }, { status: decision.status });
  }
  if (decision.kind === "noop") {
    // Worker transition / delete / belirsiz → event ÜRETME (loop koruması).
    console.info("[yh-outbox-webhook] no-op:", decision.reason);
    return NextResponse.json({ ok: true, noop: true, reason: decision.reason });
  }

  // YH-01: ilgili worker kapalıysa olay gönderilmez (worker run'ı zaten "disabled" dönerdi).
  const workerOn = decision.table === YH_OUTBOX_TABLE ? isOutboxWorkerEnabled() : isClientOutboxWorkerEnabled();
  if (!workerOn) {
    return NextResponse.json({ ok: true, noop: true, reason: "worker-disabled" });
  }

  // send: minimum payload ("uyan ve queue'yu kontrol et"). PII/row/secret YOK.
  const data: YhOutboxEnqueuedEventData = { source: "supabase-webhook" };
  try {
    await inngest.send({ name: decision.event, data });
  } catch {
    // inngest.send başarısız → 502. Correctness webhook retry'a bağlı DEĞİL: safety cron
    // ≤15dk içinde pending queue'yu toparlar. Ham hata/secret loglanmaz.
    console.error("[yh-outbox-webhook] inngest.send başarısız:", decision.table);
    return NextResponse.json({ ok: false, reason: "dispatch-failed" }, { status: 502 });
  }

  console.info("[yh-outbox-webhook] event gönderildi:", decision.table, decision.reason);
  return NextResponse.json({ ok: true });
}
