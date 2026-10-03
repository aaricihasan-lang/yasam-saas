import "server-only";

/**
 * Yaşam Hafızası™ — Mesleki outbox işleme çalışma zamanı (server-only, ORTAK).
 * ====================================================================
 *
 * Inngest worker (`yhOutboxWorker`) ve admin replay DRAIN aynı zinciri kullanır: gerçek RPC
 * geri çağrıları (sweep/claim/complete/fail) + exact indexing + deindex + aktivasyon kapısı +
 * Kişisel Arşiv satır kapısı. İş kararları `eventProcessor`'da, durum makinesi PostgreSQL'de.
 *
 * DRAIN: süre bütçeli orkestratör saf modülde (`outboxDrain.ts`); bu dosya yalnız gerçek bağımlılıkları kurar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
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
import type { OutboxBatchDeps } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import { isSourceProcessingActive } from "@/lib/yasam-hafizasi/activation/activationRuntimeGate";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_SECONDS,
  DEFAULT_MAX_DELAY_SECONDS,
} from "@/lib/yasam-hafizasi/outbox/outboxState";

export const YH_OUTBOX_LEASE_SECONDS = 300;
/** Kalıcı sözleşme hatası → dead kararını RPC versin diye maxAttempts=1. */
export const YH_OUTBOX_PERMANENT_MAX_ATTEMPTS = 1;
/** Geçici hata → BF-11A varsayılan retry sınırı. */
export const YH_OUTBOX_TRANSIENT_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;

/** Gerçek Supabase client'ından batch bağımlılıkları (UNSAFE CAST yok; metot delegasyonu). */
export function createProfessionalOutboxBatchDeps(
  serverDb: SupabaseClient,
  worker: string,
  claimBatch: number,
): OutboxBatchDeps {
  const rpcDb: OutboxRpcDb = {
    async rpc(name, params) {
      const { data, error, status } = await serverDb.rpc(name, params);
      return { data, error: error === null ? null : { message: error.message, code: error.code }, status };
    },
  };
  const indexDeleteClient: IndexDeleteClient = {
    async deleteRows({ table, filters, count }) {
      let q = serverDb.from(table).delete({ count });
      for (const [column, value] of filters) q = value === null ? q.is(column, null) : q.eq(column, value);
      const { error, count: deleted } = await q;
      return { error: error !== null, count: typeof deleted === "number" ? deleted : null };
    },
  };
  const deindexer = createSupabaseIndexDeindexer(indexDeleteClient);
  const archiveEligibility = createSupabaseArchiveEligibilityPort(serverDb);

  return {
    resolveConfig: resolveYhSourceConfig,
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
    claimBatch,
    leaseSeconds: YH_OUTBOX_LEASE_SECONDS,
    permanentMaxAttempts: YH_OUTBOX_PERMANENT_MAX_ATTEMPTS,
    transientMaxAttempts: YH_OUTBOX_TRANSIENT_MAX_ATTEMPTS,
    baseDelaySeconds: DEFAULT_BASE_DELAY_SECONDS,
    maxDelaySeconds: DEFAULT_MAX_DELAY_SECONDS,
    sweep: (leaseSeconds, b) => sweepExpired(rpcDb, leaseSeconds, b),
    claim: (w, b) => claimEvents(rpcDb, w, b),
    complete: (id, w, v, outcome) => completeEvent(rpcDb, id, w, v, outcome),
    fail: (id, w, v, code, maxAttempts, baseDelay, maxDelay) =>
      failEvent(rpcDb, id, w, v, code, maxAttempts, baseDelay, maxDelay),
  };
}
