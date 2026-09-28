import "server-only";

/**
 * USAGE360 — RETENTION TEMİZLİĞİ (server-only, zamanlanmış).
 *
 * Owner kararı: ham Usage360 olayı 180 gün · usage_visits 180 gün · günlük rollup 25 ay.
 * Silme yalnız public.usage360_retention_purge (SECURITY DEFINER, transaction-lokal retention
 * bağlamı) ile yapılır; append-only olay tablosu normal yoldan silinemez. Eski (AŞAMA 1 öncesi,
 * action IS NULL) olaylara dokunulmaz.
 *
 * PRODUCTION VARSAYILAN KAPALI: `USAGE360_RETENTION_ENABLED === "true"` değilse hiçbir DB/IO
 * yapmadan { status: "disabled" } döner. Nihai canlı açılışta ayrıca etkinleştirilecek.
 * Günde bir off-minute (UTC 04:23) · concurrency 1 · retries 0. Yalnız sayılar loglanır.
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";

export const USAGE360_RETENTION_CRON = "23 4 * * *";
export const USAGE360_RETENTION_ENABLE_FLAG = "USAGE360_RETENTION_ENABLED";

export function isUsage360RetentionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[USAGE360_RETENTION_ENABLE_FLAG] === "true";
}

export const usage360RetentionFunction = inngest.createFunction(
  {
    id: "usage360-retention-purge",
    name: "Usage360 Retention Temizliği",
    concurrency: 1,
    retries: 0,
    triggers: [{ cron: USAGE360_RETENTION_CRON }],
  },
  async () => {
    if (!isUsage360RetentionEnabled()) {
      return { status: "disabled" as const };
    }
    const db = getServerDb();
    const { data, error } = await db.rpc("usage360_retention_purge", { p_dry_run: false });
    if (error) {
      console.error("[usage360-retention] failed", { code: (error as { code?: string }).code ?? null });
      return { status: "error" as const };
    }
    console.info("[usage360-retention]", JSON.stringify({ status: "ok", result: data }));
    return { status: "ok" as const };
  },
);
