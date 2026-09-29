import "server-only";

/**
 * GÜVENLİK — HAM IP RETENTION (server-only, zamanlanmış).
 *
 * Owner kararı (Usage360 nihai kapanış): user_sessions / security_events satırlarında
 * 90 günden eski ham IP → NULL. Satırlar ve diğer güvenlik alanları korunur.
 * İş yalnız public.security_ip_retention_purge (SECURITY DEFINER, süre SABİT 90 gün) çağırır.
 *
 * PRODUCTION VARSAYILAN KAPALI: `SECURITY_IP_RETENTION_ENABLED === "true"` değilse hiçbir
 * DB/IO yapmadan { status: "disabled" } döner. Günde bir off-minute (UTC 04:41) ·
 * concurrency 1 · retries 0. Yalnız sayılar loglanır (IP değeri hiçbir koşulda loglanmaz).
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";

export const SECURITY_IP_RETENTION_CRON = "41 4 * * *";
export const SECURITY_IP_RETENTION_ENABLE_FLAG = "SECURITY_IP_RETENTION_ENABLED";

export function isSecurityIpRetentionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[SECURITY_IP_RETENTION_ENABLE_FLAG] === "true";
}

export const securityIpRetentionFunction = inngest.createFunction(
  {
    id: "security-ip-retention-purge",
    name: "Güvenlik IP Retention (90 gün)",
    concurrency: 1,
    retries: 0,
    triggers: [{ cron: SECURITY_IP_RETENTION_CRON }],
  },
  async () => {
    if (!isSecurityIpRetentionEnabled()) {
      return { status: "disabled" as const };
    }
    const db = getServerDb();
    const { data, error } = await db.rpc("security_ip_retention_purge", { p_dry_run: false });
    if (error) {
      console.error("[security-ip-retention] failed", { code: (error as { code?: string }).code ?? null });
      return { status: "error" as const };
    }
    console.info("[security-ip-retention]", JSON.stringify({ status: "ok", result: data }));
    return { status: "ok" as const };
  },
);
