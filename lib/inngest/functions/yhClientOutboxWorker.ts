import "server-only";

/**
 * PRIVATE MEMORY — Client Outbox Scheduled Worker (server-only transport).
 * ====================================================================
 *
 * Inngest cron worker: public.yasam_hafizasi_client_outbox durum makinesini sürer ve
 * olayları public.yasam_hafizasi_client_index'e taşır. Professional yhOutboxWorker'ın
 * client karşılığı; YALNIZ transport + orkestrasyon (iş kararı clientEventProcessor'da,
 * DB durum kararı yh_client_outbox_* RPC'lerinde). Professional worker DEĞİŞTİRİLMEZ.
 *
 * ÇİFT DORMANT KİLİT:
 *   1) PRODUCTION GATE: yalnız YH_CLIENT_OUTBOX_WORKER_ENABLED === "true" iken DB'ye dokunur;
 *      aksi halde hiçbir DB client/RPC/IO yapmadan `disabled` döner (DEFAULT: kapalı).
 *   2) BF-11E ACTIVATION GATE: her olayda isSourceProcessingActive enjekte edilir; client
 *      kaynakları FUTURE_ONLY_READY/registryEnabled:false → inactive → index YAZILMAZ
 *      (complete no-op). Yani env açık olsa DAHİ activation flip'i olmadan index üretilmez.
 *
 * BAĞLAYICI SABİTLER (professional worker ile aynı reliability): cron 1dk · claim 10 ·
 *   lease 300s · concurrency 1 · retries 0 (retry/dead otoritesi PostgreSQL).
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import { YH_CLIENT_INDEX_SOURCES, type ClientSourceConfig } from "@/lib/yasam-hafizasi/client/clientSources";
import { createClientIndexAdapters, type ClientIndexDbClient } from "@/lib/yasam-hafizasi/client/clientIndexServerAdapters";
import { runClientOutboxBatch } from "@/lib/yasam-hafizasi/client/clientEventProcessor";
import {
  claimClientEvents,
  completeClientEvent,
  failClientEvent,
  sweepExpiredClient,
} from "@/lib/yasam-hafizasi/outbox/clientOutboxRpcClient";
import type { OutboxRpcDb } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import { isSourceProcessingActive } from "@/lib/yasam-hafizasi/activation/activationRuntimeGate";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_SECONDS,
  DEFAULT_MAX_DELAY_SECONDS,
} from "@/lib/yasam-hafizasi/outbox/outboxState";

export const YH_CLIENT_OUTBOX_CRON = "* * * * *";
export const YH_CLIENT_OUTBOX_CLAIM_BATCH = 10;
export const YH_CLIENT_OUTBOX_LEASE_SECONDS = 300;
export const YH_CLIENT_OUTBOX_CONCURRENCY = 1;
export const YH_CLIENT_OUTBOX_RETRIES = 0;
export const YH_CLIENT_OUTBOX_PERMANENT_MAX_ATTEMPTS = 1;
export const YH_CLIENT_OUTBOX_TRANSIENT_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;
export const YH_CLIENT_OUTBOX_ENABLE_FLAG = "YH_CLIENT_OUTBOX_WORKER_ENABLED";

/** Production enable gate — yalnız tam olarak "true" iken DB işlemi yapılır (DEFAULT: kapalı). */
export function isClientOutboxWorkerEnabled(): boolean {
  return process.env[YH_CLIENT_OUTBOX_ENABLE_FLAG] === "true";
}

const CLIENT_CONFIG_BY_KEY: ReadonlyMap<string, ClientSourceConfig> = new Map(
  YH_CLIENT_INDEX_SOURCES.map((s) => [s.sourceKey, s] as const),
);
/** sourceKey → ClientSourceConfig (yoksa null → processor unknown-source). */
export function resolveClientSourceConfig(sourceKey: string): ClientSourceConfig | null {
  return CLIENT_CONFIG_BY_KEY.get(sourceKey) ?? null;
}

