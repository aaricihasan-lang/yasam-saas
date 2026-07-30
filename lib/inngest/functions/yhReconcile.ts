import "server-only";

/**
 * Yaşam Hafızası™ — Reconciliation Dry-Run Scheduled Function (BF-11D3, server-only).
 * ============================================================================
 *
 * YALNIZ DRY-RUN. Bu fonksiyon HİÇBİR yazma yapmaz: reconcile core'a yalnız read-only
 * port'lar enjekte edilir; outbox/index/source mutation, RPC (claim/complete/fail/
 * sweep), enqueue veya apply YOKTUR.
 *
 * BAĞLAYICI:
 *   - DEFAULT KAPALI: `YH_RECONCILE_ENABLED === "true"` değilse hiçbir DB/IO yapmadan
 *     `{ status: "disabled" }` döner (worker gate deseniyle aynı).
 *   - Pilot yalnız `dogaltas:stones` (fail-closed allowlist).
 *   - concurrency 1 · retries 0 (dry-run; DB durum otoritesi yok).
 *   - Seyrek cron: repo/roadmap'te cadence tanımlı olmadığından off-minute günde bir
 *     (UTC 04:17) seçildi. Her dakika ÇALIŞMAZ. Production env bu pakette değiştirilmez.
 *   - Sonuç yalnız GÜVENLİ aggregate/health (ham row / sample / PII LOGLANMAZ).
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import { resolveYhSourceConfig } from "@/lib/yasam-hafizasi/indexer/adminIndexRequest";
import { YH_OUTBOX_LEASE_SECONDS } from "@/lib/inngest/functions/yhOutboxWorker";
import {
  createReconcilePorts,
  runReconcileDryRun,
} from "@/lib/yasam-hafizasi/reconcile/reconcileEntry";
import type { ReadDbClient } from "@/lib/yasam-hafizasi/reconcile/indexScanAdapter";
import { RECON_PILOT_SOURCE_KEY } from "@/lib/yasam-hafizasi/reconcile/types";

// ─── Bağlayıcı sabitler ───────────────────────────────────────────────────────
/** Off-minute günde bir (UTC 04:17). Her dakika DEĞİL. */
export const YH_RECONCILE_CRON = "17 4 * * *";
export const YH_RECONCILE_CONCURRENCY = 1;
export const YH_RECONCILE_RETRIES = 0;
export const YH_RECONCILE_ENABLE_FLAG = "YH_RECONCILE_ENABLED";

/** Production gate — yalnız tam olarak "true" iken DB'ye (read-only) dokunur. */
export function isReconcileEnabled(): boolean {
  return process.env[YH_RECONCILE_ENABLE_FLAG] === "true";
}

export const yhReconcileFunction = inngest.createFunction(
  {
    id: "yh-reconcile-dryrun",
    name: "Yaşam Hafızası Reconciliation (Dry-Run)",
    concurrency: YH_RECONCILE_CONCURRENCY,
    retries: YH_RECONCILE_RETRIES,
    triggers: [{ cron: YH_RECONCILE_CRON }],
  },
  async () => {
    // DEFAULT KAPALI: gate açık değilse hiçbir DB client / IO yapmadan çık.
    if (!isReconcileEnabled()) {
      return { status: "disabled" as const };
    }

    const config = resolveYhSourceConfig(RECON_PILOT_SOURCE_KEY);
    if (config === null) {
      return { status: "config-missing" as const };
    }

    const db = getServerDb() as unknown as ReadDbClient;
    const ports = createReconcilePorts(db, config);

    const result = await runReconcileDryRun({
      config,
      source: ports.source,
      index: ports.index,
      indexLookup: ports.indexLookup,
      sourceExists: ports.sourceExists,
      outboxHealth: ports.outboxHealth,
      nowMs: Date.now(),
      leaseSeconds: YH_OUTBOX_LEASE_SECONDS,
    });

    // Yalnız güvenli aggregate/health (ham sample/PII YOK).
    const summary = {
      status: "ok" as const,
      sourceScanned: result.sourceToIndex.scannedRows,
      indexScanned: result.indexToSource.scannedRows,
      combined: result.combined,
      recovery: result.recovery,
      stoppedByCap:
        result.sourceToIndex.stoppedByCap || result.indexToSource.stoppedByCap,
    };
    console.info("[yh-reconcile-dryrun]", JSON.stringify(summary));
    return summary;
  },
);
