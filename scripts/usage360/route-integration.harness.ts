/**
 * USAGE360 AŞAMA 2B — DİNAMİK ROUTE ENTEGRASYON HARNESS'İ (gerçek route handler + gerçek PostgreSQL).
 *
 * - Ephemeral yerel PostgreSQL (embedded-postgres, 127.0.0.1) — production'a SIFIR temas.
 * - Gerçek Next route handler'ları supabase-js service-role client ile, test-only PostgREST shim
 *   (scripts/usage360/pgrestShim.ts) üzerinden çalışır. Guard zinciri gerçek: x-user-id +
 *   x-session-token binding, touch_active_session, üyelik + modül kapısı.
 * - Şema: repo migration'ları (oturum/telemetri/refleksoloji/HD/beslenme) + repo dışı (legacy)
 *   tablolar için asgari sentetik DDL (clients, client_sessions, client_analyses, stones).
 * - Tüm veri sentetik; iş gövdelerine SENTINEL_PII_USAGE360_DO_NOT_LEAK konur.
 *
 * Doğrulananlar (modül başına): başarılı create/update/delete → TEK doğru olay; başarısız iş
 * işlemi → başarı olayı YOK; toplu işlem → TEK olay + kova; tekrar/senkron → çift sayım YOK;
 * eski 4 olay → tek satır; bayrak kapalı → yeni olay YOK (eski 5 kolon korunur); admin/demo → yok;
 * tenant spoof → reddedilir; sentinel/ham UUID telemetri tablolarında YOK.
 * Çalıştır: npx tsx scripts/usage360/route-integration.harness.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import Module from "node:module";
import { startPgrestShim } from "./pgrestShim";

// Next.js 'server-only' işaret paketi tsx altında çözülemez → test-only boş stub.
const moduleWithResolve = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const origResolve = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return path.join(process.cwd(), "scripts/usage360/fixtures/server-only-stub.cjs");
  return origResolve.call(this, request, ...rest);
};

process.env.LC_ALL = "C";
process.env.LANG = "C";

const DATA_DIR = path.join(os.tmpdir(), "usage360-2b-route-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz */ }
const PORT = 54347;
const PW = "testpw";
const ROOT = process.cwd();
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const SENTINEL = "SENTINEL_PII_USAGE360_DO_NOT_LEAK";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const BASE_DDL = `
create table public.users (
  id uuid primary key, full_name text, name text, email text, role text,
  active boolean default true, approval_status text default 'approved', approved_at timestamptz,
  module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text,
  trial_started_at timestamptz, trial_ends_at timestamptz, membership_started_at timestamptz, membership_ends_at timestamptz,
  plan text, admin_level text, tenant_id uuid, status text, created_at timestamptz default now(),
  is_super_admin boolean not null default false, is_demo_account boolean not null default false,
  allowed_locations int default 2
);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  session_token text not null unique, is_active boolean not null default true,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz, end_reason text, platform text default 'desktop', city text, country text,
  ip_address text, user_agent text
);
create schema if not exists storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
-- Repo dışı (legacy, dashboard-yönetimli) tablolar: yalnız route'ların kullandığı kolonlar.
create table public.clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, full_name text, phone text, email text, burc text, birth_date date,
  notes text, create_request_id text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index clients_tenant_request_uidx on public.clients (tenant_id, create_request_id) where create_request_id is not null;
create table public.client_sessions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
  session_date date, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.client_analyses (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
  analysis_type text, analysis_data jsonb, note text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.stones (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, stone_name text, short_description text,
  general_info text, source_note text, physical_effects text, spiritual_effects text, other_effects text,
  warning_text text, warning_tags jsonb, feng_shui text, meditation text, care text, application text,
  chakras jsonb, assignments jsonb, images jsonb default '[]'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz
);
create table public.human_design_charts (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid);
create table public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid);
create table public.stone_exclusions (tenant_id uuid, stone_id uuid, excluded_at timestamptz default now());
`;

