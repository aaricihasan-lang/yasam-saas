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
 *     Beklenen değer server-only env YH_OUTBOX_WEBHOOK_SECRET (NEXT_PUBLIC_ DEĞİL).
 *     Karşılaştırma constant-time (crypto.timingSafeEqual). Env yoksa → 503 fail-closed.
 *     Secret yok/yanlış → 401. Secret/ham payload/PII ASLA loglanmaz.
 *   - Karar (tablo/tip + loop-prevention) saf `decideWebhookAction`'dadır; row içeriği
 *     işlenmez. Bilinmeyen tablo/tip/malformed → 4xx (fail-closed).
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { inngest } from "@/lib/inngest/client";
import {
  decideWebhookAction,
  type WebhookDecision,
} from "@/lib/yasam-hafizasi/outbox/webhookBridge";
import type { YhOutboxEnqueuedEventData } from "@/lib/inngest/events";

export const runtime = "nodejs";

const SECRET_ENV = "YH_OUTBOX_WEBHOOK_SECRET";
const SECRET_HEADER = "x-yh-webhook-secret";

/** `Authorization: Bearer <token>` → token (yoksa null). */
function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Constant-time secret doğrulama (uzunluk farkında da timing-safe kısa devre). */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Misconfig → fail-closed (secret tanımsızsa hiçbir şey işleme).
  const expected = process.env[SECRET_ENV];
  if (!expected || expected.length === 0) {
    console.error("[yh-outbox-webhook] secret env tanımsız → 503");
    return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 503 });
  }

  // Auth: secret header veya Bearer.
  const provided =
    request.headers.get(SECRET_HEADER) ?? bearerToken(request.headers.get("authorization"));
  if (!secretMatches(provided, expected)) {
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
