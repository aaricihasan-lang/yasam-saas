/**
 * 8. aşama — TEST projesine V1 OTURUM bağımlılıkları (tek işlem, yalnız BOŞ veritabanında).
 *   - public.zz_sifa_v2_test_marker  : bu DB'nin test projesi olduğunun işareti (guard bunu arar)
 *   - tenants / users / user_sessions : anamnez testEnv BASE_DDL ile AYNI kolonlar (repoda CREATE yok)
 *   - 20270129000200_user_sessions_expiry_touch.sql (touch_active_session RPC — gerçek dosya)
 *   - tarayıcı rollerine kapalı (RLS açık + REVOKE), service_role erişir (production deseni)
 * Healing (V1 Şifa) tabloları ve V2 migration'ı integration.real.mts'nin A/B bölümleri kurar.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/setup-deps.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb, loadTestTarget, redact } from "./guard";

const t = loadTestTarget();
const c = await connectTestDb({ requireMarker: false });
try {
  const pre = (await c.query(
    `select (select count(*)::int from information_schema.tables where table_schema='public') pub,
            (select count(*)::int from storage.buckets) buckets, (select count(*)::int from auth.users) au`,
  )).rows[0];
  if (pre.pub !== 0) throw new Error(`DUR: public şemada ${pre.pub} tablo var — yalnız BOŞ test DB'sinde kurulur.`);
  console.log(`ön koşul: public tablo 0, bucket ${pre.buckets}, auth.users ${pre.au}`);

  const touch = readFileSync(path.resolve("supabase/migrations/20270129000200_user_sessions_expiry_touch.sql"), "utf8");
  await c.query("BEGIN");
  await c.query(`
    create table public.zz_sifa_v2_test_marker (ref text primary key, purpose text not null, created_at timestamptz not null default now());
    alter table public.zz_sifa_v2_test_marker enable row level security;
    revoke all on public.zz_sifa_v2_test_marker from public, anon, authenticated;
  `);
  await c.query("insert into public.zz_sifa_v2_test_marker(ref, purpose) values ($1, 'sifa-rehberi-v2 8. asama sentetik test')", [t.ref]);
  await c.query(`
    create extension if not exists pgcrypto with schema extensions;
    create table public.tenants (id uuid primary key, name text);
    create table public.users (
      id uuid primary key, full_name text, name text, email text, role text,
      active boolean default false, approval_status text default 'pending',
      module_permissions jsonb default '{}'::jsonb,
      package_type text, membership_status text, subscription_status text,
      trial_started_at timestamptz, trial_ends_at timestamptz, membership_started_at timestamptz, membership_ends_at timestamptz,
      plan text, admin_level text, tenant_id uuid, status text, created_at timestamptz default now(),
      is_super_admin boolean not null default false, is_demo_account boolean not null default false,
      trial_kind text, trial_status text
    );
    create table public.user_sessions (
      id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
      session_token text not null unique, is_active boolean not null default true,
      created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
      ended_at timestamptz, end_reason text, platform text default 'desktop', city text, country text,
      ip_address text, user_agent text
    );
  `);
  await c.query(touch);
  await c.query(`
    do $$ declare t text; begin
      foreach t in array array['tenants','users','user_sessions'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on table public.%I from public, anon, authenticated', t);
        execute format('grant select, insert, update, delete on table public.%I to service_role', t);
      end loop;
    end $$;
  `);
  await c.query("COMMIT");
  await c.query("NOTIFY pgrst, 'reload schema'");
  const tabs = (await c.query("select string_agg(table_name, ', ' order by table_name) s from information_schema.tables where table_schema='public'")).rows[0].s;
  const fn = (await c.query("select has_function_privilege('anon','public.touch_active_session(text,integer,integer,boolean,integer,integer)','EXECUTE') a, has_function_privilege('service_role','public.touch_active_session(text,integer,integer,boolean,integer,integer)','EXECUTE') s")).rows[0];
  console.log(`KURULDU: ${tabs}`);
  console.log(`touch_active_session: anon=${fn.a} service_role=${fn.s}`);
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(redact((e as Error).message, t));
  process.exitCode = 1;
} finally {
  await c.end();
}
