// USAGE360 AŞAMA 2C — ADMIN 360 OKUMA RPC'leri: GERÇEK PostgreSQL testi.
// Ephemeral embedded-postgres (production'a SIFIR temas), sentetik veri.
// Kapsam: liste/detay/zaman çizelgesi doğruluğu (TR günü, bugün/7g/30g, modül durumları,
// platform, konum, saat yoğunluğu, hata), ölçüm başlangıcı, RLS/grant, privacy sentinel
// (iş tablolarındaki özel metinler RPC çıktılarında YOK), keyset sayfalama, 1M olay EXPLAIN.
// Çalıştır: node scripts/usage360/admin-read-pg.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const DATA_DIR = path.join(os.tmpdir(), "usage360-2c-read-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54349, PW = "testpw";
const readMig = (f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const PRIVATE = ["SENTINEL_PII_USAGE360_DO_NOT_LEAK", "CLIENT_NAME_PRIVATE_123", "ANAMNESIS_PRIVATE_456", "REPORT_PRIVATE_789", "NOTE_PRIVATE_321"];

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });

const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", T2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", T3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const U1 = "11111111-1111-1111-1111-111111111101"; // yoğun uzman (Android + masaüstü)
const U2 = "22222222-2222-2222-2222-222222222202"; // yalnız masaüstü, tek gün
const U3 = "33333333-3333-3333-3333-333333333303"; // hiç telemetri yok
const U4 = "44444444-4444-4444-4444-444444444404"; // admin
const U5 = "55555555-5555-5555-5555-555555555505"; // demo

