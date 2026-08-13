import "server-only";

/**
 * Yaşam Hafızası™ — Outbox Scheduled Worker (BF-11B, server-only transport).
 * ====================================================================
 *
 * Inngest cron worker: BF-11A outbox durum makinesini sürer. YALNIZ transport +
 * orkestrasyon; iş kararları `eventProcessor`'da, DB durum kararı BF-11A RPC'lerinde.
 *
 * BAĞLAYICI AYARLAR:
 *   - cron: her dakika · claim batch: 10 · lease: 300s · concurrency: 1 · retries: 0
 *   - sweep ÖNCE, claim SONRA · seri işleme · boş claim → erken no-op
 *   - retry/dead otoritesi YALNIZ PostgreSQL (Inngest retries=0)
 *   - worker kimliği: `yh-outbox@<runId>`
 *   - PRODUCTION GATE: yalnız YH_OUTBOX_WORKER_ENABLED === "true" iken DB'ye dokunur;
 *     aksi halde getServerDb/sweep/claim/IO YAPILMADAN `disabled` döner.
 *   - Ham source row / DB hata metni / secret / PII LOGLANMAZ (yalnız güvenli sayaç).
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import { resolveYhSourceConfig } from "@/lib/yasam-hafizasi/indexer/adminIndexRequest";
import { indexSourcePage } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import { createSupabaseArchiveEligibilityPort } from "@/lib/yasam-hafizasi/indexer/archiveEligibility";
import {
  createSupabaseIndexDeindexer,
  type IndexDeleteClient,
} from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import {
  claimEvents,
  completeEvent,
  failEvent,
  sweepExpired,
  type OutboxRpcDb,
} from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import { runOutboxBatch } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import { isSourceProcessingActive } from "@/lib/yasam-hafizasi/activation/activationRuntimeGate";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_SECONDS,
  DEFAULT_MAX_DELAY_SECONDS,
} from "@/lib/yasam-hafizasi/outbox/outboxState";

// ─── Bağlayıcı worker sabitleri (workerConfig.ts oluşturulmaz; açık exportlar) ─
export const YH_OUTBOX_CRON = "* * * * *";
export const YH_OUTBOX_CLAIM_BATCH = 10;
export const YH_OUTBOX_LEASE_SECONDS = 300;
export const YH_OUTBOX_CONCURRENCY = 1;
export const YH_OUTBOX_RETRIES = 0;
/** Kalıcı sözleşme hatası → dead kararını RPC versin diye maxAttempts=1. */
export const YH_OUTBOX_PERMANENT_MAX_ATTEMPTS = 1;
/** Geçici hata → BF-11A varsayılan retry sınırı. */
export const YH_OUTBOX_TRANSIENT_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;
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
    triggers: [{ cron: YH_OUTBOX_CRON }],
  },
  async ({ runId }) => {
    // PRODUCTION GATE: kapalıysa hiçbir DB client / RPC / IO yapılmadan çık.
    if (!isOutboxWorkerEnabled()) {
      return { status: "disabled" as const };
    }

    const worker = `yh-outbox@${runId}`;
    const serverDb = getServerDb();

    // TYPE-SAFE FACADE'lar (BF-11B-FIX1): gerçek Supabase client'ı UNSAFE CAST'siz,
    // yalnız metot delegasyonuyla dar arayüzlere uyarlar (runtime davranışı aynı).
    const rpcDb: OutboxRpcDb = {
      async rpc(name, params) {
        const { data, error } = await serverDb.rpc(name, params);
        return { data, error: error === null ? null : { message: error.message } };
      },
    };
    const indexDeleteClient: IndexDeleteClient = {
      async deleteRows({ table, filters, count }) {
        let q = serverDb.from(table).delete({ count });
        // Worker-v2: value === null → IS NULL (SHARED referans satırı deindex'i); aksi eşitlik.
        for (const [column, value] of filters) q = value === null ? q.is(column, null) : q.eq(column, value);
        const { error, count: deleted } = await q;
        return { error: error !== null, count: typeof deleted === "number" ? deleted : null };
      },
    };
    const deindexer = createSupabaseIndexDeindexer(indexDeleteClient);
    // BF-11E ROW-GATE: requiresRowEligibilityGate kaynaklar (Kişisel Arşiv) için zorunlu satır
    // eligibility portu (ayrı classification tablosu + server-türetimli hash). Enjekte edilmezse
    // ilgili kaynakta yazma fail-closed durur (ArchiveEligibilityGateMissingError → transient).
    const archiveEligibility = createSupabaseArchiveEligibilityPort(serverDb);

    // Gerçek RPC/DB geri çağrılarını + exact indexing zincirini enjekte et; pure
    // orkestratör (sweep→claim→seri işle→complete/fail) eventProcessor'dadır.
    // NOT: indexSourcePage `db` verilmezse kendi getServerDb() default'unu kullanır
    // (aynı singleton) → BF-11B kodunda IndexDbClient cast'i gerekmez.
    const batch = await runOutboxBatch({
      resolveConfig: resolveYhSourceConfig,
      // BF-11E RUNTIME ACTIVATION GATE: CONTROLLED kaynak enabled:true olsa dahi DB
      // is_active=true değilse index write NO-OP; grandfathered CANLI kaynaklar için true.
      isSourceProcessingActive: (sourceKey) => isSourceProcessingActive(sourceKey, serverDb),
      runExactUpsert: ({ config, exactSourceId, expectedTenantId }) =>
        indexSourcePage({
          config,
          mode: "write",
          exactSourceId,
          expectedTenantId,
          archiveEligibility,
        }),
      deindex: (input) => deindexer.deindex(input),
      worker,
      claimBatch: YH_OUTBOX_CLAIM_BATCH,
      leaseSeconds: YH_OUTBOX_LEASE_SECONDS,
      permanentMaxAttempts: YH_OUTBOX_PERMANENT_MAX_ATTEMPTS,
      transientMaxAttempts: YH_OUTBOX_TRANSIENT_MAX_ATTEMPTS,
      baseDelaySeconds: DEFAULT_BASE_DELAY_SECONDS,
      maxDelaySeconds: DEFAULT_MAX_DELAY_SECONDS,
      sweep: (leaseSeconds, b) => sweepExpired(rpcDb, leaseSeconds, b),
      claim: (w, b) => claimEvents(rpcDb, w, b),
      complete: (id, w, v) => completeEvent(rpcDb, id, w, v),
      fail: (id, w, v, code, maxAttempts, baseDelay, maxDelay) =>
        failEvent(rpcDb, id, w, v, code, maxAttempts, baseDelay, maxDelay),
    });

    const summary =
      batch.claimed === 0
        ? { status: "empty" as const, swept: batch.swept }
        : { status: "processed" as const, ...batch };
    // Yalnız güvenli sayaç/özet (ham row/PII/secret YOK).
    console.info("[yh-outbox-worker]", summary);
    return summary;
  },
);