export const yhClientOutboxWorkerFunction = inngest.createFunction(
  {
    id: "yh-client-outbox-worker",
    name: "Yaşam Hafızası Client Outbox Worker",
    concurrency: YH_CLIENT_OUTBOX_CONCURRENCY,
    retries: YH_CLIENT_OUTBOX_RETRIES,
    triggers: [{ cron: YH_CLIENT_OUTBOX_CRON }],
  },
  async ({ runId }) => {
    // PRODUCTION GATE 1: kapalıysa hiçbir DB client / RPC / IO yapılmadan çık.
    if (!isClientOutboxWorkerEnabled()) {
      return { status: "disabled" as const };
    }

    const worker = `yh-client-outbox@${runId}`;
    const serverDb = getServerDb();

    // TYPE-SAFE FACADE'lar (UNSAFE CAST'siz; yalnız metot delegasyonu).
    const rpcDb: OutboxRpcDb = {
      async rpc(name, params) {
        const { data, error } = await serverDb.rpc(name, params);
        return { data, error: error === null ? null : { message: error.message } };
      },
    };
    const indexDb: ClientIndexDbClient = {
      select(table, columns) {
        let q = serverDb.from(table).select(columns);
        const builder = {
          eq(column: string, value: unknown) {
            q = q.eq(column, value);
            return builder;
          },
          limit(count: number) {
            q = q.limit(count);
            return builder;
          },
          then<TResult1 = { data: Record<string, unknown>[] | null; error: { message: string } | null }, TResult2 = never>(
            onfulfilled?:
              | ((value: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
              | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ): PromiseLike<TResult1 | TResult2> {
            return Promise.resolve(q)
              .then((res) => ({
                data: (res.data ?? null) as Record<string, unknown>[] | null,
                error: res.error === null ? null : { message: res.error.message },
              }))
              .then(onfulfilled, onrejected);
          },
        };
        return builder;
      },
      async upsert(table, rows, onConflict) {
        const { error } = await serverDb.from(table).upsert(rows as Record<string, unknown>[], { onConflict });
        return { error: error !== null };
      },
      async deleteExact(table, filters) {
        let q = serverDb.from(table).delete({ count: "exact" });
        for (const [column, value] of filters) q = q.eq(column, value);
        const { error, count } = await q;
        return { error: error !== null, count: typeof count === "number" ? count : null };
      },
    };

    const adapters = createClientIndexAdapters(indexDb);

    const batch = await runClientOutboxBatch({
      resolveConfig: resolveClientSourceConfig,
      // BF-11E ACTIVATION GATE (professional ile aynı fonksiyon; client key'leri de kapsar).
      isSourceProcessingActive: (sourceKey) => isSourceProcessingActive(sourceKey, serverDb),
      fetchSourceRow: adapters.fetchSourceRow,
      upsertUnit: adapters.upsertUnit,
      deindex: adapters.deindex,
      worker,
      claimBatch: YH_CLIENT_OUTBOX_CLAIM_BATCH,
      leaseSeconds: YH_CLIENT_OUTBOX_LEASE_SECONDS,
      permanentMaxAttempts: YH_CLIENT_OUTBOX_PERMANENT_MAX_ATTEMPTS,
      transientMaxAttempts: YH_CLIENT_OUTBOX_TRANSIENT_MAX_ATTEMPTS,
      baseDelaySeconds: DEFAULT_BASE_DELAY_SECONDS,
      maxDelaySeconds: DEFAULT_MAX_DELAY_SECONDS,
      sweep: (leaseSeconds, b) => sweepExpiredClient(rpcDb, leaseSeconds, b),
      claim: (w, b) => claimClientEvents(rpcDb, w, b),
      complete: (id, w, v) => completeClientEvent(rpcDb, id, w, v),
      fail: (id, w, v, code, maxAttempts, baseDelay, maxDelay) =>
        failClientEvent(rpcDb, id, w, v, code, maxAttempts, baseDelay, maxDelay),
    });

    const summary =
      batch.claimed === 0
        ? { status: "empty" as const, swept: batch.swept }
        : { status: "processed" as const, ...batch };
    console.info("[yh-client-outbox-worker]", summary);
    return summary;
  },
);
