// FAZ 2 — GERÇEK PostgreSQL testi: expert_list + expert_storage_growth read RPC'leri.
// Bağımsız EPHEMERAL embedded-postgres; sentetik users + user_sessions + expert_storage_daily.
// Çalıştır: node scripts/expert-usage-ui/pg-integration.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.LC_ALL = "C"; process.env.LANG = "C";
const DATA_DIR = path.join(os.tmpdir(), "expert-usage-ui-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54331, PW = "testpw";
const ROOT = process.cwd();
const readMig = (f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = (database = "postgres") => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database });

const T1="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", T2="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      T3="cccccccc-cccc-cccc-cccc-cccccccccccc", T4="dddddddd-dddd-dddd-dddd-dddddddddddd",
      T5="eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", TA="ffffffff-ffff-ffff-ffff-ffffffffffff";
const E1="11111111-0000-0000-0000-000000000001", E2="11111111-0000-0000-0000-000000000002",
      E3="11111111-0000-0000-0000-000000000003", E4="11111111-0000-0000-0000-000000000004",
      E5="11111111-0000-0000-0000-000000000005", A1="11111111-0000-0000-0000-0000000000a1";

const SETUP = `
create table public.users (
  id uuid primary key, tenant_id uuid, role text, active boolean default true,
  approval_status text default 'approved', is_demo_account boolean default false,
  created_at timestamptz default now(), full_name text, email text,
  module_permissions jsonb default '{}'::jsonb
);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  session_token text, created_at timestamptz default now(), last_seen_at timestamptz default now()
);
create table public.expert_storage_daily (
  tenant_id uuid not null, snapshot_date date not null, object_count bigint default 0,
  total_bytes bigint default 0, status text default 'complete',
  primary key (tenant_id, snapshot_date)
);
`;

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise(); await epg.start();
  console.log("embedded-postgres başlatıldı.");
  const su = conn(); await su.connect();
  const callAs = async (role, sql, params) => { const c = conn(); await c.connect(); try { await c.query(`set role ${role}`); return await c.query(sql, params); } finally { await c.end(); } };

  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
    await su.query(SETUP);
    await su.query(readMig("20270120000000_expert_stats_ui_read_rpcs.sql"));
    console.log("şema + migration uygulandı.");

    // users: 4 non-demo expert (E1..E4) + 1 demo expert (E5) + 1 admin (A1)
    await su.query(`insert into public.users(id,tenant_id,role,active,approval_status,is_demo_account,created_at,full_name,email,module_permissions) values
      ($1,$7,'expert',true,'approved',false,'2027-01-01','Ali Veli','ali@x.com','{"numerology":true,"stones":true}'::jsonb),
      ($2,$8,'expert',true,'approved',false,'2027-01-02','Ayse Fatma','ayse@x.com','{"numerology":true}'::jsonb),
      ($3,$9,'expert',false,'approved',false,'2027-01-03','Cem Can','cem@x.com','{}'::jsonb),
      ($4,$10,'expert',false,'pending',false,'2027-01-04','Deniz Su','deniz@x.com','{}'::jsonb),
      ($5,$11,'expert',true,'approved',true,'2027-01-05','Demo Kullanici','demo@x.com','{}'::jsonb),
      ($6,$12,'admin',true,'approved',false,'2027-01-06','Admin Kisi','admin@x.com','{}'::jsonb)`,
      [E1,E2,E3,E4,E5,A1,T1,T2,T3,T4,T5,TA]);
    // sessions: E1 (2 satır, en son 02-01 / seen 02-02), E2 (1 satır 01-15), E3 yok
    await su.query(`insert into public.user_sessions(user_id,session_token,created_at,last_seen_at) values
      ($1,'t1a','2027-01-25T08:00:00Z','2027-01-25T09:00:00Z'),
      ($1,'t1b','2027-02-01T08:00:00Z','2027-02-02T10:00:00Z'),
      ($2,'t2a','2027-01-15T08:00:00Z','2027-01-15T08:30:00Z')`, [E1, E2]);

    // ── A: expert_list ──
    console.log("\n[A] expert_list");
    const all = (await su.query(`select * from public.expert_list('','all','last_login',10,0,false)`)).rows;
    ok(all.length === 4, `default(all,non-demo): 4 uzman (E1-E4; demo+admin hariç); bulundu ${all.length}`);
    ok(all.every(r => Number(r.total_count) === 4), "total_count = 4 (filtered set)");
    ok(all[0].user_id === E1, "sıralama last_login DESC → E1 ilk");
    ok(all[all.length-1].last_login === null || all[all.length-1].user_id === E3 || all[all.length-1].user_id === E4, "last_login NULL olanlar sonda");
    const e1 = all.find(r => r.user_id === E1);
    ok(new Date(e1.last_login).toISOString() === "2027-02-01T08:00:00.000Z" && new Date(e1.last_seen).toISOString() === "2027-02-02T10:00:00.000Z" && Number(e1.session_count) === 2, "E1 toplu oturum: last_login/last_seen/session_count (N+1 yok, tek çağrı)");
    const e3 = all.find(r => r.user_id === E3);
    ok(e3.last_login === null && Number(e3.session_count) === 0, "E3 oturumsuz: last_login null, session_count 0");
    // filtreler
    ok((await su.query(`select count(*)::int c from public.expert_list('','active','last_login',50,0,false)`)).rows[0].c === 2, "status=active → 2 (E1,E2)");
    ok((await su.query(`select count(*)::int c from public.expert_list('','archive','last_login',50,0,false)`)).rows[0].c === 1, "status=archive → 1 (E3: approved+pasif)");
    ok((await su.query(`select count(*)::int c from public.expert_list('','pending','last_login',50,0,false)`)).rows[0].c === 1, "status=pending → 1 (E4)");
    ok((await su.query(`select count(*)::int c from public.expert_list('','passive','last_login',50,0,false)`)).rows[0].c === 2, "status=passive → 2 (E3,E4)");
    // arama
    const search = (await su.query(`select user_id from public.expert_list('ayse','all','name',50,0,false)`)).rows;
    ok(search.length === 1 && search[0].user_id === E2, "arama 'ayse' → yalnız E2");
    // demo dahil
    ok((await su.query(`select count(*)::int c from public.expert_list('','all','last_login',50,0,true)`)).rows[0].c === 5, "include_demo=true → 5 (E5 dahil)");
    // sayfalama
    const p1 = (await su.query(`select user_id, total_count from public.expert_list('','all','created_at',2,0,false)`)).rows;
    const p2 = (await su.query(`select user_id, total_count from public.expert_list('','all','created_at',2,2,false)`)).rows;
    ok(p1.length === 2 && p2.length === 2 && Number(p1[0].total_count) === 4, "sayfalama: limit 2 → 2+2, total_count 4 sabit");
    ok(p1[0].user_id !== p2[0].user_id, "sayfa 1 ile sayfa 2 farklı kayıtlar");
    // limit cap 100
    ok((await su.query(`select count(*)::int c from public.expert_list('','all','last_login',9999,0,false)`)).rows[0].c === 4, "aşırı limit → yalnız mevcut 4 (cap güvenli)");

    // ── B: expert_storage_growth ──
    console.log("\n[B] expert_storage_growth");
    ok((await su.query(`select count(*)::int c from public.expert_storage_growth(null,null)`)).rows[0].c === 0, "boş tablo → 0 satır (sahte geçmiş yok)");
    await su.query(`insert into public.expert_storage_daily(tenant_id,snapshot_date,object_count,total_bytes,status) values
      ($1,'2027-01-20',5,500,'complete'),
      ($2,'2027-01-20',3,300,'partial'),
      ($1,'2027-01-21',6,600,'complete')`, [T1, T2]);
    const g = (await su.query(`select to_char(snapshot_date,'YYYY-MM-DD') d, tenant_count, object_count, total_bytes, partial_count from public.expert_storage_growth(null,null) order by snapshot_date`)).rows;
    ok(g.length === 2, "2 gün");
    const d20 = g.find(r => r.d === "2027-01-20");
    ok(d20 && Number(d20.tenant_count) === 2 && Number(d20.object_count) === 8 && Number(d20.total_bytes) === 800 && Number(d20.partial_count) === 1, "20 Ocak: tenant=2, obje=8, byte=800, partial=1");
    const d21 = g.find(r => r.d === "2027-01-21");
    ok(Number(d21.tenant_count) === 1 && Number(d21.total_bytes) === 600 && Number(d21.partial_count) === 0, "21 Ocak: tenant=1, byte=600, partial=0");
    ok((await su.query(`select count(*)::int c from public.expert_storage_growth('2027-01-21',null)`)).rows[0].c === 1, "range from=21 → yalnız 1 gün");

    // ── C: EXECUTE yetkileri (yalnız service_role) ──
    console.log("\n[C] RPC EXECUTE yetkileri");
    ok((await su.query(`select has_function_privilege('service_role','public.expert_list(text,text,text,integer,integer,boolean)','EXECUTE') p`)).rows[0].p === true, "service_role EXECUTE expert_list");
    ok((await su.query(`select has_function_privilege('anon','public.expert_list(text,text,text,integer,integer,boolean)','EXECUTE') p`)).rows[0].p === false, "anon EXECUTE expert_list YOK");
    ok((await su.query(`select has_function_privilege('anon','public.expert_storage_growth(date,date)','EXECUTE') p`)).rows[0].p === false, "anon EXECUTE expert_storage_growth YOK");
    let anonErr = null; try { await callAs("anon", `select * from public.expert_list('','all','last_login',10,0,false)`); } catch (e) { anonErr = e.code; }
    ok(anonErr === "42501", "anon çağrısı reddedilir (42501)");
    ok((await su.query(`select prosecdef from pg_proc where proname='expert_list'`)).rows[0].prosecdef === true, "expert_list SECURITY DEFINER");

    console.log(`\n──────────\nGERÇEK PG: PASS ${pass} · FAIL ${fail}`);
  } finally {
    try { await su.end(); } catch {}
    try { await epg.stop(); console.log("embedded-postgres durduruldu."); } catch (e) { console.log("(teardown:", e.message, ")"); }
  }
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });
