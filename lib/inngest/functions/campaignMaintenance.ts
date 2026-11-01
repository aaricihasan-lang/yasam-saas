import "server-only";

/**
 * KAMPANYA MERKEZİ KM-3 — kota bakımı (server-only, zamanlanmış). Her 10 dakikada (UTC :07, :17 …):
 *   1) campaign_expire_stale  : süresi dolmuş, sonuçlandırılmamış rezervasyonları "harcandı" sayarak kapatır (fail-closed);
 *   2) uzman Klasik Numeroloji defterinden sağlayıcı tazeliği (salt okuma; kayıtlı fark yoksa hiçbir şey yazılmaz);
 *   3) her çalıştırmada (önceden günde bir; denetim O-2) campaign_purge_subjects(30): 30 günden eski IP/tarayıcı HMAC sayaçlarını siler (ham IP zaten yok);
 *      ayrıca campaign_purge_event_subjects(90): 90 günden eski onaylı tekil ziyaret özetlerini siler (gece operasyonu, migration
 *      000400; fonksiyon yoksa hata yalnız sonuçta "error" olarak döner, diğer adımlar etkilenmez). Toplu sayaçlar silinmez.
 * PRODUCTION VARSAYILAN KAPALI: CAMPAIGN_MAINTENANCE_ENABLED === "true" değilse DB'ye dokunmadan { status: "disabled" }.
 * Yalnız sayılar loglanır.
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import { expireStale } from "@/lib/campaign/quotaService";
import { syncFromClassicLedger } from "@/lib/campaign/visitor/providerUsage";

export const CAMPAIGN_MAINTENANCE_CRON = "7-59/10 * * * *";
export const CAMPAIGN_MAINTENANCE_ENABLE_FLAG = "CAMPAIGN_MAINTENANCE_ENABLED";
export const CAMPAIGN_SUBJECT_RETENTION_DAYS = 30;
export const CAMPAIGN_EVENT_SUBJECT_RETENTION_DAYS = 90;

export function isCampaignMaintenanceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[CAMPAIGN_MAINTENANCE_ENABLE_FLAG] === "true";
}

export async function runCampaignMaintenance(db: ReturnType<typeof getServerDb>, now: Date = new Date()) {
  const expired = await expireStale(db, { now });
  const synced = await syncFromClassicLedger(db, now);
  let purged: unknown = null;
  let purgedEvents: unknown = null;
  // Denetim O-2: temizlik her çalıştırmada (idempotent, ucuz) — tek bir gece çalıştırması kaçsa da saklama süresi aşılmaz.
  {
    const { data, error } = await db.rpc("campaign_purge_subjects", { p_keep_days: CAMPAIGN_SUBJECT_RETENTION_DAYS, p_now: null });
    purged = error ? "error" : data;
    try {
      const ev = await db.rpc("campaign_purge_event_subjects", { p_keep_days: CAMPAIGN_EVENT_SUBJECT_RETENTION_DAYS, p_now: null });
      purgedEvents = ev.error ? "error" : ev.data;
    } catch {
      purgedEvents = "error";
    }
  }
  return { expired, synced, purged, purgedEvents };
}

export const campaignMaintenanceFunction = inngest.createFunction(
  {
    id: "campaign-maintenance",
    name: "Kampanya Merkezi kota bakımı",
    concurrency: 1,
    retries: 0,
    triggers: [{ cron: CAMPAIGN_MAINTENANCE_CRON }],
  },
  async () => {
    if (!isCampaignMaintenanceEnabled()) return { status: "disabled" as const };
    const r = await runCampaignMaintenance(getServerDb());
    console.info("[campaign-maintenance]", JSON.stringify(r));
    return { status: "ok" as const, ...r };
  },
);
