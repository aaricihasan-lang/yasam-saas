/**
 * WT6 — Kupa & Hacamat GERÇEK route + GERÇEK Postgres test ortamı (yalnız 127.0.0.1; PROD'A SIFIR TEMAS).
 *
 *  - Biyoenerji final test ortamı (scripts/bioenergy-presale-final/bioTestEnv) yeniden kullanılır:
 *    embedded-postgres + sentetik users/user_sessions + touch_active_session + PostgREST shim
 *    (eq/in/is/or/ilike/order/limit/upsert…; her istek SET ROLE service_role).
 *  - Üzerine GERÇEK repo Kupa migration zinciri prod sırasıyla uygulanır. YH CDC tetikleyici
 *    migration'ı (20261222…) bu ortamda olmayan YH outbox tablolarına bağlı → atlanır (Kupa şeması değişmez).
 *  - DATE kolonları PostgREST gibi 'YYYY-MM-DD' METİN döner (pg varsayılanı JS Date → TZ kayması).
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readMig, startBioTestEnv, type BioTestEnv } from "../bioenergy-presale-final/bioTestEnv";

pg.types.setTypeParser(1082, (v: string) => v);

export { SERVICE_KEY, ANON_KEY } from "../bioenergy-presale-final/bioTestEnv";

export const KUPA_MIGRATIONS = [
  "20261001000000_cupping_topic_notes.sql",
  "20261216000000_cupping_schema.sql",
  "20261216010000_cupping_transfer_provenance.sql",
  "20261217000000_cupping_content_foundation.sql",
  // 20261222000000_yh_kupa_hacamat_cdc_triggers.sql — YH outbox bağımlı; atlandı
  "20261227000000_cupping_topic_note_atomic_update.sql",
  "20261228000000_cupping_protocols_v2_core.sql",
  "20261228000100_cupping_protocol_entry_atomic.sql",
  "20270101000600_cupping_technique_workspace_foundation.sql",
  "20270104000000_cupping_calendar_advice_foundation.sql",
  "20270105000000_cupping_calendar_selection_source.sql",
  "20270106000000_cupping_calendar_day_color.sql",
] as const;

export type KupaUser = { id: string; token: string; tenant: string };
export type KupaSeed = { A: KupaUser; B: KupaUser; TA: string; TB: string };

export async function startKupaTestEnv(opts: { port: number; dirName: string }): Promise<BioTestEnv> {
  const env = await startBioTestEnv({ port: opts.port, dirName: opts.dirName, maxRows: 1000 });
  // Takvim danışan-notu FK hedefi: minimal public.clients (prod kolonlarının alt kümesi).
  await env.su.query(`create table if not exists public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text, created_at timestamptz default now());`);
  for (const m of KUPA_MIGRATIONS) {
    try {
      await env.su.query(readMig(m));
    } catch (e) {
      throw new Error(`migration ${m}: ${String(e).slice(0, 300)}`);
    }
  }
  await env.su.query(`grant select, insert, update, delete on all tables in schema public to service_role;
                      grant usage, select on all sequences in schema public to service_role;
                      grant execute on all functions in schema public to service_role;`);
  return env;
}

export async function seedKupa(su: pg.Client): Promise<KupaSeed> {
  const TA = randomUUID();
  const TB = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_WT6_TENANT_A'),($2,'ZZ_WT6_TENANT_B') on conflict do nothing`, [TA, TB]);
  const mk = async (label: string, tenant: string): Promise<KupaUser> => {
    const id = randomUUID();
    const token = `zz-wt6-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id)
       values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5)`,
      [id, `ZZ_WT6_${label}`, `zz.wt6.${label.toLowerCase()}@example.test`, JSON.stringify({ cupping: true }), tenant],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { id, token, tenant };
  };
  return { TA, TB, A: await mk("A", TA), B: await mk("B", TB) };
}
