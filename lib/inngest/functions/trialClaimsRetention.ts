import "server-only";

/**
 * TRIAL7 — TEK DENEME HAKKI KAYDI SAKLAMA (server-only, zamanlanmış).
 *
 * Owner kararı (2026-11-07): public.trial_claims satırları oluşturulma tarihinden itibaren 24 ay
 * saklanır; süresi dolanlar AYLIK periyodik imhayla silinir. İş yalnız
 * public.trial_claims_retention_purge (SECURITY DEFINER, süre SABİT 24 ay) çağırır; kullanıcı,
 * danışan ve analiz kayıtlarına dokunmaz.
 *
 * Varsayılan AÇIK (Owner: otomatik imha). Acil durdurma: TRIAL_CLAIMS_RETENTION_DISABLED="true".
 * Her ayın 1'i UTC 03:23 · concurrency 1 · retries 0. Yalnız sayı loglanır (özet değeri loglanmaz).
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";

export const TRIAL_CLAIMS_RETENTION_CRON = "23 3 1 * *";
export const TRIAL_CLAIMS_RETENTION_DISABLE_FLAG = "TRIAL_CLAIMS_RETENTION_DISABLED";

export function isTrialClaimsRetentionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[TRIAL_CLAIMS_RETENTION_DISABLE_FLAG] !== "true";
}

export const trialClaimsRetentionFunction = inngest.createFunction(
  {
    id: "trial-claims-retention-purge",
    name: "Tek deneme hakkı kaydı imhası (24 ay)",
    concurrency: 1,
    retries: 0,
    triggers: [{ cron: TRIAL_CLAIMS_RETENTION_CRON }],
  },
  async () => {
    if (!isTrialClaimsRetentionEnabled()) {
      return { status: "disabled" as const };
    }
    const db = getServerDb();
    const { data, error } = await db.rpc("trial_claims_retention_purge", { p_dry_run: false });
    if (error) {
      console.error("[trial-claims-retention] failed", { code: (error as { code?: string }).code ?? null });
      return { status: "error" as const };
    }
    console.info("[trial-claims-retention]", JSON.stringify({ status: "ok", result: data }));
    return { status: "ok" as const };
  },
);
