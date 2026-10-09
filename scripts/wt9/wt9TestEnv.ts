/**
 * WT9 — Doğaltaş çoklu kaynak GERÇEK route + GERÇEK Postgres test ortamı (yalnız 127.0.0.1; PROD'A SIFIR TEMAS).
 *
 *  - bioTestEnv (embedded-postgres + PostgREST shim + gerçek touch_active_session) yeniden kullanılır.
 *  - public.stones PROD kolonlarıyla birebir kurulur (2026-10-09 salt-okunur denetim: chakras/warning_tags/
 *    assignments/images jsonb, origin_* kolonları, CHECK origin_type).
 *  - Yaşam Hafızası outbox GERÇEK repo migration'larıyla (20260815000000 + 20260825000000) → stones
 *    UPDATE'inin outbox'a 'upsert' düşürdüğü gerçekten doğrulanır.
 *  - WT9 migration'ı ayrı adımda (applyWt9Migration) → "migration öncesi" davranış da test edilebilir.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readMig, startBioTestEnv, type BioTestEnv } from "../bioenergy-presale-final/bioTestEnv";

export { SERVICE_KEY, ANON_KEY } from "../bioenergy-presale-final/bioTestEnv";

export const WT9_MIGRATION = "20271012000000_dogaltas_stone_sources.sql";
export const readWt9Sql = (f: string) => readFileSync(path.join(process.cwd(), "scripts", "wt9", "sql", f), "utf8");

/** PROD public.stones şeması (information_schema, 2026-10-09). */
export const STONES_DDL = `
create table if not exists public.stones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  stone_name text not null,
  short_description text, general_info text, source_note text, physical_effects text, spiritual_effects text,
  other_effects text, warning_text text, warning_tags jsonb, feng_shui text, meditation text, care text, application text,
  chakras jsonb, assignments jsonb, images jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  image_upload_failed boolean default false,
  origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz,
  constraint stones_origin_type_chk check (origin_type is null or origin_type = any (array['admin_transfer','expert_created','legacy']))
);
alter table public.stones enable row level security;
create table if not exists public.stone_exclusions (tenant_id uuid not null, stone_id uuid not null, excluded_at timestamptz default now(), primary key (tenant_id, stone_id));
`;

export async function applyWt9Migration(su: pg.Client): Promise<void> {
  await su.query(readMig(WT9_MIGRATION));
  await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;
                  grant execute on all functions in schema public to service_role;`);
}

export async function startWt9TestEnv(opts: { port: number; dirName: string; withMigration?: boolean }): Promise<BioTestEnv> {
  const env = await startBioTestEnv({ port: opts.port, dirName: opts.dirName, maxRows: 1000, maxUrlBytes: 16384 });
  await env.su.query(STONES_DDL);
  await env.su.query(readMig("20260815000000_yasam_hafizasi_outbox.sql"));
  await env.su.query(readMig("20260825000000_yasam_hafizasi_dogaltas_outbox_trigger.sql"));
  await env.su.query(`grant select, insert, update, delete on all tables in schema public to service_role;
                      grant usage, select on all sequences in schema public to service_role;
                      grant execute on all functions in schema public to service_role;`);
  if (opts.withMigration !== false) await applyWt9Migration(env.su);
  return env;
}

export type Wt9User = { id: string; token: string; tenant: string };

export async function seedStonesUser(su: pg.Client, label: string, opts: { demo?: boolean; role?: string } = {}): Promise<Wt9User> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_WT9_TENANT_${label}`]);
  const id = randomUUID();
  const token = `zz-wt9-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,$4,true,'approved',$5,'premium','premium','active',$6,$7)`,
    [id, `ZZ_WT9_${label}`, `zz.wt9.${label.toLowerCase()}@example.test`, opts.role ?? "expert", JSON.stringify({ stones: true }), tenant, opts.demo === true],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

/** Prod benzeri sentetik taş (tüm içerik alanları dolu/boş karışık, Türkçe, uzun metin). */
export async function seedStone(
  su: pg.Client,
  tenant: string,
  fields: Record<string, unknown> & { stone_name: string },
): Promise<string> {
  const cols = Object.keys(fields);
  const vals = cols.map((c) => {
    const v = fields[c];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const r = await su.query(
    `insert into public.stones(tenant_id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [tenant, ...vals],
  );
  return r.rows[0].id as string;
}
