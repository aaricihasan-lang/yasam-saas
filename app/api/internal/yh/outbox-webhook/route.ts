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
 */

import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import {
  decideWebhookAction,
  type WebhookDecision,
} from "@/lib/yasam-hafizasi/outbox/webhookBridge";
import type { YhOutboxEnqueuedEventData } from "@/lib/inngest/events";

export const runtime = "nodejs";

const SECRET_HEADER = "x-yh-webhook-secret";
const SECRET_RPC = "yh_outbox_webhook_secret_matches";

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
  const matched = await secretMatches(provided);
  if (matched === null) {
    // Vault'ta secret yok / RPC hatası → fail-closed (hiçbir şey işleme). Ham hata loglanmaz.
    console.error("[yh-outbox-webhook] secret doğrulanamadı (yapılandırma/RPC) → 503");
    return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 503 });
  }
  if (!matched) {
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
