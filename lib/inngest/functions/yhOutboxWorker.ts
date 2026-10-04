import "server-only";

/**
 * Yaşam Hafızası™ — Outbox Scheduled Worker (BF-11B, server-only transport).
 * ====================================================================
 *
 * Inngest cron worker: BF-11A outbox durum makinesini sürer. YALNIZ transport +
 * orkestrasyon; iş kararları `eventProcessor`'da, DB durum kararı BF-11A RPC'lerinde.
 *
 * TETİKLEME (EVENT-DRIVEN + SAFETY CRON):
 *   - EVENT: DB outbox enqueue → güvenli webhook bridge → inngest.send(
 *     YH_OUTBOX_ENQUEUED_EVENT) → worker HEMEN uyanır (near-real-time drain).
 *   - SAFETY CRON: 15 dakikada bir (YH_OUTBOX_SAFETY_CRON) — kaçan event / başarısız
 *     inngest.send / stale processing lease / orphan pending için garantili recovery
 *     (correctness event'e TEK BAŞINA bağlı DEĞİL; nihai kurtarma cron'dadır).
 *   - Eski her-dakika polling KALDIRILDI (Inngest run tabanı ~86.4K→~5.8K/ay).
 *
 * BAĞLAYICI AYARLAR (İŞLEME SEMANTİĞİ DEĞİŞMEDİ):
 *   - claim batch: 10 · lease: 300s · concurrency: 1 · retries: 0
 *   - sweep ÖNCE, claim SONRA · seri işleme · boş claim → erken no-op
 *   - retry/dead otoritesi YALNIZ PostgreSQL (Inngest retries=0)
 *   - worker kimliği: `yh-outbox@<runId>` · triggerSource yalnız gözlemlenebilirlik için
 *   - PRODUCTION GATE: yalnız YH_OUTBOX_WORKER_ENABLED === "true" iken DB'ye dokunur;
 *     aksi halde getServerDb/sweep/claim/IO YAPILMADAN `disabled` döner.
 *   - Ham source row / DB hata metni / secret / PII LOGLANMAZ (yalnız güvenli sayaç).
 */

import { inngest } from "@/lib/inngest/client";
import { YH_OUTBOX_ENQUEUED_EVENT } from "@/lib/inngest/events";
import { getServerDb } from "@/lib/supabase-server";
import { runOutboxBatch } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import {
  createProfessionalOutboxBatchDeps,
  YH_OUTBOX_LEASE_SECONDS as RUNTIME_LEASE_SECONDS,
  YH_OUTBOX_PERMANENT_MAX_ATTEMPTS as RUNTIME_PERMANENT_MAX_ATTEMPTS,
  YH_OUTBOX_TRANSIENT_MAX_ATTEMPTS as RUNTIME_TRANSIENT_MAX_ATTEMPTS,
} from "@/lib/yasam-hafizasi/outbox/professionalOutboxRuntime";

// ─── Bağlayıcı worker sabitleri (workerConfig.ts oluşturulmaz; açık exportlar) ─
/** Kaçan event / stale lease / orphan pending için 15 dakikalık safety cron (her dakika DEĞİL). */
export const YH_OUTBOX_SAFETY_CRON = "*/15 * * * *";
/** Event-driven uyanma sinyali (webhook bridge → inngest.send). */
export const YH_OUTBOX_EVENT_NAME = YH_OUTBOX_ENQUEUED_EVENT;
export const YH_OUTBOX_CLAIM_BATCH = 10;
export const YH_OUTBOX_LEASE_SECONDS = RUNTIME_LEASE_SECONDS;
export const YH_OUTBOX_CONCURRENCY = 1;
export const YH_OUTBOX_RETRIES = 0;
/** Kalıcı sözleşme hatası → dead kararını RPC versin diye maxAttempts=1. */
export const YH_OUTBOX_PERMANENT_MAX_ATTEMPTS = RUNTIME_PERMANENT_MAX_ATTEMPTS;
/** Geçici hata → BF-11A varsayılan retry sınırı. */
export const YH_OUTBOX_TRANSIENT_MAX_ATTEMPTS = RUNTIME_TRANSIENT_MAX_ATTEMPTS;
export const YH_OUTBOX_ENABLE_FLAG = "YH_OUTBOX_WORKER_ENABLED";

/** Production enable gate — yalnız tam olarak "true" iken DB işlemi yapılır. */
export function isOutboxWorkerEnabled(): boolean {
  return process.env[YH_OUTBOX_ENABLE_FLAG] === "true";
}

export const yhOutboxWorkerFunction = inngest.createFunction(
  {
    id: "yh-outbox-worker",
    name: "Yaşam Hafızası Outbox Worker",
    concurrency: YH_OUTBOX_CONCURRENCY,
    retries: YH_OUTBOX_RETRIES,
    // EVENT-DRIVEN (primary) + SAFETY CRON (recovery). Aynı işleme gövdesi iki
    // tetikleyiciyle çalışır; batch/concurrency/retry semantiği trigger'dan bağımsızdır.
    triggers: [{ event: YH_OUTBOX_EVENT_NAME }, { cron: YH_OUTBOX_SAFETY_CRON }],
  },
  async ({ runId, event }) => {
    // Gözlemlenebilirlik: bu run event ile mi safety cron ile mi tetiklendi (davranışı DEĞİŞTİRMEZ).
    const triggerSource: "event" | "safety-cron" =
      event?.name === YH_OUTBOX_EVENT_NAME ? "event" : "safety-cron";

    // PRODUCTION GATE: kapalıysa hiçbir DB client / RPC / IO yapılmadan çık.
    if (!isOutboxWorkerEnabled()) {
      return { status: "disabled" as const, triggerSource };
    }

    const worker = `yh-outbox@${runId}`;
    // Gerçek RPC/DB geri çağrıları + exact indexing zinciri (ORTAK: admin replay drain de kullanır);
    // pure orkestratör (sweep→claim→seri işle→complete/fail) eventProcessor'dadır.
    const batch = await runOutboxBatch(
      createProfessionalOutboxBatchDeps(getServerDb(), worker, YH_OUTBOX_CLAIM_BATCH),
    );

    const summary =
      batch.claimed === 0
        ? { status: "empty" as const, triggerSource, swept: batch.swept }
        : { status: "processed" as const, triggerSource, ...batch };
    // Yalnız güvenli sayaç/özet (ham row/PII/secret YOK).
    console.info("[yh-outbox-worker]", summary);
    return summary;
  },
);
