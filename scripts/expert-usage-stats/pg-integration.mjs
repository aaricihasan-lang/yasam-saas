// UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 GERÇEK PostgreSQL entegrasyon testi.
// Bağımsız EPHEMERAL yerel Postgres (embedded-postgres) — production'a SIFIR temas, sentetik veri.
// Şema: sentetik users + user_sessions + storage.objects + Aşama-üstü migration'lar
//        (20270110..20270115). Çalıştır: node scripts/expert-usage-stats/pg-integration.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const DATA_DIR = path.join(os.tmpdir(), "expert-usage-stats-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54330, PW = "testpw";
const ROOT = process.cwd();
const readMig = (f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = (database = "postgres") => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database });

const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const U1 = "11111111-1111-1111-1111-111111111101"; // expert, non-demo, T1
const U2 = "22222222-2222-2222-2222-222222222202"; // expert, non-demo, T2
const U3 = "33333333-3333-3333-3333-333333333303"; // expert, DEMO, T1
const U4 = "44444444-4444-4444-4444-444444444404"; // admin, T1

const SETUP = `
create schema if not exists storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
create table public.users (
  id uuid primary key, tenant_id uuid, role text, active boolean default true,
  approval_status text default 'approved', created_at timestamptz default now(),
  is_demo_account boolean default false, module_permissions jsonb default '{}'::jsonb
);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  ip_address text, country text, city text, user_agent text, platform text,
  session_token text unique, is_active boolean default true,
  created_at timestamptz default now(), last_seen_at timestamptz default now(),
  ended_at timestamptz, end_reason text
);
`;

