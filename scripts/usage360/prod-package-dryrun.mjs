// USAGE360 NİHAİ KAPANIŞ — PROD PAKETİ YEREL PROVASI (embedded-postgres; prod'a SIFIR temas).
// Masaüstündeki paket dosyalarını (00→06) prod-benzeri ön-durumda (legacy olaylar + eski IP'ler)
// sırasıyla çalıştırır: 01–03 transaction/idempotency, 04 history, 05 tüm *_ok, legacy korunur.
// Çalıştır: node scripts/usage360/prod-package-dryrun.mjs <paket-klasörü>
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
process.env.LC_ALL = "C"; process.env.LANG = "C";
const PKG = process.argv[2];
const DATA_DIR = path.join(os.tmpdir(), "usage360-prodpkg-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54353, PW = "testpw";
const mig = (f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const pkg = (f) => readFileSync(path.join(PKG, f), "utf8");
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const U = "11111111-1111-1111-1111-111111111101", T = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise(); await epg.start();
  const su = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" }); await su.connect();
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin; grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
      create schema if not exists storage; create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
      create table public.users (id uuid primary key, tenant_id uuid, role text, active boolean default true, approval_status text default 'approved', created_at timestamptz default now(),
        is_demo_account boolean default false, module_permissions jsonb default '{}'::jsonb, full_name text, email text, allowed_locations int default 2);`);
    await su.query(`insert into public.users(id, tenant_id, role) values ($1,$2,'expert')`, [U, T]);
    await su.query(mig("20260622100000_account_security.sql"));
    await su.query(`alter table public.user_sessions add column if not exists platform text`);
    for (const m of ["20270110000000_expert_stats_session_indexes.sql", "20270111000000_user_sessions_client_channel.sql",
      "20270112000000_expert_usage_events.sql", "20270115000000_expert_stats_read_rpcs.sql"]) await su.query(mig(m));
    // Prod-benzeri ön durum: 4 legacy olay türü + eski/yeni IP'li oturumlar.
    for (const [m, e] of [["numerology", "analysis_created"], ["stones", "record_created"], ["reflexology", "protocol_created"], ["clients", "analysis_created"]]) {
      await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,occurred_at) values ($1,$2,$3,$4, now()-interval '5 days')`, [T, U, m, e]).catch((err) => { throw new Error(`legacy insert ${m}/${e}: ${err.message}`); });
    }
    await su.query(`insert into public.user_sessions(user_id, ip_address, session_token, created_at) values ($1,'198.51.100.7','a', now()-interval '120 days'), ($1,'203.0.113.9','b', now())`, [U]);
    const pre = (await su.query(pkg("00_precheck_READONLY.sql"))).rows[0];
    ok(Number(pre.legacy_events) === 4 && Number(pre.bad_module_keys) === 0 && pre.usage_visits_exists === false && Number(pre.history_0205) === 0 && pre.fn_ping === false && pre.fn_ip_purge === false, "00 ön kontrol: beklenen ön durum");
    ok(Number(pre.ip_sessions_older_90d) === 1, "00: >90g IP sayımı");
    for (const f of ["01_20270205000000_usage360_telemetry_core.sql", "02_20270206000000_usage360_admin_read_rpcs.sql", "03_20270207000000_security_ip_retention.sql"]) {
      let err = null; try { await su.query(pkg(f)); } catch (e) { err = e.message; }
      ok(err === null, `${f} uygulandı${err ? " — " + err : ""}`);
    }
    for (const f of ["01_20270205000000_usage360_telemetry_core.sql", "02_20270206000000_usage360_admin_read_rpcs.sql", "03_20270207000000_security_ip_retention.sql"]) {
      let err = null; try { await su.query(pkg(f)); } catch (e) { err = e.message; }
      ok(err === null, `${f} ikinci kez (idempotent)${err ? " — " + err : ""}`);
    }
    const h = (await su.query(pkg("04_history_insert.sql")));
    const hist = (Array.isArray(h) ? h[h.length - 1] : h).rows;
    await su.query(pkg("04_history_insert.sql"));
    ok(hist.length === 3 && (await su.query(`select count(*)::int n from supabase_migrations.schema_migrations`)).rows[0].n === 3, "04 history: 3 satır, tekrar çalıştırmada çoğalmaz");
    const v = (await su.query(pkg("05_verify_READONLY.sql"))).rows[0];
    for (const k of Object.keys(v).filter((k) => k.endsWith("_ok"))) ok(v[k] === true, `05 ${k}${v[k] !== true ? " (missing: " + v.missing_functions + ")" : ""}`);
    ok(Number(v.new_table_policies_expected_0) === 0 && Number(v.legacy_events) === 4 && Number(v.new_rows) === 0 && Number(v.visits_rows) === 0, "05: legacy 4 olay KORUNDU, yeni satır yok");
    const d = (await su.query(pkg("06_retention_dryrun_READONLY.sql"))).rows[0];
    ok(Number(d.usage360_dry_run.events) === 0 && Number(d.usage360_dry_run.visits) === 0 && d.usage360_dry_run.dry_run === true, "06 usage360 dry-run: 0 (legacy olaylar kapsam dışı)");
    ok(Number(d.ip_dry_run.sessions) === 1 && Number(d.ip_sessions_kept) === 1, "06 IP dry-run: yalnız >90g satır; yeni IP korunur sayımı");
    ok((await su.query(`select count(*)::int n from public.user_sessions where ip_address is not null`)).rows[0].n === 2, "06 dry-run hiçbir IP'yi değiştirmedi");
  } finally { await su.end().catch(() => {}); await epg.stop().catch(() => {}); try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {} }
  console.log(`\n──────────\nPROD PACKAGE DRY-RUN: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