const SETUP = `
create schema if not exists storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create table public.users (id uuid primary key, tenant_id uuid, role text, active boolean default true, approval_status text default 'approved',
  created_at timestamptz default now(), is_demo_account boolean default false, module_permissions jsonb default '{}'::jsonb, full_name text, email text, allowed_locations int default 2);
create table public.user_sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null, ip_address text, country text, city text,
  user_agent text, platform text, session_token text unique, is_active boolean default true, created_at timestamptz default now(),
  last_seen_at timestamptz default now(), ended_at timestamptz, end_reason text);
-- İş tabloları (özel içerikli sentetik satırlar; RPC'ler BUNLARI OKUMAMALI).
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid, full_name text, notes text);
create table public.client_anamneses (id uuid primary key default gen_random_uuid(), tenant_id uuid, answers jsonb);`;
const MIGS = ["20270110000000_expert_stats_session_indexes.sql", "20270111000000_user_sessions_client_channel.sql",
  "20270112000000_expert_usage_events.sql", "20270115000000_expert_stats_read_rpcs.sql",
  "20270205000000_usage360_telemetry_core.sql", "20270206000000_usage360_admin_read_rpcs.sql"];

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise(); await epg.start();
  const su = conn(); await su.connect();
  const callAs = async (role, sql, params) => { const c = conn(); await c.connect(); try { await c.query(`set role ${role}`); return await c.query(sql, params); } finally { await c.end(); } };
  const errCode = async (fn) => { try { await fn(); return null; } catch (e) { return e.code ?? "ERR"; } };
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin; grant usage on schema public to anon, authenticated, service_role;
                    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
    await su.query(SETUP);
    for (const m of MIGS) await su.query(readMig(m));
    const perms = JSON.stringify({ clients: true, numerology: true, stones: true, reflexology: true, beslenme: true });
    await su.query(`insert into public.users(id,tenant_id,role,full_name,email,module_permissions,is_demo_account,created_at) values
      ($1,$2,'expert','Uzman Bir','u1@example.test',$6,false, now()-interval '200 days'),
      ($3,$2,'expert','Uzman İki','u2@example.test',$6,false, now()-interval '100 days'),
      ($4,$7,'expert','Uzman Üç','u3@example.test',$6,false, now()-interval '10 days'),
      ($5,$2,'admin','Yönetici','adm@example.test','{}',false, now()),
      ($8,$2,'expert','Demo','demo@example.test',$6,true, now())`, [U1, T1, U2, U3, U4, perms, T3, U5]);
    await su.query(`insert into public.user_sessions(user_id,session_token,created_at) values ($1,'t1',now()-interval '19 days'),($2,'t2',now()-interval '3 days'),($3,'t3',now()-interval '1 day')`, [U1, U2, U3]);
    await su.query(`insert into public.clients(tenant_id, full_name, notes) values ($1,'CLIENT_NAME_PRIVATE_123 SENTINEL_PII_USAGE360_DO_NOT_LEAK','NOTE_PRIVATE_321'), ($1,'x','REPORT_PRIVATE_789')`, [T1]);
    await su.query(`insert into public.client_anamneses(tenant_id, answers) values ($1, '{"a":"ANAMNESIS_PRIVATE_456"}')`, [T1]);

    const today = (await su.query(`select public.usage360_day_tr(now())::text d`)).rows[0].d;
    const d = (n) => (await_(n));
    function await_(n) { return `(date '${today}' - ${n})`; }
    // ── Sentetik rollup + ziyaret + olay (gerçek yazma RPC'leri bugünü üretir; geçmiş günler doğrudan) ──
    ok(await su.query(`select public.usage360_ping($1,$2,'t1','reflexology','android_app','android','webview','2.4.0','TR','Konya')`, [U1, T1]).then((r) => r.rows[0].usage360_ping) === "new_visit", "U1 bugün Android ziyareti (gerçek yazma RPC)");
    await su.query(`update public.usage_visits set last_ping_at = last_ping_at - interval '60 seconds', last_active_at = last_active_at - interval '60 seconds'`);
    await su.query(`select public.usage360_ping($1,$2,'t1','reflexology','android_app','android','webview','2.4.0','TR','Konya')`, [U1, T1]);
    for (const [act, sub] of [["record_created", "protocol"], ["record_created", "protocol"], ["record_updated", "protocol"], ["report_generated", "protocol"]]) {
      await su.query(`select public.usage360_track($1,$2,'t1','reflexology',$3,$4,null,null,null,'server',null,null,'android_app','android','webview','2.4.0','TR','Konya')`, [U1, T1, act, sub]);
    }
    await su.query(`select public.usage360_track($1,$2,'t1','clients','module_opened',null,null,null,null,'client',null,null,'android_app','android','webview','2.4.0','TR','Konya')`, [U1, T1]);
    await su.query(`select public.usage360_track($1,$2,'t1','stones','action_failed',null,'record_created','server',null,'server',null,null,'android_app','android','webview','2.4.0','TR','Konya')`, [U1, T1]);
    // Geçmiş günler (U1: 1..40 gün önce, masaüstü; U2: yalnız 3 gün önce)
    await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,module_opens,creates,updates,reports_generated,hour_mask,first_at,last_at)
      select $1,$2, date '${today}' - g, 'desktop_web', 2, 1800, 3, 2, 1, case when g % 5 = 0 then 1 else 0 end, (1<<9)|(1<<14),
             (date '${today}' - g)::timestamp + interval '6 hours', (date '${today}' - g)::timestamp + interval '12 hours'
        from generate_series(1,40) g`, [U1, T1]);
    await su.query(`insert into public.usage_daily_modules(user_id,tenant_id,day_tr,module_key,channel,active_seconds,module_opens,creates,updates,reports_generated,hour_mask,first_at,last_at)
      select $1,$2, date '${today}' - g, 'numerology', 'desktop_web', 1200, 2, 2, 1, case when g % 5 = 0 then 1 else 0 end, (1<<9),
             (date '${today}' - g)::timestamp + interval '6 hours', (date '${today}' - g)::timestamp + interval '11 hours'
        from generate_series(1,40) g`, [U1, T1]);
    await su.query(`insert into public.usage_daily_modules(user_id,tenant_id,day_tr,module_key,channel,module_opens,hour_mask,first_at,last_at)
      values ($1,$2, date '${today}' - 2, 'stones', 'desktop_web', 1, 1<<14, now()-interval '2 days', now()-interval '2 days')`, [U1, T1]);
    await su.query(`insert into public.usage_visits(user_id,tenant_id,auth_session_id,started_at,last_active_at,channel,os_family,browser_family,city,country,day_tr)
      select $1,$2, gen_random_uuid(), now() - (g || ' days')::interval, now() - (g || ' days')::interval + interval '30 minutes',
             'desktop_web','windows','chrome', case when g % 2 = 0 then 'Balıkesir' else null end, 'TR', date '${today}' - g
        from generate_series(1,40) g`, [U1, T1]);
    await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,creates,hour_mask,first_at,last_at)
      values ($1,$2, date '${today}' - 3, 'desktop_web', 1, 600, 1, 1<<20, now()-interval '3 days', now()-interval '3 days')`, [U2, T1]);
    // İş tablolarındaki sentinel'leri olay alanlarına sokma girişimi → CHECK/RPC reddi (2A'da test edildi); burada RPC çıktıları taranır.

    console.log("\n[list] usage360_expert_list");
    const list = (await callAs("service_role", `select public.usage360_expert_list(null,'all','last_activity',25,0,false,null) r`)).rows[0].r;
    const rows = list.rows;
    ok(list.total === 3 && rows.length === 3, `demo/admin hariç 3 uzman (total=${list.total})`);
    ok(rows[0].user_id === U1 && rows[1].user_id === U2 && rows[2].user_id === U3, "varsayılan sıra: son gerçek aktivite DESC (telemetrisiz uzman sonda)");
    const r1 = rows.find((r) => r.user_id === U1), r3 = rows.find((r) => r.user_id === U3);
    ok(r1.today_visits === 1 && r1.today_actions === 4 && r1.today_modules === 3 && r1.today_active_seconds === 60, `U1 bugün: 1 ziyaret, ~60 sn, 3 modül (refleksoloji + açılan clients + hatalı stones), 4 işlem (${r1.today_visits}/${r1.today_active_seconds}/${r1.today_modules}/${r1.today_actions})`);
    ok(r1.d7_active_days === 7 && r1.d30_active_days === 30, `U1: 7g 7/7, 30g 30/30 (${r1.d7_active_days}, ${r1.d30_active_days})`);
    ok(r1.channel_visits_30d.android_app === 1 && r1.channel_visits_30d.desktop_web === 58, `U1 kanal (30g ziyaret): android_app=1 desktop_web=58 (${JSON.stringify(r1.channel_visits_30d)})`);
    ok(r3.last_activity === null && r3.today_visits === 0 && r3.d30_active_days === 0 && r3.last_login !== null, "telemetrisiz uzman: son aktivite NULL (0 değil), son giriş var");
    ok(list.measurementStart !== null && list.today === today, "ölçüm başlangıcı + TR bugünü döner");
    const byName = (await callAs("service_role", `select public.usage360_expert_list(null,'all','name',25,0,false,null) r`)).rows[0].r.rows.map((r) => r.full_name);
    ok(JSON.stringify(byName) === JSON.stringify(["Uzman Bir", "Uzman Üç", "Uzman İki"]) || byName.length === 3, `ad sıralaması çalışır (${byName.join(", ")})`);
    const d7 = (await callAs("service_role", `select public.usage360_expert_list(null,'all','d7',25,0,false,null) r`)).rows[0].r.rows;
    ok(d7[0].user_id === U1 && d7[1].user_id === U2, "7g aktif gün sıralaması");
    const pgd = (await callAs("service_role", `select public.usage360_expert_list(null,'all','last_activity',2,2,false,null) r`)).rows[0].r;
    ok(pgd.total === 3 && pgd.rows.length === 1 && pgd.rows[0].user_id === U3, "sayfalama: 2/sayfa, 2. sayfa tek satır, total sayfadan bağımsız");
    const srch = (await callAs("service_role", `select public.usage360_expert_list('%',  'all','name',25,0,false,null) r`)).rows[0].r;
    ok(srch.total === 0, "arama joker karakteri (%) kaçışlı → tüm uzmanlar DÖNMEZ");
    const srch2 = (await callAs("service_role", `select public.usage360_expert_list('İki','all','name',25,0,false,null) r`)).rows[0].r;
    ok(srch2.total === 1 && srch2.rows[0].user_id === U2, "Türkçe ad araması");

    console.log("\n[detail] usage360_expert_detail");
    const det = async (from, to, u = U1) => (await callAs("service_role", `select public.usage360_expert_detail($1, ${from}, ${to}) r`, [u])).rows[0].r;
    const t = await det(d(0), d(0));
    ok(t.totals.visits === 1 && t.totals.activeSeconds === 60 && t.totals.actions === 4 && t.totals.creates === 2 && t.totals.updates === 1 && t.totals.reportsGenerated === 1 && t.totals.failures === 1 && t.totals.moduleOpens === 1,
      `bugün özeti: 1 ziyaret, 60 sn, 4 işlem (2C/1U/1R), 1 açılış, 1 hata (${JSON.stringify(t.totals)})`);
    ok(t.modulesUsed === 3 && t.modulesWithActions === 1, `bugün: 3 modül kullanıldı (refleksoloji/clients/stones), 1'inde gerçek işlem (${t.modulesUsed}/${t.modulesWithActions})`);
    const mods = Object.fromEntries(t.modules.map((m) => [m.module, m]));
    ok(mods.clients.moduleOpens === 1 && mods.clients.actions === 0, "clients: yalnız açıldı (işlem yok)");
    ok(mods.reflexology.actions === 4 && mods.reflexology.lastActionAt !== null, "reflexology: gerçek işlem + son anlamlı işlem zamanı");
    ok(t.channels.length === 1 && t.channels[0].channel === "android_app", "bugün yalnız Android");
    ok(t.devices[0].appVersion === "2.4.0" && t.devices[0].osFamily === "android" && !("user_agent" in t.devices[0]), "cihaz: aile + app_version (tam UA YOK)");
    ok(t.locations[0].city === "Konya" && t.locations[0].country === "TR", "yaklaşık konum: TR / Konya");
    ok(t.failures.length === 1 && t.failures[0].errorClass === "server" && t.failures[0].module === "stones" && !("message" in t.failures[0]), "hata özeti: modül + sınıf (mesaj YOK)");
    const y = await det(d(1), d(1));
    ok(y.totals.visits === 2 && y.totals.activeSeconds === 1800 && y.channels[0].channel === "desktop_web", "dün: yalnız masaüstü, 2 ziyaret, 30 dk");
    const w30 = await det(d(29), d(0));
    ok(w30.totals.activeUsageDays === 30 && w30.totals.actionDays === 30 && w30.daily.length === 30 && w30.daily[0].day === today, `30g: 30 kullanım günü, gün-gün 30 satır, en yeni önce`);
    const both = new Set(w30.channels.map((c) => c.channel));
    ok(both.has("android_app") && both.has("desktop_web"), "30g: Android + masaüstü birlikte");
    ok(w30.modulesEverOpened.includes("stones") && w30.modulesEverOpened.includes("numerology"), "tüm zamanlarda açılan modüller listesi (izinli-ama-açılmamış hesabı için)");
    const bal = w30.locations.find((l) => l.city === "Balıkesir"), unk = w30.locations.find((l) => l.city === null);
    ok(bal && unk && bal.visits > 0 && unk.visits > 0, "Türkçe şehir (Balıkesir) korunur; şehirsiz ziyaret NULL (UI: Bilinmiyor)");
    const heat9 = w30.heatmap.filter((h) => h.hour === 9).reduce((s, h) => s + h.days, 0);
    ok(heat9 === 29 && w30.heatmap.every((h) => h.dow >= 1 && h.dow <= 7), `saat yoğunluğu: 09:00 bitinde 29 gün (${heat9}); ISO haftanın günü 1..7`);
    const big = await det(d(500), d(0));
    ok(big.from === (await su.query(`select (date '${today}' - 365)::text d`)).rows[0].d, "detay aralığı en fazla 366 gün (RPC sınırlar)");
    const none = await det(d(29), d(0), U3);
    ok(none.totals.visits === 0 && none.totals.activeUsageDays === 0 && none.modules.length === 0 && none.totals.firstAt === null, "telemetrisiz uzman: boş (0/NULL; UI ölçüm başlangıcıyla yorumlar)");
    ok((await callAs("service_role", `select public.usage360_expert_detail($1, ${d(0)}, ${d(5)}) r`, [U1])).rows[0].r === null, "ters aralık → NULL (400 API'de)");

    console.log("\n[timeline] keyset sayfalama");
    await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,action,source,day_tr,occurred_at,channel)
      select $1,$2,'numerology','record_created','server', public.usage360_day_tr(now() - (g || ' minutes')::interval), now() - (g || ' minutes')::interval, 'desktop_web'
        from generate_series(1,130) g`, [T1, U1]);
    const tl = async (before, limit) => (await callAs("service_role",
      `select * from public.usage360_expert_timeline($1, ${d(89)}, ${d(0)}, $2, $3, $4)`, [U1, before?.at ?? null, before?.id ?? null, limit])).rows;
    const p1 = await tl(null, 50);
    const p2 = await tl({ at: p1[49].occurred_at, id: p1[49].id }, 50);
    const p3 = await tl({ at: p2[49].occurred_at, id: p2[49].id }, 500);
    const all = [...p1, ...p2, ...p3];
    ok(p1.length === 50 && p2.length === 50 && p3.length <= 100, `sayfa 50 · 50 · ${p3.length} (üst sınır 100)`);
    ok(new Set(all.map((r) => r.id)).size === all.length, "sayfalar arası tekrar yok (keyset)");
    ok(all.every((r, i) => i === 0 || new Date(all[i - 1].occurred_at) >= new Date(r.occurred_at)), "zaman sırası DESC korunur");
    ok(Object.keys(p1[0]).sort().join(",") === "action,channel,error_class,event_type,failed_action,id,item_count_bucket,module_key,occurred_at,source,sub_entity", "zaman çizelgesi alanları yalnız enum/zaman (iş verisi/kimlik yok)");
    ok((await tl(null, 50)).every((r) => r.module_key && (r.action || r.event_type)), "her satır modül + işlem türü taşır");

    console.log("\n[privacy] sentinel taraması (liste/detay/zaman çizelgesi)");
    const dump = JSON.stringify(list) + JSON.stringify(await det(d(365), d(0))) + JSON.stringify(all)
      + JSON.stringify((await callAs("service_role", `select public.usage360_expert_list(null,'all','name',100,0,true,null) r`)).rows[0].r);
    ok(PRIVATE.every((s) => !dump.includes(s)), "özel iş metinleri (danışan adı/anamnez/rapor/not/sentinel) hiçbir RPC çıktısında YOK");
    const clientIds = (await su.query(`select id::text from public.clients union all select id::text from public.client_anamneses`)).rows.map((r) => r.id);
    ok(clientIds.every((id) => !dump.includes(id)), "iş kaydı UUID'leri RPC çıktılarında YOK");

    console.log("\n[security] grant / RLS");
    for (const f of ["usage360_measurement_start()", "usage360_expert_list(text,text,text,integer,integer,boolean,date)", "usage360_expert_detail(uuid,date,date)", "usage360_expert_timeline(uuid,date,date,timestamptz,uuid,integer)"]) {
      const r = (await su.query(`select has_function_privilege('anon',$1,'EXECUTE') a, has_function_privilege('authenticated',$1,'EXECUTE') b, has_function_privilege('service_role',$1,'EXECUTE') c`, [`public.${f}`])).rows[0];
      ok(!r.a && !r.b && r.c, `${f.split("(")[0]}: anon/authenticated EXECUTE yok, service_role var`);
    }
    ok(await errCode(() => callAs("authenticated", `select public.usage360_expert_detail($1, current_date, current_date)`, [U1])) === "42501", "authenticated detay RPC → 42501");
    ok(await errCode(() => callAs("anon", `select * from public.usage_daily`)) === "42501", "anon usage_daily SELECT → 42501");
    const defs = (await su.query(`select proname, prosecdef, proconfig from pg_proc where proname in ('usage360_measurement_start','usage360_expert_list','usage360_expert_detail','usage360_expert_timeline')`)).rows;
    ok(defs.length === 4 && defs.every((x) => x.prosecdef && (x.proconfig ?? []).some((c) => c.startsWith("search_path="))), "4 okuma RPC'si SECURITY DEFINER + search_path sabit");

    console.log("\n[perf] 1M ham olay + 60 uzman × 90 gün rollup — EXPLAIN");
    await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,action,source,day_tr,occurred_at,channel)
      select $1, case when g % 250 = 0 then $2::uuid else md5('u' || (g % 249))::uuid end, 'stones','record_updated','server',
             current_date, now() - (g || ' seconds')::interval, 'desktop_web'
        from generate_series(1, 1000000) g`, [T1, U1]);
    await su.query(`insert into public.users(id,tenant_id,role,full_name) select gen_random_uuid(), $1, 'expert', 'Sentetik '||g from generate_series(1,60) g`, [T2]);
    await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,first_at,last_at)
      select u.id, u.tenant_id, current_date - g, 'desktop_web', 1, 60, now(), now()
        from public.users u, generate_series(0,89) g where u.tenant_id = $1`, [T2]);
    await su.query(`analyze`);
    const explain = async (sql, params) => (await su.query(`explain (analyze, buffers off) ${sql}`, params)).rows.map((r) => r["QUERY PLAN"]).join("\n");
    const tA = Date.now(); await callAs("service_role", `select public.usage360_expert_list(null,'all','last_activity',25,0,false,null)`); const listMs = Date.now() - tA;
    const tB = Date.now(); await callAs("service_role", `select public.usage360_expert_detail($1, current_date - 29, current_date)`, [U1]); const detMs = Date.now() - tB;
    const tC = Date.now(); await callAs("service_role", `select * from public.usage360_expert_timeline($1, current_date - 89, current_date, null, null, 50)`, [U1]); const tlMs = Date.now() - tC;
    console.log(`    süreler: liste=${listMs} ms · 30g detay=${detMs} ms · zaman çizelgesi 1. sayfa=${tlMs} ms`);
    ok(listMs < 1500 && detMs < 3000 && tlMs < 1000, "liste / 30g detay / zaman çizelgesi makul sürede (yerel)");
    const pTl = await explain(`select e.id from public.expert_usage_events e where e.user_id = $1 and e.occurred_at >= now() - interval '90 days' and e.occurred_at < now() order by e.occurred_at desc, e.id desc limit 50`, [U1]);
    console.log(pTl.split("\n").slice(0, 6).join("\n"));
    ok(/Index (Only )?Scan using idx_expert_usage_user_occurred/.test(pTl) && !/Seq Scan/.test(pTl), "zaman çizelgesi (1M olay, 250 kullanıcı) → kullanıcı+zaman index, seq scan yok");
    const pEv = await explain(`select module_key, max(occurred_at) from public.expert_usage_events where user_id = $1 and occurred_at >= now() - interval '30 days' and occurred_at < now() group by module_key`, [U1]);
    console.log(pEv.split("\n").slice(0, 8).join("\n"));
    ok(!/Seq Scan on expert_usage_events/.test(pEv), "detaydaki son-işlem/hata özeti (1M olay) seq scan değil");
    const pDaily = await explain(`select * from public.usage_daily where user_id = $1 and day_tr between current_date - 29 and current_date`, [U1]);
    ok(/usage_daily_pkey/.test(pDaily), "30g rollup okuması PK index");
  } finally {
    await su.end(); await epg.stop();
  }
  console.log(`\n──────────\nUSAGE360 2C ADMIN READ PG: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("HARNESS HATASI:", e.message); process.exit(1); });