const MIGRATIONS = [
  "20270110000000_expert_stats_session_indexes.sql",
  "20270111000000_user_sessions_client_channel.sql",
  "20270112000000_expert_usage_events.sql",
  "20270113000000_expert_storage_usage_rpc.sql",
  "20270114000000_expert_storage_daily_snapshot.sql",
  "20270115000000_expert_stats_read_rpcs.sql",
];

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  console.log("embedded-postgres başlatıldı (ephemeral).");

  const su = conn();
  await su.connect();
  const callAs = async (role, sql, params) => {
    const c = conn(); await c.connect();
    try { await c.query(`set role ${role}`); return await c.query(sql, params); }
    finally { await c.end(); }
  };

  try {
    // Roller (Supabase benzeri; service_role BYPASSRLS DEĞİL → policy/grant yolu test edilir).
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
    await su.query(SETUP);
    for (const m of MIGRATIONS) await su.query(readMig(m));
    console.log("sentetik şema + migration'lar uygulandı.");

    // Kullanıcılar
    await su.query(`insert into public.users(id,tenant_id,role,active,approval_status,is_demo_account,module_permissions) values
      ($1,$2,'expert',true,'approved',false,'{"numerology":true,"stones":true,"reflexology":true,"clients":true}'::jsonb),
      ($3,$4,'expert',true,'approved',false,'{"numerology":true}'::jsonb),
      ($5,$2,'expert',true,'approved',true,'{}'::jsonb),
      ($6,$2,'admin',true,'approved',false,'{}'::jsonb)`,
      [U1, T1, U2, T2, U3, U4]);

    // ── A: usage_events (İP-2C) — grant/RLS/append-only/idempotency/CHECK ──
    console.log("\n[A] expert_usage_events güvenlik + idempotency");
    // service_role INSERT (grant + policy) çalışır.
    await callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,idempotency_key) values ($1,$2,'numerology','analysis_created','k1')`, [T1, U1]);
    ok((await su.query(`select count(*) c from public.expert_usage_events`)).rows[0].c === "1", "service_role INSERT çalışır");
    // Idempotency: aynı anahtar → 23505.
    let idemErr = null; try { await callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,idempotency_key) values ($1,$2,'numerology','analysis_created','k1')`, [T1, U1]); } catch (e) { idemErr = e.code; }
    ok(idemErr === "23505", "aynı idempotency_key → 23505 (çift-sayım engeli)");
    // Append-only: UPDATE/DELETE engeli.
    let updErr = null; try { await su.query(`update public.expert_usage_events set module_key='stones'`); } catch (e) { updErr = e.code; }
    ok(updErr !== null, "UPDATE engellendi (append-only trigger)");
    let delErr = null; try { await su.query(`delete from public.expert_usage_events`); } catch (e) { delErr = e.code; }
    ok(delErr !== null, "DELETE engellendi (append-only trigger)");
    // CHECK: geçersiz module_key / event_type.
    let modErr = null; try { await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type) values ($1,$2,'bogus_module','record_created')`, [T1, U1]); } catch (e) { modErr = e.code; }
    ok(modErr === "23514", "geçersiz module_key CHECK ile reddedilir");
    let evErr = null; try { await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type) values ($1,$2,'numerology','bogus_event')`, [T1, U1]); } catch (e) { evErr = e.code; }
    ok(evErr === "23514", "geçersiz event_type CHECK ile reddedilir");
    // RLS/grant: anon/authenticated reddedilir.
    let anonErr = null; try { await callAs("anon", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type) values ($1,$2,'stones','record_created')`, [T1, U1]); } catch (e) { anonErr = e.code; }
    ok(anonErr === "42501", "anon INSERT reddedilir (42501)");
    let authErr = null; try { await callAs("authenticated", `select * from public.expert_usage_events`); } catch (e) { authErr = e.code; }
    ok(authErr === "42501", "authenticated SELECT reddedilir (42501)");

    // ── B: expert_usage_summary (İP-2C) — tenant izolasyonu + range ──
    console.log("\n[B] expert_usage_summary (tenant izolasyonu)");
    await callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,idempotency_key,occurred_at) values
      ($1,$2,'numerology','analysis_created','k2', now()),
      ($1,$2,'stones','record_created','k3', now()),
      ($3,$4,'numerology','analysis_created','k4', now())`, [T1, U1, T2, U2]);
    const sumT1 = (await su.query(`select module_key, event_count from public.expert_usage_summary($1,null,null) order by module_key`, [T1])).rows;
    const mapT1 = Object.fromEntries(sumT1.map(r => [r.module_key, Number(r.event_count)]));
    ok(mapT1.numerology === 2 && mapT1.stones === 1, "summary(T1): numerology=2, stones=1 (k1+k2, k3)");
    const t2map = Object.fromEntries((await su.query(`select module_key,event_count from public.expert_usage_summary($1,null,null)`,[T2])).rows.map(r=>[r.module_key,Number(r.event_count)]));
    ok(t2map.numerology === 1 && !("stones" in t2map), "tenant izolasyonu: T2 yalnız kendi olayını görür");
    // Range: gelecekteki from → boş.
    const future = new Date(Date.now() + 86400000).toISOString();
    ok((await su.query(`select count(*) c from public.expert_usage_summary($1,$2,null)`,[T1, future])).rows[0].c === "0", "range from=gelecek → 0 olay");

    // ── C: expert_activity_stats (İP-1) — giriş vs heartbeat, aktif gün, kanal ──
    console.log("\n[C] expert_activity_stats");
    // 3 giriş (session satırı). Aynı gün 2 last_seen, farklı gün 1. Kanal: desktop_web/android_app/null.
    await su.query(`insert into public.user_sessions(user_id,session_token,platform,client_channel,created_at,last_seen_at) values
      ($1,'tok1','desktop','desktop_web','2027-01-10T08:00:00Z','2027-01-10T09:00:00Z'),
      ($1,'tok2','mobile','android_app','2027-01-10T10:00:00Z','2027-01-10T11:00:00Z'),
      ($1,'tok3','mobile',null,'2027-01-11T10:00:00Z','2027-01-12T10:00:00Z')`, [U1]);
    const act = (await su.query(`select * from public.expert_activity_stats($1,null,null)`, [U1])).rows[0];
    ok(Number(act.login_count) === 3, "login_count=3 (her giriş bir session satırı)");
    ok(Number(act.session_count) === 3, "session_count=3");
    ok(new Date(act.last_login).toISOString() === "2027-01-11T10:00:00.000Z", "last_login = max(created_at)");
    ok(new Date(act.last_seen).toISOString() === "2027-01-12T10:00:00.000Z", "last_seen = max(last_seen_at)");
    // active_days: last_seen günleri (Istanbul): 2027-01-10 (tok1,tok2), 2027-01-12 (tok3) → 2.
    ok(Number(act.active_days) === 2, "active_days=2 (last_seen günleri 10 ve 12, TR)");
    ok(act.channel_breakdown.desktop_web === 1 && act.channel_breakdown.android_app === 1 && act.channel_breakdown.unrecorded === 1, "channel_breakdown: desktop_web/android_app/unrecorded (NULL kanal)");
    // Heartbeat ≠ login: mevcut satırın last_seen'ini bump et → login_count DEĞİŞMEZ.
    await su.query(`update public.user_sessions set last_seen_at = now() where session_token='tok1'`);
    ok(Number((await su.query(`select login_count from public.expert_activity_stats($1,null,null)`,[U1])).rows[0].login_count) === 3, "heartbeat (last_seen bump) login_count'u ARTIRMAZ");
    // Range: yalnız 2027-01-11 sonrası giriş.
    ok(Number((await su.query(`select login_count from public.expert_activity_stats($1,$2,null)`,[U1,"2027-01-11T00:00:00Z"])).rows[0].login_count) === 1, "range from=11 → login_count=1 (tok3)");

    // ── D: expert_storage_usage (İP-4) — atıf/unattributed/allowlist/delete ──
    console.log("\n[D] expert_storage_usage");
    await su.query(`insert into storage.objects(bucket_id,name,metadata) values
      ('stone-photos', $1||'/c1/s1/f.jpg', '{"size":"100"}'),
      ('stone-photos', 'catalog/'||$1||'/g.jpg', '{"size":"200"}'),
      ('stone-photos', 'healing-guides/'||$1||'/h.jpg', '{"size":"50"}'),
      ('personal-archive', $1||'/a1/doc.pdf', '{"size":"1000"}'),
      ('personal-archive', $1||'/a2/nosize.pdf', '{}'),
      ('video-temp', $1||'/j1/v.mp4', '{"size":"999"}'),
      ('hd-chart-images', $2||'/c/chart.png', '{"size":"500"}'),
      ('stone-photos', 'notauuid/x.jpg', '{"size":"10"}'),
      ('random-bucket', $1||'/z.jpg', '{"size":"77777"}')`, [T1, T2]);
    const usage = (await su.query(`select tenant_id, bucket, object_count, total_bytes, missing_size_count from public.expert_storage_usage()`)).rows;
    const t1rows = usage.filter(r => r.tenant_id === T1);
    const t1obj = t1rows.reduce((s, r) => s + Number(r.object_count), 0);
    const t1bytes = t1rows.reduce((s, r) => s + Number(r.total_bytes), 0);
    const t1missing = t1rows.reduce((s, r) => s + Number(r.missing_size_count), 0);
    ok(t1obj === 6, `T1 obje=6 (stone3+archive2+video1); bulundu ${t1obj}`);
    ok(t1bytes === 100 + 200 + 50 + 1000 + 999, `T1 byte=2349 (nosize hariç); bulundu ${t1bytes}`);
    ok(t1missing === 1, "T1 missing_size_count=1 (nosize.pdf)");
    const t2rows = usage.filter(r => r.tenant_id === T2);
    ok(t2rows.reduce((s,r)=>s+Number(r.object_count),0) === 1 && t2rows.reduce((s,r)=>s+Number(r.total_bytes),0) === 500, "T2 hd-chart: 1 obje / 500 byte");
    const unattr = usage.filter(r => r.tenant_id === null);
    ok(unattr.reduce((s,r)=>s+Number(r.object_count),0) === 1 && unattr.reduce((s,r)=>s+Number(r.total_bytes),0) === 10, "unattributed (UUID olmayan prefix): 1 obje / 10 byte");
    ok(!usage.some(r => r.bucket === "random-bucket"), "allowlist dışı bucket (random-bucket) HARİÇ");
    // Silme → toplam azalır.
    await su.query(`delete from storage.objects where bucket_id='video-temp'`);
    const t1obj2 = (await su.query(`select coalesce(sum(object_count),0) o, coalesce(sum(total_bytes),0) b from public.expert_storage_usage() where tenant_id=$1`,[T1])).rows[0];
    ok(Number(t1obj2.o) === 5 && Number(t1obj2.b) === 1350, "dosya silme sonrası T1 azaldı (5 obje / 1350 byte)");

    // ── E: snapshot (İP-5) — idempotent, partial/complete ──
    console.log("\n[E] expert_storage_snapshot_run");
    const w1 = (await su.query(`select public.expert_storage_snapshot_run('2027-01-20') n`)).rows[0].n;
    ok(Number(w1) === 2, `snapshot yazılan tenant=2 (T1,T2 atfedilen); bulundu ${w1}`);
    ok((await su.query(`select count(*) c from public.expert_storage_daily where snapshot_date='2027-01-20'`)).rows[0].c === "2", "o gün 2 satır");
    // Idempotent: aynı gün tekrar → hâlâ 2 satır (çift YOK).
    await su.query(`select public.expert_storage_snapshot_run('2027-01-20')`);
    ok((await su.query(`select count(*) c from public.expert_storage_daily where snapshot_date='2027-01-20'`)).rows[0].c === "2", "aynı gün tekrar çalıştırma çift kayıt AÇMAZ (idempotent)");
    ok((await su.query(`select status from public.expert_storage_daily where tenant_id=$1 and snapshot_date='2027-01-20'`,[T1])).rows[0].status === "partial", "T1 status=partial (missing_size>0)");
    ok((await su.query(`select status from public.expert_storage_daily where tenant_id=$1 and snapshot_date='2027-01-20'`,[T2])).rows[0].status === "complete", "T2 status=complete");
    // Eksik boyut objesi kaldır → yeni gün complete.
    await su.query(`delete from storage.objects where name like '%nosize%'`);
    await su.query(`select public.expert_storage_snapshot_run('2027-01-21')`);
    ok((await su.query(`select status from public.expert_storage_daily where tenant_id=$1 and snapshot_date='2027-01-21'`,[T1])).rows[0].status === "complete", "eksik boyut giderilince T1 status=complete");
    // failed başarılı gibi sunulmaz: status CHECK 'failed' kabul eder ve complete'ten ayrıktır.
    await su.query(`insert into public.expert_storage_daily(tenant_id,snapshot_date,object_count,total_bytes,status) values ($1,'2027-01-22',0,0,'failed')`,[T1]);
    ok((await su.query(`select count(*) c from public.expert_storage_daily where status='failed' and status<>'complete'`)).rows[0].c === "1", "failed satır 'complete'ten ayrık (başarısız başarı gibi sunulmaz)");

    // ── F: expert_active_used_count (İP-E) ──
    console.log("\n[F] expert_active_used_count (aktif hesap ≠ kullanım sinyali)");
    // U1 son_seen güncel (yukarıda now()); U2 eski; U3 demo güncel; U4 admin güncel.
    await su.query(`insert into public.user_sessions(user_id,session_token,last_seen_at) values
      ($1,'u2old', '2020-01-01T00:00:00Z'),
      ($2,'u3new', now()),
      ($3,'u4new', now())`, [U2, U3, U4]);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const used = (await su.query(`select public.expert_active_used_count($1) n`,[since])).rows[0].n;
    ok(Number(used) === 1, `son 30g kullanım sinyali olan DISTINCT expert=1 (yalnız U1; U2 eski, U3 demo, U4 admin); bulundu ${used}`);

    // ── G: fonksiyon EXECUTE yetkileri ──
    console.log("\n[G] RPC EXECUTE yetkileri (yalnız service_role)");
    ok((await su.query(`select has_function_privilege('service_role','public.expert_storage_usage()','EXECUTE') p`)).rows[0].p === true, "service_role EXECUTE expert_storage_usage");
    ok((await su.query(`select has_function_privilege('anon','public.expert_storage_usage()','EXECUTE') p`)).rows[0].p === false, "anon EXECUTE expert_storage_usage YOK");
    ok((await su.query(`select has_function_privilege('anon','public.expert_activity_stats(uuid,timestamptz,timestamptz)','EXECUTE') p`)).rows[0].p === false, "anon EXECUTE expert_activity_stats YOK");
    ok((await su.query(`select prosecdef from pg_proc where proname='expert_storage_usage'`)).rows[0].prosecdef === true, "expert_storage_usage SECURITY DEFINER");
    // client_channel kolonu additive eklendi + CHECK.
    ok((await su.query(`select count(*) c from information_schema.columns where table_name='user_sessions' and column_name='client_channel'`)).rows[0].c === "1", "user_sessions.client_channel additive kolon eklendi");
    let chErr = null; try { await su.query(`insert into public.user_sessions(user_id,session_token,client_channel) values ($1,'badch','bogus_channel')`,[U1]); } catch(e){ chErr = e.code; }
    ok(chErr === "23514", "client_channel CHECK geçersiz değeri reddeder");

    console.log(`\n──────────\nGERÇEK PG: PASS ${pass} · FAIL ${fail}`);
  } finally {
    try { await su.end(); } catch {}
    try { await epg.stop(); console.log("embedded-postgres durduruldu."); }
    catch (e) { console.log("(teardown uyarısı:", e.message, ")"); }
  }
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });
