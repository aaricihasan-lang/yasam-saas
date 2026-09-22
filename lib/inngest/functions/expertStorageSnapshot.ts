import "server-only";

/**
 * FAZ 1 / İP-5 — GÜNLÜK DEPOLAMA SNAPSHOT (server-only, scheduled).
 * ============================================================================
 *
 * İleriye dönük depolama büyümesi için günde bir, tenant bazlı depolama ölçümünü
 * expert_storage_daily'e upsert eder (expert_storage_snapshot_run RPC). Geçmişe dönük
 * değer ÜRETİLMEZ (yalnız çalıştığı günden itibaren birikir).
 *
 * BAĞLAYICI:
 *   - PRODUCTION VARSAYILAN KAPALI: `EXPERT_STORAGE_SNAPSHOT_ENABLED === "true"` değilse
 *     hiçbir DB/IO yapmadan { status: "disabled" } döner. Yalnız merge/deploy snapshot'ı
 *     ÇALIŞTIRMAZ — etkinleştirme ayrı env + kontrollü onay gerektirir.
 *   - Yeni HER-DAKİKA cron YOK: günde bir off-minute (UTC 03:37).
 *   - concurrency 1 · retries 0 (idempotent upsert; aynı gün tekrar çift kayıt açmaz).
 *   - Sonuç yalnız güvenli aggregate (tenant sayısı) — PII/ham veri LOGLANMAZ.
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";

/** Off-minute günde bir (UTC 03:37). Her dakika DEĞİL. */
export const EXPERT_STORAGE_SNAPSHOT_CRON = "37 3 * * *";
export const EXPERT_STORAGE_SNAPSHOT_CONCURRENCY = 1;
export const EXPERT_STORAGE_SNAPSHOT_RETRIES = 0;
export const EXPERT_STORAGE_SNAPSHOT_ENABLE_FLAG = "EXPERT_STORAGE_SNAPSHOT_ENABLED";

/** Production gate — yalnız tam olarak "true" iken DB'ye dokunur. */
export function isStorageSnapshotEnabled(): boolean {
  return process.env[EXPERT_STORAGE_SNAPSHOT_ENABLE_FLAG] === "true";
}

export const expertStorageSnapshotFunction = inngest.createFunction(
  {
    id: "expert-storage-daily-snapshot",
    name: "Uzman Depolama Günlük Snapshot",
    concurrency: EXPERT_STORAGE_SNAPSHOT_CONCURRENCY,
    retries: EXPERT_STORAGE_SNAPSHOT_RETRIES,
    triggers: [{ cron: EXPERT_STORAGE_SNAPSHOT_CRON }],
  },
  async () => {
    // DEFAULT KAPALI: gate açık değilse hiçbir DB client / IO yapmadan çık.
    if (!isStorageSnapshotEnabled()) {
      return { status: "disabled" as const };
    }

    const db = getServerDb();
    // p_snapshot_date default current_date (RPC içinde). Idempotent upsert.
    const { data, error } = await db.rpc("expert_storage_snapshot_run", {});
    if (error) {
      // PII'siz görünürlük; başarısız ölçüm "başarılı" gibi sunulmaz (satır yazılmaz).
      console.error("[expert-storage-snapshot] failed", { code: (error as { code?: string }).code ?? null });
      return { status: "error" as const };
    }
    const tenantsWritten = typeof data === "number" ? data : Number(data ?? 0);
    console.info("[expert-storage-snapshot]", JSON.stringify({ status: "ok", tenantsWritten }));
    return { status: "ok" as const, tenantsWritten };
  },
);
