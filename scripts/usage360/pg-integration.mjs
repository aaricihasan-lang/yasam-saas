// USAGE360 AŞAMA 2A — GERÇEK PostgreSQL entegrasyon / RLS / güvenlik testi.
// Bağımsız EPHEMERAL yerel Postgres (embedded-postgres) — production'a SIFIR temas, sentetik veri.
// Supabase benzeri roller + VARSAYILAN AYRICALIKLAR (ALTER DEFAULT PRIVILEGES ... TO anon,...)
// taklit edilir → migration'daki açık REVOKE'lar gerçekten sınanır.
// Zaman: RPC'ler sunucu now() kullanır; testler satır zaman damgalarını geriye kaydırarak
// (süper kullanıcı) ilerleyen zamanı simüle eder — üretim RPC imzasında zaman parametresi YOK.
// Çalıştır: node scripts/usage360/pg-integration.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const DATA_DIR = path.join(os.tmpdir(), "usage360-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54336, PW = "testpw";
const ROOT = process.cwd();
const readMig = (f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const NEW_MIG = "20270205000000_usage360_telemetry_core.sql";
const SENTINEL = "SENTINEL_PII_USAGE360_DO_NOT_LEAK";

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });

const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const U1 = "11111111-1111-1111-1111-111111111101"; // expert T1
const U2 = "22222222-2222-2222-2222-222222222202"; // expert T2
const U3 = "33333333-3333-3333-3333-333333333303"; // expert DEMO T1
const U4 = "44444444-4444-4444-4444-444444444404"; // admin T1

const SETUP = `
create schema if not exists storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
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
);`;

const PRE_MIGRATIONS = [
  "20270110000000_expert_stats_session_indexes.sql",
  "20270111000000_user_sessions_client_channel.sql",
  "20270112000000_expert_usage_events.sql",
  "20270113000000_expert_storage_usage_rpc.sql",
  "20270114000000_expert_storage_daily_snapshot.sql",
  "20270115000000_expert_stats_read_rpcs.sql",
];

// ctx: channel, os, browser, app_version, country, city
const CTX = ["desktop_web", "windows", "chrome", null, "TR", "Istanbul"];

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
  const errCode = async (fn) => { try { await fn(); return null; } catch (e) { return e.code ?? "ERR"; } };

  const ping = (u, t, tok, mod, ctx = CTX) =>
    callAs("service_role", `select public.usage360_ping($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r`, [u, t, tok, mod, ...ctx]).then((r) => r.rows[0].r);
  const track = (o) =>
    callAs("service_role",
      `select public.usage360_track($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) r`,
      [o.user ?? U1, o.tenant ?? T1, o.token === undefined ? "tokA" : o.token, o.module ?? "stones", o.action ?? "record_created",
       o.sub ?? null, o.failed ?? null, o.err ?? null, o.bucket ?? null, o.source ?? "server", o.idem ?? null, o.legacy ?? null,
       ...(o.ctx ?? CTX)]).then((r) => r.rows[0].r);
  // Zamanı ileri sar: ziyaretin tüm zaman damgalarını geriye kaydır.
  const rewind = (tok, secs) => su.query(
    `update public.usage_visits v set started_at = started_at - make_interval(secs => $2),
            last_active_at = last_active_at - make_interval(secs => $2),
            last_ping_at = last_ping_at - make_interval(secs => $2)
       from public.user_sessions s where s.id = v.auth_session_id and s.session_token = $1`, [tok, secs]);
  const visit = async (tok) => (await su.query(
    `select v.* from public.usage_visits v join public.user_sessions s on s.id = v.auth_session_id
      where s.session_token = $1 order by v.last_active_at desc limit 1`, [tok])).rows[0];
  const hex64 = (c) => c.repeat(64);

  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
    await su.query(`grant usage on schema public to anon, authenticated, service_role;`);
    // Supabase varsayılan ayrıcalıkları (yeni tablo/fonksiyon herkese açılır) — REVOKE'ları sınamak için.
    await su.query(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
                    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
    await su.query(SETUP);
    for (const m of PRE_MIGRATIONS) await su.query(readMig(m));

    await su.query(`insert into public.users(id,tenant_id,role,is_demo_account) values
      ($1,$2,'expert',false),($3,$4,'expert',false),($5,$2,'expert',true),($6,$2,'admin',false)`, [U1, T1, U2, T2, U3, U4]);
    await su.query(`insert into public.user_sessions(user_id,session_token,platform,created_at) values
      ($1,'tokA','desktop','2027-01-10T08:00:00Z'),($1,'tokB','mobile','2027-01-10T10:00:00Z'),($1,'tokC','desktop','2027-01-11T10:00:00Z'),
      ($1,'tokD','desktop',now()),($1,'tokOld','desktop',now()),
      ($2,'tok2','desktop',now()),($3,'tok3','desktop',now()),($4,'tok4','desktop',now())`, [U1, U2, U3, U4]);
    await su.query(`update public.user_sessions set is_active=false where session_token='tokOld'`);

    // AŞAMA 1 öncesi (eski) olaylar — migration SONRASI birebir korunmalı.
    await callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,idempotency_key,occurred_at) values
      ($1,$2,'numerology','analysis_created','numerology:analysis_created:x1','2026-09-23T12:41:35Z'),
      ($1,$2,'stones','record_created','stones:record_created:x2','2026-09-24T10:00:00Z'),
      ($1,$2,'reflexology','protocol_created',null,'2026-09-25T10:00:00Z')`, [T1, U1]);
    const legacyBefore = (await su.query(`select id,tenant_id,user_id,module_key,event_type,occurred_at,created_at,idempotency_key from public.expert_usage_events order by occurred_at`)).rows;

    // ── Migration (iki kez: idempotent) ──
    await su.query(readMig(NEW_MIG));
    await su.query(readMig(NEW_MIG));
    console.log("migration uygulandı (2x, idempotent).");

    console.log("\n[0] eski veri geriye-uyumu");
    const legacyAfter = (await su.query(`select id,tenant_id,user_id,module_key,event_type,occurred_at,created_at,idempotency_key from public.expert_usage_events order by occurred_at`)).rows;
    ok(JSON.stringify(legacyBefore) === JSON.stringify(legacyAfter), "eski 3 olay satırı birebir korunur");
    ok((await su.query(`select count(*) c from public.expert_usage_events where action is null and source is null and day_tr is null`)).rows[0].c === "3", "eski satırlarda yeni alanlar NULL (uydurma yok)");
    // Eski doğrudan insert yolu (bayrak kapalı adaptörü) hâlâ çalışır.
    await callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,idempotency_key) values ($1,$2,'clients','analysis_created',$3)`, [T1, U1, hex64("e")]);
    ok((await su.query(`select count(*) c from public.expert_usage_events`)).rows[0].c === "4", "eski 5-kolonlu service_role insert yolu çalışır (CHECK fonksiyonu erişilebilir)");
    ok(await errCode(() => callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type) values ($1,$2,'belge_ceviri_ai','record_created')`, [T1, U1])) === null, "belge_ceviri_ai artık CHECK'e uygun (sessiz 23514 kapandı)");
    ok(await errCode(() => callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key) values ($1,$2,'stones')`, [T1, U1])) === "23514", "event_type da action da yoksa → 23514");
    ok(await errCode(() => callAs("service_role", `insert into public.expert_usage_events(tenant_id,user_id,module_key,action,source,day_tr) values ($1,$2,'stones','record_created','client',current_date)`, [T1, U1])) === "23514", "CHECK: istemci kaynaklı record_created DB'de de yasak");

    console.log("\n[19] RLS / grant");
    for (const t of ["usage_visits", "usage_daily", "usage_daily_modules"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const privs = (await su.query(`select has_table_privilege($1,$2,'SELECT') s, has_table_privilege($1,$2,'INSERT') i, has_table_privilege($1,$2,'UPDATE') u, has_table_privilege($1,$2,'DELETE') d`, [role, `public.${t}`])).rows[0];
        ok(!privs.s && !privs.i && !privs.u && !privs.d, `${role} → ${t}: SELECT/INSERT/UPDATE/DELETE YOK`);
      }
      ok((await su.query(`select relrowsecurity r from pg_class where oid = $1::regclass`, [`public.${t}`])).rows[0].r === true, `${t}: RLS açık`);
    }
    ok(await errCode(() => callAs("authenticated", `select * from public.usage_visits`)) === "42501", "authenticated usage_visits SELECT → 42501");
    ok(await errCode(() => callAs("anon", `insert into public.usage_daily(user_id,tenant_id,day_tr,channel,first_at,last_at) values ($1,$2,current_date,'unknown',now(),now())`, [U1, T1])) === "42501", "anon usage_daily INSERT → 42501");
    ok(await errCode(() => callAs("anon", `select * from public.expert_usage_events`)) === "42501", "anon expert_usage_events SELECT → 42501");
    const pub = ["usage360_ping(uuid,uuid,text,text,text,text,text,text,text,text)",
      "usage360_track(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)",
      "usage360_retention_purge(boolean)"];
    const internal = ["usage360__gate(uuid,uuid,text)", "usage360__ctx_ok(text,text,text,text,text,text)",
      "usage360__open_visit(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,text)"];
    for (const f of pub) {
      const r = (await su.query(`select has_function_privilege('anon',$1,'EXECUTE') a, has_function_privilege('authenticated',$1,'EXECUTE') b, has_function_privilege('service_role',$1,'EXECUTE') c`, [`public.${f}`])).rows[0];
      ok(!r.a && !r.b && r.c, `${f.split("(")[0]}: anon/authenticated EXECUTE yok, service_role var`);
    }
    for (const f of internal) {
      const r = (await su.query(`select has_function_privilege('anon',$1,'EXECUTE') a, has_function_privilege('authenticated',$1,'EXECUTE') b, has_function_privilege('service_role',$1,'EXECUTE') c`, [`public.${f}`])).rows[0];
      ok(!r.a && !r.b && !r.c, `${f.split("(")[0]} (iç): HİÇBİR istemci rolü çağıramaz`);
    }
    ok(await errCode(() => callAs("authenticated", `select public.usage360_ping($1,$2,'tokA',null,'desktop_web','windows','chrome',null,null,null)`, [U1, T1])) === "42501", "authenticated usage360_ping çağrısı → 42501 (tarayıcı doğrudan yazamaz)");
    const defs = (await su.query(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'usage360%'`)).rows;
    ok(defs.filter((d) => d.prosecdef).length === 3 && defs.filter((d) => d.prosecdef).every((d) => (d.proconfig ?? []).some((c) => c === "search_path=\"\"" || c === "search_path=")), "SECURITY DEFINER yalnız 3 genel RPC ve hepsinde search_path='' sabit");
    ok(defs.every((d) => (d.proconfig ?? []).some((c) => c.startsWith("search_path="))), "tüm usage360 fonksiyonlarında search_path sabit");

    console.log("\n[11] TR gün/saat sınırı (Europe/Istanbul, sabit +03 yok)");
    const dq = async (ts) => (await su.query(`select public.usage360_day_tr($1)::text d, public.usage360_hour_tr($1) h`, [ts])).rows[0];
    const a = await dq("2026-09-28T20:59:59Z"), b = await dq("2026-09-28T21:00:00Z");
    ok(a.d === "2026-09-28" && a.h === 23 && b.d === "2026-09-29" && b.h === 0, "20:59:59Z → 28.09 saat 23 · 21:00:00Z → 29.09 saat 0");
    const w = await dq("2015-12-01T21:30:00Z");
    ok(w.d === "2015-12-01" && w.h === 23, "2015 kışı (TR +02 dönemi) IANA ile doğru: 21:30Z → 23:30 aynı gün");

    console.log("\n[1] aktif süre kredisi (SQL = TS)");
    const exp = [[0, 0], [-1, 0], [45, 45], [60, 60], [90, 90], [120, 90], [150, 90], [150.5, 30], [151, 30], [1799, 30]];
    const got = (await su.query(`select x, public.usage360_active_credit(x) c from unnest($1::float8[]) x`, [exp.map((e) => e[0])])).rows;
    ok(got.every((r, i) => r.c === exp[i][1]), "usage360_active_credit sınırları TS computeActiveCredit ile birebir");

    console.log("\n[4-6] ping / ziyaret / hız sınırı");
    ok(await ping(U1, T1, "tokA", null) === "new_visit", "ilk ping → new_visit");
    let v = await visit("tokA");
    ok(v.ping_count === 1 && v.active_seconds === 0 && v.channel === "desktop_web" && v.country === "TR", "ziyaret: ping_count=1, active=0, kanal+ülke");
    ok(await ping(U1, T1, "tokA", null) === "throttled", "hemen ikinci ping (aynı auth oturumu = ikinci sekme) → throttled");
    await rewind("tokA", 44);
    ok(await ping(U1, T1, "tokA", null) === "throttled", "44 sn sonra → hâlâ throttled (45 sn alt sınır)");
    await rewind("tokA", 16);
    ok(await ping(U1, T1, "tokA", null) === "ok", "60 sn sonra → ok");
    v = await visit("tokA");
    ok(v.active_seconds >= 60 && v.active_seconds <= 61 && v.ping_count === 2, `60 sn kredisi (active=${v.active_seconds})`);
    await rewind("tokA", 200);
    await ping(U1, T1, "tokA", null);
    v = await visit("tokA");
    ok(v.active_seconds >= 90 && v.active_seconds <= 91, `150 sn üstü boşluk → sabit 30 sn (active=${v.active_seconds})`);
    await rewind("tokA", 31 * 60);
    ok(await ping(U1, T1, "tokA", null) === "new_visit", "31 dk sessizlik → YENİ ziyaret");
    ok((await su.query(`select count(*) c from public.usage_visits v join public.user_sessions s on s.id=v.auth_session_id where s.session_token='tokA'`)).rows[0].c === "2", "aynı auth oturumu → 2 ayrı kullanım ziyareti");
    ok((await su.query(`select count(*) c from public.expert_usage_events where action is not null`)).rows[0].c === "0", "ping'ler ham olay satırı ÜRETMEDİ");
    // 8 saat açık sekme: son etkileşimden sonra istemci ping atmaz; sunucu tarafında tek geç ping en fazla 30 sn yazar.
    await rewind("tokA", 20 * 60);
    const before8 = (await visit("tokA")).active_seconds;
    await ping(U1, T1, "tokA", null);
    ok((await visit("tokA")).active_seconds - before8 <= 30, "uzun boşluk sonrası tek ping ≤30 sn kredi (boşluk süresi yazılmaz)");
    ok(await ping(U1, T1, "tokOld", null) === "rejected", "pasif (kapatılmış) auth oturumu ile ping → rejected");

    console.log("\n[7] modül geçişinde süre ÖNCEKİ modüle");
    ok(await ping(U1, T1, "tokB", "reflexology") === "new_visit", "tokB: refleksolojide yeni ziyaret");
    await rewind("tokB", 60);
    ok(await track({ token: "tokB", module: "numerology", action: "module_opened", source: "client" }) === "ok", "numerolojiye geçiş (module_opened) → ok");
    const mods = async () => Object.fromEntries((await su.query(`select module_key, sum(active_seconds)::int s from public.usage_daily_modules where user_id=$1 group by 1`, [U1])).rows.map((r) => [r.module_key, r.s]));
    let m = await mods();
    ok(m.reflexology >= 60 && m.reflexology <= 61 && !m.numerology, `geçişteki 60 sn → reflexology (numerology'ye DEĞİL) [ref=${m.reflexology}]`);
    await rewind("tokB", 60);
    await ping(U1, T1, "tokB", "numerology");
    m = await mods();
    ok(m.numerology >= 60 && m.numerology <= 61 && m.reflexology <= 61, "sonraki ping kredisi → numerology");
    await rewind("tokB", 60);
    await ping(U1, T1, "tokB", null); // hub'a döndü: bu aralık hâlâ numerology'de geçti
    m = await mods();
    ok(m.numerology >= 120 && m.numerology <= 122, "hub'a dönüşte önceki aralık numerology'ye yazılır");
    await rewind("tokB", 60);
    await ping(U1, T1, "tokB", null); // hub'da geçen süre hiçbir modüle yazılmaz
    m = await mods();
    const vb = await visit("tokB");
    ok(m.numerology <= 122 && vb.active_seconds >= 240 && vb.active_seconds <= 243, `hub süresi yalnız toplamda (visit active=${vb.active_seconds})`);
    ok(await track({ token: "tokB", module: "numerology", action: "module_opened", source: "client" }) === "deduped", "aynı ziyarette aynı modül tekrar açılışı → deduped");
    ok((await visit("tokB")).module_open_count === 1, "module_open_count tekrar artmaz");
    const vbId = (await visit("tokB")).id;
    await rewind("tokB", 31 * 60);
    ok(await track({ token: "tokB", module: "numerology", action: "module_opened", source: "client" }) === "ok", "31 dk sonra aynı modülde devam (module_opened) → yeni ziyarette yeniden sayılır");
    const vb2 = await visit("tokB");
    ok(vb2.id !== vbId && vb2.module_open_count === 1 && vb2.active_module_key === "numerology" && vb2.active_seconds === 0, "yeni ziyaret: açılış=1, aktif modül numerology, kredi 0 (boşluk yazılmaz)");

    console.log("\n[T] olaylar / idempotency / reddetmeler");
    ok(await track({ idem: hex64("a"), sub: "stone", legacy: "record_created" }) === "ok", "sunucu record_created → ok");
    ok(await track({ idem: hex64("a"), sub: "stone", legacy: "record_created" }) === "deduped", "[20] aynı idem hash → deduped (sayaç artmaz)");
    ok(await track({ token: null, idem: hex64("b"), action: "record_updated" }) === "ok", "token'sız sunucu olayı → ok (ziyaretsiz)");
    ok((await su.query(`select visit_id from public.expert_usage_events where idempotency_key=$1`, [hex64("b")])).rows[0].visit_id === null, "token'sız olay visit_id NULL");
    ok(await track({ action: "action_failed", err: "server", failed: "report_generated" }) === "ok", "action_failed + sınıf → ok");
    ok(await track({ action: "action_failed" }) === "rejected", "action_failed sınıfsız → rejected");
    ok(await track({ action: "record_created", err: "server" }) === "rejected", "başarılı eylemde hata sınıfı → rejected");
    ok(await track({ source: "client", action: "record_created" }) === "rejected", "[14] istemci record_created → rejected");
    ok(await track({ source: "client", action: "report_exported", token: null }) === "rejected", "istemci olayı auth oturumsuz → rejected");
    ok(await track({ action: "bogus" }) === "rejected" && await track({ module: "bogus" }) === "rejected", "enum dışı eylem/modül → rejected (istisna yok)");
    ok(await track({ idem: "not-a-hash" }) === "rejected", "idem yalnız 64 hex (ham id kabul edilmez)");
    ok(await track({ legacy: "bogus_event" }) === "rejected", "geçersiz eski olay türü → rejected");
    ok(await track({ ctx: ["desktop_web", "windows", "chrome", "1.0", "TUR", null] }) === "rejected", "geçersiz ülke kodu → rejected");

    console.log("\n[15] kullanıcı / tenant spoof");
    ok(await track({ tenant: T2 }) === "rejected", "U1 + başka tenant (T2) → rejected");
    ok(await track({ token: "tok2" }) === "rejected", "U1 + başka kullanıcının token'ı → rejected");
    ok(await ping(U1, T2, "tokA", null) === "rejected", "ping: U1 + T2 → rejected");
    ok(await ping(U2, T2, "tokA", null) === "rejected", "ping: U2 + U1'in token'ı → rejected");
    ok(await ping("99999999-9999-9999-9999-999999999999", T1, "tokA", null) === "noop", "bilinmeyen kullanıcı → noop");

    console.log("\n[16-17] admin / demo no-op");
    ok(await ping(U4, T1, "tok4", "numerology") === "noop" && await track({ user: U4, token: "tok4" }) === "noop", "admin → noop (ping + olay)");
    ok(await ping(U3, T1, "tok3", "numerology") === "noop" && await track({ user: U3, token: "tok3" }) === "noop", "demo → noop (ping + olay)");
    const leak = (await su.query(`select
        (select count(*) from public.usage_visits where user_id = any($1)) v,
        (select count(*) from public.usage_daily where user_id = any($1)) d,
        (select count(*) from public.usage_daily_modules where user_id = any($1)) m,
        (select count(*) from public.expert_usage_events where user_id = any($1)) e`, [[U3, U4]])).rows[0];
    ok(leak.v === "0" && leak.d === "0" && leak.m === "0" && leak.e === "0", "admin/demo için HİÇBİR tabloda satır yok");
    ok((await su.query(`select count(*) c from public.usage_daily where user_id=$1`, [U2])).rows[0].c === "0", "başarısız spoof denemeleri U2 adına veri üretmedi");

    console.log("\n[21] rollup çift sayım invariantları");
    const tot = (await su.query(`select coalesce(sum(visits),0)::int visits, coalesce(sum(active_seconds),0)::int act, coalesce(sum(creates),0)::int creates,
        coalesce(sum(updates),0)::int updates, coalesce(sum(failures),0)::int failures, coalesce(sum(module_opens),0)::int opens
        from public.usage_daily where user_id=$1`, [U1])).rows[0];
    const mod = (await su.query(`select coalesce(sum(active_seconds),0)::int act, coalesce(sum(creates),0)::int creates, coalesce(sum(updates),0)::int updates,
        coalesce(sum(failures),0)::int failures, coalesce(sum(module_opens),0)::int opens from public.usage_daily_modules where user_id=$1`, [U1])).rows[0];
    const ev = (await su.query(`select count(*) filter (where action='record_created')::int creates, count(*) filter (where action='record_updated')::int updates,
        count(*) filter (where action='action_failed')::int failures, count(*) filter (where action='module_opened')::int opens
        from public.expert_usage_events where user_id=$1 and action is not null`, [U1])).rows[0];
    const nVisits = Number((await su.query(`select count(*) c from public.usage_visits where user_id=$1`, [U1])).rows[0].c);
    const sumVisitActive = Number((await su.query(`select sum(active_seconds) s from public.usage_visits where user_id=$1`, [U1])).rows[0].s);
    ok(tot.visits === nVisits, `Σ usage_daily.visits (${tot.visits}) = ziyaret satırı sayısı (${nVisits})`);
    ok(tot.act === sumVisitActive, `Σ usage_daily.active_seconds (${tot.act}) = Σ ziyaret aktif süresi (${sumVisitActive})`);
    ok(tot.creates === ev.creates && mod.creates === ev.creates && tot.updates === ev.updates && mod.updates === ev.updates && tot.failures === ev.failures && mod.failures === ev.failures,
      "işlem sayaçları: toplam tablo = modül tablosu = ham olay (çift sayım yok)");
    ok(tot.opens === ev.opens && mod.opens === ev.opens, "modül açılışı: toplam = modül = ham olay");
    ok(mod.act <= tot.act, `modül aktif süresi (${mod.act}) ≤ toplam (${tot.act}) — hub süresi yalnız toplamda`);
    ok(!(await su.query(`select column_name from information_schema.columns where table_name='usage_daily' and column_name='module_key'`)).rowCount,
      "toplam tablo modül kolonu taşımaz → toplam+modül satırı aynı SUM'da karışamaz (yapısal)");
    const dd = (await su.query(`select day_tr::text d, hour_mask from public.usage_daily where user_id=$1 limit 1`, [U1])).rows[0];
    const today = (await su.query(`select public.usage360_day_tr(now())::text d, public.usage360_hour_tr(now()) h`)).rows[0];
    ok(dd.d === today.d && (dd.hour_mask & (1 << today.h)) !== 0, "rollup TR günü + saat bitmask'i");

    console.log("\n[2B-] eski okuma RPC'leri");
    const sum = Object.fromEntries((await su.query(`select module_key, event_count from public.expert_usage_summary($1,null,null)`, [T1])).rows.map((r) => [r.module_key, Number(r.event_count)]));
    ok(!sum.reflexology || sum.reflexology === 1, "summary: module_opened / action_failed 'Ölçülen işlem'e karışmaz");
    ok(sum.numerology === 1, "summary: numerology yalnız eski analiz olayı (module_opened sayılmaz)");
    const act = (await su.query(`select * from public.expert_activity_stats($1,null,null)`, [U1])).rows[0];
    ok(Number(act.active_days) >= 2 && Number(act.session_count) === 5, `expert_activity_stats: active_days = giriş yapılan TR günleri (${act.active_days}); tüm zamanlar giriş = 5`);
    const act2 = (await su.query(`select active_days from public.expert_activity_stats($1,'2027-01-10T00:00:00Z','2027-01-12T00:00:00Z')`, [U1])).rows[0];
    ok(Number(act2.active_days) === 2, "aralıkta giriş günleri: 10 ve 11 Ocak → 2 (last_seen'e bakılmaz)");

    console.log("\n[AO] append-only korunur");
    ok(await errCode(() => callAs("service_role", `delete from public.expert_usage_events`)) === "42501", "service_role DELETE → 42501 (yetki yok)");
    ok(await errCode(() => callAs("service_role", `update public.expert_usage_events set module_key='stones'`)) === "42501", "service_role UPDATE → 42501");
    ok(await errCode(() => su.query(`delete from public.expert_usage_events`)) !== null, "sahip bile retention bağlamı olmadan DELETE edemez (trigger)");
    ok(await errCode(async () => { await su.query("begin"); await su.query(`set local yasam.usage_retention_purge = 'on'`); try { await su.query(`update public.expert_usage_events set module_key='stones'`); } finally { await su.query("rollback"); } }) !== null,
      "retention bağlamında bile UPDATE yasak");

    console.log("\n[RET] retention (180 g / 180 g / 25 ay)");
    await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,action,source,day_tr,occurred_at) values
      ($1,$2,'stones','record_created','server','2026-01-01', now() - interval '200 days')`, [T1, U1]);
    await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,event_type,occurred_at) values
      ($1,$2,'stones','record_created', now() - interval '400 days')`, [T1, U1]);
    const sidA = (await su.query(`select id from public.user_sessions where session_token='tokA'`)).rows[0].id;
    await su.query(`insert into public.usage_visits(user_id,tenant_id,auth_session_id,started_at,last_active_at,channel,os_family,browser_family,day_tr)
      values ($1,$2,$3, now()-interval '200 days', now()-interval '200 days','desktop_web','windows','chrome','2026-01-01')`, [U1, T1, sidA]);
    await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,first_at,last_at) values ($1,$2,(current_date - interval '26 months')::date,'desktop_web',now(),now())`, [U1, T1]);
    await su.query(`insert into public.usage_daily_modules(user_id,tenant_id,day_tr,module_key,channel,first_at,last_at) values ($1,$2,(current_date - interval '26 months')::date,'stones','desktop_web',now(),now())`, [U1, T1]);
    const counts = async () => (await su.query(`select (select count(*) from public.expert_usage_events)::int e, (select count(*) from public.usage_visits)::int v,
        (select count(*) from public.usage_daily)::int d, (select count(*) from public.usage_daily_modules)::int m`)).rows[0];
    const c0 = await counts();
    const dry = (await callAs("service_role", `select public.usage360_retention_purge() r`)).rows[0].r;
    ok(dry.dry_run === true && dry.events === 1 && dry.visits === 1 && dry.daily === 1 && dry.daily_modules === 1, "dry-run (varsayılan) doğru sayar");
    ok(JSON.stringify(await counts()) === JSON.stringify(c0), "dry-run hiçbir şey silmez");
    ok(await errCode(() => callAs("authenticated", `select public.usage360_retention_purge(false)`)) === "42501", "authenticated purge çağıramaz");
    const real = (await callAs("service_role", `select public.usage360_retention_purge(false) r`)).rows[0].r;
    const c1 = await counts();
    ok(real.events === 1 && c1.e === c0.e - 1 && c1.v === c0.v - 1 && c1.d === c0.d - 1 && c1.m === c0.m - 1, "gerçek purge yalnız süresi dolanları siler");
    ok((await su.query(`select count(*) c from public.expert_usage_events where action is null and occurred_at < now() - interval '300 days'`)).rows[0].c === "1", "eski (AŞAMA 1 öncesi) satırlara dokunulmaz");
    ok(await errCode(() => su.query(`delete from public.expert_usage_events where action is not null`)) !== null, "purge sonrası retention bağlamı kapanır (append-only geri gelir)");

    console.log("\n[22] sentinel sızıntı testi");
    // İş verisi gibi davranan tüm metin alanlarına sentinel denemesi: hepsi reddedilir.
    const sentinelTries = [
      await track({ sub: SENTINEL }), await track({ idem: SENTINEL }), await track({ module: SENTINEL }),
      await track({ action: SENTINEL }), await track({ legacy: SENTINEL }),
      await track({ ctx: ["desktop_web", "windows", "chrome", SENTINEL, "TR", null] }),
      await ping(U1, T1, "tokA", SENTINEL),
    ];
    ok(sentinelTries.every((r) => r === "rejected"), "sentinel içeren tüm alanlar → rejected");
    const dump = (await su.query(`select
        coalesce((select string_agg(row_to_json(e)::text, '') from public.expert_usage_events e), '') ||
        coalesce((select string_agg(row_to_json(v)::text, '') from public.usage_visits v), '') ||
        coalesce((select string_agg(row_to_json(d)::text, '') from public.usage_daily d), '') ||
        coalesce((select string_agg(row_to_json(m)::text, '') from public.usage_daily_modules m), '') t`)).rows[0].t;
    ok(!dump.includes(SENTINEL) && !dump.includes("SENTINEL"), "expert_usage_events / usage_visits / usage_daily / usage_daily_modules içinde sentinel YOK");
    ok(!/tokA|tokB|session_token/.test(dump), "telemetri satırlarında oturum token'ı YOK");

    console.log("\n[perf] index / EXPLAIN (sentetik hacim)");
    await su.query(`insert into public.usage_visits(user_id,tenant_id,auth_session_id,started_at,last_active_at,channel,os_family,browser_family,day_tr)
      select gen_random_uuid(), $1, gen_random_uuid(), now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval,
             'desktop_web','windows','chrome', current_date from generate_series(1, 20000) g`, [T1]);
    await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,first_at,last_at)
      select gen_random_uuid(), $1, current_date - (g % 700), 'desktop_web', now(), now() from generate_series(1, 20000) g`, [T1]);
    await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,action,source,day_tr,occurred_at)
      select $1, gen_random_uuid(), 'stones','record_created','server', current_date, now() - (g || ' seconds')::interval from generate_series(1, 20000) g`, [T1]);
    await su.query(`analyze public.usage_visits; analyze public.usage_daily; analyze public.expert_usage_events;`);
    const plan = async (q, p) => (await su.query(`explain ${q}`, p)).rows.map((r) => r["QUERY PLAN"]).join("\n");
    const p1 = await plan(`select id, last_active_at from public.usage_visits where auth_session_id = $1 order by last_active_at desc limit 1`, [sidA]);
    ok(/idx_usage_visits_session_active/.test(p1) && !/Seq Scan/.test(p1), "ziyaret araması (her ping) → idx_usage_visits_session_active, seq scan yok");
    const p2 = await plan(`select * from public.usage_daily where user_id = $1 and day_tr between current_date - 30 and current_date`, [U1]);
    ok(/usage_daily_pkey/.test(p2) && !/Seq Scan/.test(p2), "kullanıcı×dönem rollup okuması → PK index");
    const p3 = await plan(`select * from public.expert_usage_events where user_id = $1 order by occurred_at desc limit 50`, [U1]);
    ok(/idx_expert_usage_user_occurred/.test(p3) && !/Seq Scan/.test(p3), "kullanıcı zaman çizelgesi → idx_expert_usage_user_occurred");
    const p4 = await plan(`select count(*) from public.usage_visits where last_active_at < now() - interval '180 days'`);
    ok(/idx_usage_visits_last_active/.test(p4), "retention taraması → idx_usage_visits_last_active");
  } finally {
    await su.end();
    await epg.stop();
    console.log("embedded-postgres durduruldu.");
  }
  console.log(`\n──────────\nUSAGE360 GERÇEK PG: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("HARNESS HATASI:", e.message); process.exit(1); });
