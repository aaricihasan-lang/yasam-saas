/**
 * USAGE360 2C — YEREL UI SMOKE STACK'i (test-only; production'a SIFIR temas).
 *
 * Ephemeral embedded-postgres + PostgREST shim (sabit port 54399) + sentetik veri:
 * 1 admin + 28 uzman (yoğun / yalnız Android / yalnız masaüstü / karma / telemetrisiz / bilinmeyen
 * şehir), iş tablolarında özel metinler (UI'da GÖRÜNMEMELİ). Süreç öldürülene kadar çalışır.
 * Yerel build bu adrese işaret eder:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_SERVICE_ROLE_KEY=zz-smoke npm run build && next start -p 3919
 * Tarayıcı oturumu: localStorage yasam_user/yasam_session_token + cookie yasam_admin_session (değerler aşağıda loglanır).
 * Çalıştır: npx tsx scripts/usage360/ui-smoke-stack.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { startPgrestShim } from "./pgrestShim";

process.env.LC_ALL = "C";
process.env.LANG = "C";
const DATA_DIR = path.join(os.tmpdir(), "usage360-ui-smoke-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz */ }
const PORT = 54398, PW = "testpw", SHIM_PORT = 54399;
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ADMIN_TOKEN = "zz-smoke-admin-token-0001";
const TA = "a0a0a0a0-0000-4000-8000-00000000000a";

const DDL = `
create table public.users (
  id uuid primary key, full_name text, name text, email text, role text, active boolean default true,
  approval_status text default 'approved', approved_at timestamptz, module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text, trial_started_at timestamptz, trial_ends_at timestamptz,
  membership_started_at timestamptz, membership_ends_at timestamptz, plan text, admin_level text, tenant_id uuid, status text,
  created_at timestamptz default now(), is_super_admin boolean not null default false, is_demo_account boolean not null default false,
  allowed_locations int default 2, password_hash text);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id), session_token text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz, end_reason text, platform text default 'desktop', city text, country text, ip_address text, user_agent text);
create schema if not exists storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, full_name text, notes text, created_at timestamptz default now());
create table public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid, name text);`;

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise(); await epg.start();
  const su = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
  await su.connect();
  await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
                  grant usage on schema public to anon, authenticated, service_role;`);
  await su.query(DDL);
  for (const m of ["20270110000000_expert_stats_session_indexes.sql", "20270111000000_user_sessions_client_channel.sql", "20270112000000_expert_usage_events.sql",
    "20270113000000_expert_storage_usage_rpc.sql", "20270114000000_expert_storage_daily_snapshot.sql", "20270115000000_expert_stats_read_rpcs.sql", "20270120000000_expert_stats_ui_read_rpcs.sql",
    "20270129000200_user_sessions_expiry_touch.sql", "20270205000000_usage360_telemetry_core.sql", "20270206000000_usage360_admin_read_rpcs.sql"]) await su.query(readMig(m));
  await su.query(`grant select, insert, update, delete on public.users, public.user_sessions, public.clients, public.numerology_records to service_role;`);

  const prem = "'premium','premium','active','active'";
  await su.query(`insert into public.users(id, full_name, email, role, tenant_id, package_type, plan, membership_status, subscription_status, approved_at)
                  values ($1,'Smoke Yönetici','smoke.admin@example.test','admin',$2,${prem}, now())`, [ADMIN, TA]);
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [ADMIN, ADMIN_TOKEN]);

  const perms = JSON.stringify({ clients: true, numerology: true, stones: true, reflexology: true, beslenme: true, aromatherapy: true, cupping: true, human_design: true, energy_body: true, sifa_rehberi: true });
  const names = ["Ayşe Çelik", "Mehmet Öztürk", "Şule Güneş", "İbrahim Işık", "Gülşen Yıldız", "Ömer Şahin", "Çağla Doğan", "Ülkü Aydın"];
  const profiles = ["heavy", "android", "desktop", "mixed", "none", "unknowncity", "today_only", "heavy"];
  for (let i = 0; i < 28; i++) {
    const id = `${String(i + 1).padStart(8, "1")}-1111-4111-8111-${String(i + 1).padStart(12, "0")}`;
    const tenant = `${String(i + 1).padStart(8, "a")}-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, "0")}`;
    const profile = profiles[i % profiles.length];
    const name = `${names[i % names.length]} ${i + 1}`;
    await su.query(`insert into public.users(id, full_name, email, role, tenant_id, module_permissions, package_type, plan, membership_status, subscription_status, created_at, approved_at, active)
                    values ($1,$2,$3,'expert',$4,$5,${prem}, now() - ($6 || ' days')::interval, now() - ($6 || ' days')::interval, $7)`,
      [id, name, `smoke.expert${i + 1}@example.test`, tenant, perms, String(30 + i * 5), i !== 17]);
    await su.query(`insert into public.user_sessions(user_id, session_token, created_at) values ($1,$2, now() - ($3 || ' days')::interval)`, [id, `zz-smoke-tok-${i + 1}-000000`, String(i % 20)]);
    await su.query(`insert into public.clients(tenant_id, full_name, notes) values ($1,'CLIENT_NAME_PRIVATE_123','NOTE_PRIVATE_321 SENTINEL_PII_USAGE360_DO_NOT_LEAK')`, [tenant]);
    if (profile === "none") continue;
    const days = profile === "today_only" ? 0 : profile === "heavy" ? 60 : 25;
    const channels = profile === "android" ? ["android_app"] : profile === "desktop" ? ["desktop_web"] : ["android_app", "desktop_web", "mobile_web"];
    const city = profile === "unknowncity" ? null : ["Konya", "İzmir", "Şanlıurfa", "Eskişehir"][i % 4];
    const mods = ["clients", "numerology", "reflexology", "stones", "beslenme"].slice(0, 2 + (i % 4));
    for (let g = 0; g <= days; g++) {
      if (g > 0 && (i + g) % 4 === 0 && profile !== "heavy") continue;
      for (const [ci, ch] of channels.entries()) {
        if (ci > 0 && g % 3 !== 0) continue;
        const visits = 1 + ((i + g) % 3), active = 300 + ((i * 97 + g * 53) % 3600), acts = (i + g) % 9;
        const hourMask = (1 << (8 + ((i + g) % 4))) | (1 << (13 + (g % 6))) | (g % 5 === 0 ? 1 << 21 : 0);
        await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,pings,module_opens,creates,updates,deletes,analyses,reports_generated,reports_exported,uploads,failures,hour_mask,first_at,last_at)
          values ($1,$2, public.usage360_day_tr(now()) - $3::int, $4, $5, $6, $5*10, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                  now() - ($3 || ' days')::interval - interval '6 hours', now() - ($3 || ' days')::interval - interval '10 minutes')`,
          [id, tenant, g, ch, visits, active, mods.length, Math.ceil(acts / 2), Math.floor(acts / 3), acts % 2, acts % 3 === 0 ? 1 : 0, acts % 4 === 0 ? 1 : 0, acts % 5 === 0 ? 1 : 0, acts % 7 === 0 ? 1 : 0, g % 11 === 0 ? 1 : 0, hourMask]);
        for (const [mi, m] of mods.entries()) {
          const mActs = mi === mods.length - 1 ? 0 : Math.ceil(acts / (mi + 1));
          await su.query(`insert into public.usage_daily_modules(user_id,tenant_id,day_tr,module_key,channel,active_seconds,module_opens,creates,updates,reports_generated,failures,hour_mask,first_at,last_at)
            values ($1,$2, public.usage360_day_tr(now()) - $3::int, $4, $5, $6, 1, $7, $8, $9, $10, $11, now() - ($3 || ' days')::interval - interval '5 hours', now() - ($3 || ' days')::interval - interval '20 minutes')`,
            [id, tenant, g, m, ch, Math.floor(active / (mi + 2)), mActs, Math.floor(mActs / 2), mActs % 3 === 0 && mActs ? 1 : 0, g % 11 === 0 && mi === 0 ? 1 : 0, hourMask]);
        }
        for (let v = 0; v < visits; v++) {
          await su.query(`insert into public.usage_visits(user_id,tenant_id,auth_session_id,started_at,last_active_at,active_seconds,channel,os_family,browser_family,app_version,country,city,day_tr)
            values ($1,$2, gen_random_uuid(), now() - ($3 || ' days')::interval - ($4 || ' hours')::interval, now() - ($3 || ' days')::interval - ($4 || ' hours')::interval + interval '25 minutes', $5, $6, $7, $8, $9, 'TR', $10, public.usage360_day_tr(now()) - $3::int)`,
            [id, tenant, g, 2 + v * 3, Math.floor(active / visits), ch, ch === "android_app" ? "android" : ch === "mobile_web" ? "ios" : "windows", ch === "android_app" ? "webview" : ch === "mobile_web" ? "safari" : "chrome", ch === "android_app" ? "2.4.0" : null, city]);
        }
      }
      if (g <= 20) {
        for (let e = 0; e < 3; e++) {
          const action = ["record_created", "record_updated", "report_generated", "module_opened", "analysis_run", "action_failed"][(i + g + e) % 6];
          const m = mods[(g + e) % mods.length];
          await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,action,sub_entity,failed_action,error_class,source,day_tr,occurred_at,channel)
            values ($1,$2,$3,$4,$5,$6,$7,$8, public.usage360_day_tr(now() - ($9 || ' days')::interval - ($10 || ' hours')::interval), now() - ($9 || ' days')::interval - ($10 || ' hours')::interval, $11)`,
            [tenant, id, m, action, action === "module_opened" ? null : m === "clients" ? "anamnesis" : null,
             action === "action_failed" ? "record_created" : null, action === "action_failed" ? "server" : null,
             action === "module_opened" ? "client" : "server", g, 3 + e * 2, channels[e % channels.length]]);
        }
      }
    }
  }
  const pool = new pg.Pool({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres", max: 16 });
  const shim = await startPgrestShim(pool, SHIM_PORT);
  const user = { id: ADMIN, email: "smoke.admin@example.test", name: "Smoke Yönetici", role: "admin", status: "active", tenant_id: TA, active: true, approval_status: "approved" };
  console.log(`UI SMOKE STACK HAZIR · shim ${shim.url}`);
  console.log(`BROWSER_SETUP localStorage.setItem("yasam_user", ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem("yasam_session_token", "${ADMIN_TOKEN}"); document.cookie = "yasam_admin_session=${ADMIN_TOKEN}; path=/";`);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => { console.error("STACK HATASI:", e); process.exit(1); });
