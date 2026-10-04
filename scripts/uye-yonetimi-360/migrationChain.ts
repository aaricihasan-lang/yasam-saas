/**
 * ÜYE YÖNETİMİ 360° — test DB'lerine eklenecek gerçek migration zinciri (ortak).
 *
 * 20271006000000 liste RPC'si Usage360 rollup'ını (usage_daily + usage360_measurement_start) ve
 * oturum modeli v2 audit CHECK'ini önkoşul alır. Üye Yönetimi FAZ 1/FAZ 2 route harness'leri liste
 * route'unu gerçek RPC ile çalıştırdığı için (route artık p_activity/p_module_keys/p_security
 * gönderir) aynı zinciri uygular — production deploy sırasıyla birebir: MIGRATION FIRST.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

export const M360_MIGRATION = "20271006000000_admin_member360_commercial.sql";

export const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

export const M360_PREREQ_MIGRATIONS = [
  "20270110000000_expert_stats_session_indexes.sql",
  "20270111000000_user_sessions_client_channel.sql",
  "20270112000000_expert_usage_events.sql",
  "20270115000000_expert_stats_read_rpcs.sql",
  "20270205000000_usage360_telemetry_core.sql",
  "20270206000000_usage360_admin_read_rpcs.sql",
  "20271003200100_admin_audit_session_actions.sql",
] as const;

export async function applyMember360Chain(su: pg.Client, opts: { applyM360?: boolean } = {}): Promise<void> {
  await su.query(`create schema if not exists storage;
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
      owner uuid, metadata jsonb, created_at timestamptz default now());`);
  for (const f of M360_PREREQ_MIGRATIONS) await su.query(readMig(f));
  if (opts.applyM360 !== false) await su.query(readMig(M360_MIGRATION));
}