const TELEMETRY_MIGRATIONS = [
  "20270110000000_expert_stats_session_indexes.sql",
  "20270111000000_user_sessions_client_channel.sql",
  "20270112000000_expert_usage_events.sql",
  "20270115000000_expert_stats_read_rpcs.sql",
  "20270129000200_user_sessions_expiry_touch.sql",
  "20270205000000_usage360_telemetry_core.sql",
];

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U1 = "11111111-1111-4111-8111-111111111101"; // uzman T1 (premium, tüm modüller)
const U2 = "22222222-2222-4222-8222-222222222202"; // uzman T2
const U3 = "33333333-3333-4333-8333-333333333303"; // DEMO uzman T1
const U4 = "44444444-4444-4444-8444-444444444404"; // admin T1
const TOK: Record<string, string> = { [U1]: "zz-u360-tok-u1", [U2]: "zz-u360-tok-u2", [U3]: "zz-u360-tok-u3", [U4]: "zz-u360-tok-u4" };
const ALL_MODULES = { clients: true, numerology: true, stones: true, reflexology: true, human_design: true, beslenme: true, appointments: true };

type Handler = (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function main(): Promise<void> {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  const su = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
  await su.connect();
  const pool = new pg.Pool({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres", max: 24 });
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;

  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
                    grant usage on schema public to anon, authenticated, service_role;
                    alter role service_role bypassrls;`);
    await su.query(BASE_DDL);
    for (const m of TELEMETRY_MIGRATIONS) await su.query(readMig(m));
    await su.query(readMig("20260924200817_reflexology_protocols_baseline_and_uid_unique.sql"));
    await su.query(readMig("20260606140000_human_design_clients.sql"));
    let nutritionReady = true;
    const nutritionMigs = readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => /_nutrition_/.test(f)).sort();
    for (const m of nutritionMigs) {
      try { await su.query(readMig(m)); }
      catch (e) { nutritionReady = false; console.error(`  (beslenme şeması kurulamadı: ${m}: ${(e as Error).message.slice(0, 120)})`); break; }
    }
    // İş tablolarına service_role yetkisi (route'lar service_role ile çalışır). Telemetri
    // tablolarına ASLA doğrudan yetki verilmez (yalnız SECURITY DEFINER RPC).
    await su.query(`grant select, insert, update, delete on public.users, public.user_sessions, public.clients, public.client_sessions,
                      public.client_analyses, public.stones, public.stone_exclusions, public.reflexology_protocols, public.human_design_clients,
                      public.human_design_charts, public.human_design_reports to service_role;`);
    if (nutritionReady) {
      await su.query(`do $$ declare t text; begin
        for t in select tablename from pg_tables where schemaname='public' and tablename like 'nutrition_%' loop
          execute format('grant select, insert, update, delete on public.%I to service_role', t);
        end loop; end $$;`);
    }

    const prem = { package_type: "premium", plan: "premium", membership_status: "active", subscription_status: "active" };
    const mk = (id: string, tenant: string, role: string, demo: boolean) =>
      su.query(`insert into public.users(id, email, role, active, approval_status, tenant_id, is_demo_account, module_permissions, package_type, plan, membership_status, subscription_status)
                values ($1,$2,$3,true,'approved',$4,$5,$6,$7,$8,$9,$10)`,
        [id, `zz.u360.${id.slice(0, 4)}@example.test`, role, tenant, demo, JSON.stringify(ALL_MODULES), prem.package_type, prem.plan, prem.membership_status, prem.subscription_status]);
    await mk(U1, T1, "expert", false);
    await mk(U2, T2, "expert", false);
    await mk(U3, T1, "expert", true);
    await mk(U4, T1, "admin", false);
    for (const [u, t] of Object.entries(TOK)) await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u, t]);

    shim = await startPgrestShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    process.env.USAGE360_ENABLED = "true";
    process.env.USAGE360_HASH_SECRET = "zz-u360-test-secret";
    console.log(`embedded-postgres + PostgREST shim hazır (${shim.url}).`);

    const UA = "Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 YasamSistemiAndroid/2.4.0";
    async function call(h: Handler, method: string, url: string, user: string, body?: unknown, params: Record<string, string> = {}, extraHeaders: Record<string, string> = {}) {
      const headers: Record<string, string> = { "x-user-id": user, "x-session-token": TOK[user], "user-agent": UA, "x-vercel-ip-country": "TR", "x-vercel-ip-city": encodeURIComponent("Şanlıurfa"), ...extraHeaders };
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const res = await h(req, { params: Promise.resolve(params) });
      let json: unknown = null;
      try { json = await res.clone().json(); } catch { /* ikili yanıt */ }
      return { status: res.status, json: json as Record<string, unknown> | null };
    }
    const settle = () => new Promise((r) => setTimeout(r, 60));
    type Ev = { module_key: string; action: string | null; sub_entity: string | null; event_type: string | null; item_count_bucket: string | null; channel: string | null; source: string | null; error_class: string | null; failed_action: string | null };
    const events = async (module: string): Promise<Ev[]> =>
      (await su.query(`select module_key, action, sub_entity, event_type, item_count_bucket, channel, source, error_class, failed_action from public.expert_usage_events where module_key=$1 order by occurred_at, created_at`, [module])).rows;
    const count = async (module: string, action: string, sub?: string) =>
      (await events(module)).filter((e) => e.action === action && (sub === undefined || e.sub_entity === sub)).length;

    // ── DANIŞAN YOLCULUĞU ────────────────────────────────────────────────────────
    console.log("\n[clients] Danışan Yolculuğu");
    const clientsRoute = await import("../../app/api/clients/route");
    const sessionsRoute = await import("../../app/api/clients/[id]/sessions/route");
    const analysesRoute = await import("../../app/api/clients/[id]/analyses/route");
    const reqId = randomUUID();
    const c1 = await call(clientsRoute.POST as unknown as Handler, "POST", "/api/clients", U1, { full_name: `${SENTINEL} Danışan`, notes: SENTINEL, request_id: reqId });
    const clientId = String((c1.json?.client as { id?: string } | undefined)?.id ?? (c1.json?.data as { id?: string } | undefined)?.id ?? (c1.json?.id ?? ""));
    ok(c1.status === 200 || c1.status === 201, `danışan oluştur → ${c1.status}`);
    ok(await count("clients", "record_created", "client") === 1, "danışan create → 1 record_created:client");
    const c1b = await call(clientsRoute.POST as unknown as Handler, "POST", "/api/clients", U1, { full_name: `${SENTINEL} Danışan`, notes: SENTINEL, request_id: reqId });
    ok((c1b.status === 200 || c1b.status === 201) && await count("clients", "record_created", "client") === 1, "aynı request_id tekrarı (çift tık) → ek olay YOK");
    const s1 = await call(sessionsRoute.POST as unknown as Handler, "POST", `/api/clients/${clientId}/sessions`, U1, { notes: SENTINEL, session_date: "2026-09-28" }, { id: clientId });
    const sessId = String((s1.json?.session as { id?: string } | undefined)?.id ?? (s1.json?.data as { id?: string } | undefined)?.id ?? s1.json?.id ?? "");
    ok(s1.status < 300 && await count("clients", "record_created", "session") === 1, `seans create (${s1.status}) → 1 record_created:session`);
    const s2 = await call(sessionsRoute.PATCH as unknown as Handler, "PATCH", `/api/clients/${clientId}/sessions`, U1, { id: sessId, notes: `${SENTINEL} güncel` }, { id: clientId });
    ok(s2.status < 300 && await count("clients", "record_updated", "session") === 1, `seans update (${s2.status}) → 1 record_updated:session`);
    const s3 = await call(sessionsRoute.DELETE as unknown as Handler, "DELETE", `/api/clients/${clientId}/sessions?id=${sessId}`, U1, { id: sessId }, { id: clientId });
    ok(s3.status < 300 && await count("clients", "record_deleted", "session") === 1, `seans delete (${s3.status}) → 1 record_deleted:session`);
    const s4 = await call(sessionsRoute.DELETE as unknown as Handler, "DELETE", `/api/clients/${clientId}/sessions?id=${sessId}`, U1, { id: sessId }, { id: clientId });
    ok(await count("clients", "record_deleted", "session") === 1, `aynı seansı tekrar silme (${s4.status}) → ek olay YOK (0 satır)`);
    const badSess = await call(sessionsRoute.POST as unknown as Handler, "POST", `/api/clients/${randomUUID()}/sessions`, U1, { notes: "x" }, { id: randomUUID() });
    ok(badSess.status >= 400 && await count("clients", "record_created", "session") === 1, `başka/bilinmeyen danışan (IDOR) (${badSess.status}) → olay YOK`);
    const a1 = await call(analysesRoute.POST as unknown as Handler, "POST", `/api/clients/${clientId}/analyses`, U1, { analysis_type: "cakra", analysis_data: { t: SENTINEL }, note: SENTINEL }, { id: clientId });
    const analysisEvents = (await events("clients")).filter((e) => e.action === "analysis_run");
    ok(a1.status < 300 && analysisEvents.length === 1 && analysisEvents[0].event_type === "analysis_created", `[26] danışan analizi → TEK satır (eski adaptör + yeni yol çift yazmaz; event_type korunur)`);
    ok(analysisEvents[0]?.channel === "android_app", "kanal Android soneki ile android_app");
    // Başarısız iş işlemi: tabloyu geçici kilitle → insert hata → başarı olayı YOK, hata olayı VAR.
    await su.query(`revoke insert on public.client_sessions from service_role`);
    const sFail = await call(sessionsRoute.POST as unknown as Handler, "POST", `/api/clients/${clientId}/sessions`, U1, { notes: "x" }, { id: clientId });
    await settle();
    await su.query(`grant insert on public.client_sessions to service_role`);
    const failEv = (await events("clients")).filter((e) => e.action === "action_failed");
    ok(sFail.status >= 500 && await count("clients", "record_created", "session") === 1, `create hatası (${sFail.status}) → record_created YOK`);
    ok(failEv.length === 1 && failEv[0].error_class === "server" && failEv[0].failed_action === "record_created" && failEv[0].sub_entity === "session", "create hatası → tek action_failed(server, record_created, session)");

    // ── REFLEKSOLOJİ (senkron şişmesi) ───────────────────────────────────────────
    console.log("\n[reflexology] localStorage-senkron çift sayım koruması");
    const protocolsRoute = await import("../../app/api/refleksoloji/protocols/route");
    const byUidRoute = await import("../../app/api/refleksoloji/protocols/by-uid/[uid]/route");
    const uid = `zz-u360-${randomUUID()}`;
    const proto = { source_uid: uid, title: `${SENTINEL} protokol`, target_problem: SENTINEL, organs: "Karaciğer", application_notes: SENTINEL, raw_json: { updatedAt: "2026-09-28T10:00:00Z", items: [1, 2] } };
    const p1 = await call(protocolsRoute.POST as unknown as Handler, "POST", "/api/refleksoloji/protocols", U1, proto);
    ok(p1.status < 300 && await count("reflexology", "record_created", "protocol") === 1, `yeni protokol (${p1.status}) → 1 record_created`);
    for (let i = 0; i < 3; i++) await call(protocolsRoute.POST as unknown as Handler, "POST", "/api/refleksoloji/protocols", U1, proto);
    ok(await count("reflexology", "record_created", "protocol") === 1 && await count("reflexology", "record_updated", "protocol") === 0, "aynı source_uid 3× arka plan senkronu → ek olay YOK");
    const put1 = await call(byUidRoute.PUT as unknown as Handler, "PUT", `/api/refleksoloji/protocols/by-uid/${uid}`, U1,
      { title: proto.title, target_problem: proto.target_problem, organs: proto.organs, application_notes: proto.application_notes, raw_json: { ...proto.raw_json, updatedAt: "2026-09-28T10:05:00Z" }, expected_updated_at: "2026-09-28T10:00:00Z" }, { uid });
    ok(put1.status < 300 && await count("reflexology", "record_updated", "protocol") === 0, `aynı içerik yeniden kayıt (yalnız updatedAt farklı) (${put1.status}) → olay YOK`);
    const put2 = await call(byUidRoute.PUT as unknown as Handler, "PUT", `/api/refleksoloji/protocols/by-uid/${uid}`, U1,
      { title: proto.title, target_problem: proto.target_problem, organs: "Karaciğer, Böbrek", application_notes: proto.application_notes, raw_json: { ...proto.raw_json, updatedAt: "2026-09-28T10:10:00Z" }, expected_updated_at: "2026-09-28T10:05:00Z" }, { uid });
    ok(put2.status < 300 && await count("reflexology", "record_updated", "protocol") === 1, `gerçek içerik değişikliği (${put2.status}) → 1 record_updated`);
    const del1 = await call(byUidRoute.DELETE as unknown as Handler, "DELETE", `/api/refleksoloji/protocols/by-uid/${uid}`, U1, undefined, { uid });
    const del2 = await call(byUidRoute.DELETE as unknown as Handler, "DELETE", `/api/refleksoloji/protocols/by-uid/${uid}`, U1, undefined, { uid });
    ok(del1.status < 300 && del2.status < 300 && await count("reflexology", "record_deleted", "protocol") === 1, "silme + tekrar silme senkronu → 1 record_deleted");

    // ── DOĞALTAŞ ────────────────────────────────────────────────────────────────
    console.log("\n[stones] Doğaltaş");
    const stonesRoute = await import("../../app/api/dogaltas/stones/route");
    const stoneIdRoute = await import("../../app/api/dogaltas/stones/[id]/route");
    const bulkRoute = await import("../../app/api/dogaltas/stones/bulk-delete/route");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await call(stonesRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones", U1, { stone_name: `${SENTINEL} taş ${i}`, general_info: SENTINEL });
      ids.push(String(r.json?.id ?? ""));
    }
    const stoneCreated = (await events("stones")).filter((e) => e.action === "record_created");
    ok(stoneCreated.length === 4 && stoneCreated.every((e) => e.event_type === "record_created" && e.sub_entity === "stone"), "[26] 4 taş → 4 record_created (eski+yeni çift yazım yok)");
    const pUp = await call(stoneIdRoute.PATCH as unknown as Handler, "PATCH", `/api/dogaltas/stones/${ids[0]}`, U1, { general_info: `${SENTINEL} güncel` }, { id: ids[0] });
    ok(pUp.status < 300 && await count("stones", "record_updated", "stone") === 1, `taş update (${pUp.status}) → 1 record_updated`);
    const bulk = await call(bulkRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones/bulk-delete", U1, { ids: ids.slice(0, 3) });
    const bulkEv = (await events("stones")).filter((e) => e.action === "record_deleted");
    ok(bulk.status < 300 && bulkEv.length === 1 && bulkEv[0].item_count_bucket === "2-10", `toplu silme 3 taş (${bulk.status}) → TEK record_deleted + kova 2-10`);
    // Admin kütüphane aktarımı (arka plan): doğrudan DB'ye aktarım satırı → kullanım olayı YOK.
    const before = (await events("stones")).length;
    await su.query(`insert into public.stones(tenant_id, stone_name, origin_transfer_batch_id, transferred_at) values ($1,'aktarım',$2, now())`, [T1, randomUUID()]);
    ok((await events("stones")).length === before, "admin kütüphane aktarımı satırı → kullanım olayı YOK");
    const modulesCount = Number((await su.query(`select count(*) c from public.stones where tenant_id=$1 and origin_transfer_batch_id is null and (origin_type is null or origin_type <> 'admin_transfer')`, [T1])).rows[0].c);
    ok(modulesCount === 1, `mevcut kayıt sayımı aktarım satırını dışlar (uzmanın kendi taşı: ${modulesCount})`);

    // ── HUMAN DESIGN ────────────────────────────────────────────────────────────
    console.log("\n[human_design] HD danışanları");
    const hdClientsRoute = await import("../../app/api/hd/clients/route");
    const h1 = await call(hdClientsRoute.POST as unknown as Handler, "POST", "/api/hd/clients", U1, { name: `${SENTINEL} HD`, notes: SENTINEL, birth_date: "1990-01-01" });
    const hdId = String(h1.json?.id ?? (h1.json?.client as { id?: string } | undefined)?.id ?? "");
    ok(h1.status < 300 && await count("human_design", "record_created", "client") === 1, `HD danışan create (${h1.status}) → 1 record_created:client`);
    const h2 = await call(hdClientsRoute.PATCH as unknown as Handler, "PATCH", `/api/hd/clients?id=${hdId}`, U1, { id: hdId, notes: `${SENTINEL} yeni` });
    ok(h2.status < 300 && await count("human_design", "record_updated", "client") === 1, `HD danışan update (${h2.status}) → 1 record_updated`);
    const h3 = await call(hdClientsRoute.DELETE as unknown as Handler, "DELETE", `/api/hd/clients?id=${hdId}`, U1, { id: hdId });
    ok(h3.status < 300 && await count("human_design", "record_deleted", "client") === 1, `HD danışan delete (${h3.status}) → 1 record_deleted`);
    const hBad = await call(hdClientsRoute.POST as unknown as Handler, "POST", "/api/hd/clients", U1, { notes: "isim yok" });
    ok(hBad.status === 400 && await count("human_design", "record_created", "client") === 1 && await count("human_design", "action_failed") === 0, "doğrulama hatası (400) → ne başarı ne hata olayı");

    // ── BESLENME ────────────────────────────────────────────────────────────────
    console.log("\n[beslenme] plan create / update / delete");
    ok(nutritionReady, "beslenme şeması repo migration'larından kuruldu");
    if (nutritionReady) {
      const plansRoute = await import("../../app/api/beslenme/plans/route");
      const planIdRoute = await import("../../app/api/beslenme/plans/[id]/route");
      const b1 = await call(plansRoute.POST as unknown as Handler, "POST", "/api/beslenme/plans", U1, { title: `${SENTINEL} plan`, start_date: "2026-10-01", end_date: "2026-10-03" });
      const planId = String((b1.json?.plan as { id?: string } | undefined)?.id ?? b1.json?.id ?? "");
      ok(b1.status < 300 && await count("beslenme", "record_created", "plan") === 1, `plan create (${b1.status}) → 1 record_created:plan`);
      const b2 = await call(planIdRoute.PATCH as unknown as Handler, "PATCH", `/api/beslenme/plans/${planId}`, U1, { title: `${SENTINEL} plan 2` }, { id: planId });
      ok(b2.status < 300 && await count("beslenme", "record_updated", "plan") === 1, `plan update (${b2.status}) → 1 record_updated:plan`);
      const bBad = await call(plansRoute.POST as unknown as Handler, "POST", "/api/beslenme/plans", U1, { title: "x", start_date: "2026-10-05", end_date: "2026-10-01" });
      ok(bBad.status === 400 && await count("beslenme", "record_created", "plan") === 1, "geçersiz aralık (400) → olay YOK");
      const b3 = await call(planIdRoute.DELETE as unknown as Handler, "DELETE", `/api/beslenme/plans/${planId}`, U1, undefined, { id: planId });
      ok(b3.status < 300 && await count("beslenme", "record_deleted", "plan") === 1, `plan delete (gerçek silme) (${b3.status}) → 1 record_deleted:plan`);
      ok(!(await events("beslenme")).some((e) => /archiv/.test(String(e.action) + String(e.sub_entity))), "arşiv olayı ÜRETİLMEZ");
    }

    // ── ADMIN / DEMO / TENANT SPOOF ─────────────────────────────────────────────
    console.log("\n[16-17 / 15] admin, demo, spoof");
    const beforeAll = Number((await su.query(`select count(*) c from public.expert_usage_events`)).rows[0].c);
    await call(stonesRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones", U4, { stone_name: "admin taşı" });
    await call(stonesRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones", U3, { stone_name: "demo taşı" });
    ok(Number((await su.query(`select count(*) c from public.expert_usage_events`)).rows[0].c) === beforeAll, "admin ve demo işlemleri → olay YOK");
    const spoof = await call(stonesRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones", U1, { stone_name: "spoof", tenant_id: T2, user_id: U2 }, {}, { "x-user-id": U2 });
    ok(spoof.status >= 400, `başka kullanıcının kimliğiyle (U1 token + U2 x-user-id) → reddedilir (${spoof.status})`);
    ok(Number((await su.query(`select count(*) c from public.expert_usage_events where user_id=$1 or tenant_id=$2`, [U2, T2])).rows[0].c) === 0, "U2/T2 adına hiçbir olay yazılmadı");
    const tSpoof = await call(stonesRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones", U1, { stone_name: "tenant spoof", tenant_id: T2 });
    const lastTenant = (await su.query(`select tenant_id from public.expert_usage_events order by created_at desc limit 1`)).rows[0].tenant_id;
    ok(tSpoof.status < 300 && lastTenant === T1, "gövdedeki tenant_id yok sayılır → olay guard tenant'ına (T1) yazılır");

    // ── BAYRAK KAPALI ───────────────────────────────────────────────────────────
    console.log("\n[27] USAGE360_ENABLED kapalı");
    process.env.USAGE360_ENABLED = "false";
    const nBefore = Number((await su.query(`select count(*) c from public.expert_usage_events where action is not null`)).rows[0].c);
    const vBefore = Number((await su.query(`select count(*) c from public.usage_visits`)).rows[0].c);
    const off1 = await call(sessionsRoute.POST as unknown as Handler, "POST", `/api/clients/${clientId}/sessions`, U1, { notes: "kapalı" }, { id: clientId });
    const off2 = await call(stonesRoute.POST as unknown as Handler, "POST", "/api/dogaltas/stones", U1, { stone_name: "kapalı taş" });
    ok(off1.status < 300 && off2.status < 300, "iş işlemleri bayrak kapalıyken normal çalışır");
    ok(Number((await su.query(`select count(*) c from public.expert_usage_events where action is not null`)).rows[0].c) === nBefore, "bayrak kapalı → yeni Usage360 olayı YOK");
    ok(Number((await su.query(`select count(*) c from public.usage_visits`)).rows[0].c) === vBefore, "bayrak kapalı → ziyaret/rollup yazımı YOK");
    const legacy = (await su.query(`select * from public.expert_usage_events where action is null order by created_at desc limit 1`)).rows[0] as Record<string, unknown> | undefined;
    ok(!!legacy && legacy.module_key === "stones" && legacy.event_type === "record_created" && legacy.source === null && /^[0-9a-f]{64}$/.test(String(legacy.idempotency_key)), "eski 4 olaydan taş create → eski 5 kolonlu satır (geriye-uyum), idem HMAC");
    process.env.USAGE360_ENABLED = "true";

    // ── [30] SENTINEL / HAM UUID ─────────────────────────────────────────────────
    console.log("\n[30] sentinel + ham UUID + hata mesajı sızıntısı");
    const dump = (await su.query(`select
        coalesce((select string_agg(row_to_json(e)::text, '') from public.expert_usage_events e), '') ||
        coalesce((select string_agg(row_to_json(v)::text, '') from public.usage_visits v), '') ||
        coalesce((select string_agg(row_to_json(d)::text, '') from public.usage_daily d), '') ||
        coalesce((select string_agg(row_to_json(m)::text, '') from public.usage_daily_modules m), '') t`)).rows[0].t as string;
    ok(dump.length > 0 && !dump.includes(SENTINEL) && !dump.includes("SENTINEL"), "telemetri tablolarında sentinel YOK");
    const businessIds = [clientId, sessId, ...ids, hdId].filter((x) => /^[0-9a-f-]{36}$/.test(x));
    ok(businessIds.length >= 5 && businessIds.every((id) => !dump.includes(id)), `ham kayıt UUID'leri (${businessIds.length}) telemetride düz metin YOK`);
    ok(!dump.includes(uid) && !/permission denied|violates|duplicate key/i.test(dump), "source_uid / DB hata mesajı telemetride YOK");
    ok(!dump.includes("Karaciğer") && !dump.includes("Danışan"), "iş içeriği (organ/ad) telemetride YOK");
    const city = (await su.query(`select distinct city from public.usage_visits`)).rows.map((r) => r.city);
    ok(city.includes("Şanlıurfa"), `[28] ziyaret şehri Türkçe korunur (${city.join(",")})`);
    ok(shim.stats.unsupported.length === 0, `shim: desteklenmeyen PostgREST kalıbı yok (${shim.stats.unsupported.slice(0, 3).join(" | ")})`);
  } finally {
    try { await shim?.close(); } catch { /* */ }
    await pool.end();
    await su.end();
    await epg.stop();
  }
  console.log(`\n──────────\nUSAGE360 ROUTE INTEGRATION: PASS ${pass} · FAIL ${fail}`);
  if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("HARNESS HATASI:", e); process.exit(1); });
