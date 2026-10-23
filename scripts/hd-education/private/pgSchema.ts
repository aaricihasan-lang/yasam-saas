/**
 * Özel eğitim arşivi (FAZ 6) test şeması — izole embedded-postgres'e uygulanacak GERÇEK migration'lar (sırayla).
 * Prod'a SIFIR temas. HD tabloları (danışan / harita) gerçek migration dosyalarından kurulur; ardından FAZ 6 migration'ı.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

/** Mevcut HD tabloları (değiştirilmeden) + admin_audit_log asgari kopyası (rol değişimi denetimi için). */
export const HD_BASE_MIGRATIONS = [
  "20260606120000_human_design.sql",
  "20260606140000_human_design_clients.sql",
  "20260702120000_human_design_charts_computed.sql",
  "20260726000000_lock_human_design_tables_anon.sql",
  "20271007000000_hd_roxy_autocalc.sql",
  "20271010000100_hd_client_journey_link.sql",
];
export const PRIVATE_MIGRATION = "20271125000000_hd_education_private_archive.sql";

export const PRE_DDL = `
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null,
  action text not null, created_at timestamptz not null default now()
);`;

export function privateArchiveSql(opts: { withPrivate?: boolean } = {}): string[] {
  const out = [PRE_DDL, ...HD_BASE_MIGRATIONS.map(readMig)];
  if (opts.withPrivate !== false) out.push(readMig(PRIVATE_MIGRATION));
  return out;
}

export const PRIVATE_RPCS = [
  "hd_edu_priv_whoami", "hd_edu_priv_owner_set_open", "hd_edu_priv_owner_approve_text", "hd_edu_priv_owner_grant",
  "hd_edu_priv_owner_revoke", "hd_edu_priv_owner_overview", "hd_edu_priv_consent_text", "hd_edu_priv_consent_record",
  "hd_edu_priv_consent_list", "hd_edu_priv_consent_evidence_get", "hd_edu_priv_consent_withdraw", "hd_edu_priv_consent_delete",
  "hd_edu_priv_item_add", "hd_edu_priv_item_update", "hd_edu_priv_item_rebind", "hd_edu_priv_item_delete",
  "hd_edu_priv_item_list", "hd_edu_priv_item_get", "hd_edu_priv_owner_journal", "hd_edu_priv_owner_apply_journal", "hd_edu_priv_chart_status",
];
